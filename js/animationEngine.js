/**
 * PixelForge Studio — Stage 5: Animation Timeline, Baseline Aligner & Sprite Sheet Exporter
 * Implements:
 * - sliceHorizontalStrip
 * - alignFrameBaselines (Foot-Baseline Anchor + Horizontal Center-of-Mass Stabilization)
 * - Paper-Doll Modular Slicer (using Stage 2 Mannequin Color-ID mask + procedural 1-2px bobbing idle loop)
 * - packSpriteSheet & generateAtlasJson (Godot / Phaser / Aseprite compatible)
 */

import { hexToRgb } from "./palettes.js";
import { MANNEQUIN_COLORS } from "./mannequin.js";

/**
 * Slice a horizontal strip ImageData into N equal-width frames
 */
export function sliceHorizontalStrip(stripImageData, frameCount) {
  const count = Math.max(1, Math.floor(frameCount));
  const frameW = Math.floor(stripImageData.width / count);
  const frameH = stripImageData.height;
  const src = stripImageData.data;
  const totalW = stripImageData.width;

  const frames = [];
  for (let f = 0; f < count; f++) {
    const frameData = new ImageData(frameW, frameH);
    const dst = frameData.data;
    const startX = f * frameW;

    for (let y = 0; y < frameH; y++) {
      for (let x = 0; x < frameW; x++) {
        const sIdx = (y * totalW + (startX + x)) * 4;
        const dIdx = (y * frameW + x) * 4;
        dst[dIdx] = src[sIdx];
        dst[dIdx + 1] = src[sIdx + 1];
        dst[dIdx + 2] = src[sIdx + 2];
        dst[dIdx + 3] = src[sIdx + 3];
      }
    }
    frames.push(frameData);
  }
  return frames;
}

/**
 * Scan an ImageData frame to compute:
 * - minX, maxX, minY, maxY (lowest opaque foot pixel)
 * - centerOfMassX, centerOfMassY
 * - opaquePixelCount
 */
export function analyzeFrameMetrics(imageData) {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;

  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (data[idx + 3] >= 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  if (count === 0) {
    return {
      isEmpty: true,
      minX: 0,
      maxX: w - 1,
      minY: 0,
      maxY: Math.floor(h * 0.88),
      centerOfMassX: Math.floor(w * 0.5),
      centerOfMassY: Math.floor(h * 0.5),
      opaqueCount: 0
    };
  }

  return {
    isEmpty: false,
    minX,
    maxX,
    minY,
    maxY, // Lowest opaque pixel (Foot Baseline)
    centerOfMassX: Math.round(sumX / count),
    centerOfMassY: Math.round(sumY / count),
    opaqueCount: count
  };
}

/**
 * Shift an ImageData buffer by integer (dx, dy) pixels
 */
export function translateImageData(srcImageData, dx, dy) {
  const w = srcImageData.width;
  const h = srcImageData.height;
  const src = srcImageData.data;
  const out = new ImageData(w, h);
  const dst = out.data;

  const shiftX = Math.round(dx);
  const shiftY = Math.round(dy);

  for (let y = 0; y < h; y++) {
    const sy = y - shiftY;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < w; x++) {
      const sx = x - shiftX;
      if (sx < 0 || sx >= w) continue;
      const sIdx = (sy * w + sx) * 4;
      const dIdx = (y * w + x) * 4;
      dst[dIdx] = src[sIdx];
      dst[dIdx + 1] = src[sIdx + 1];
      dst[dIdx + 2] = src[sIdx + 2];
      dst[dIdx + 3] = src[sIdx + 3];
    }
  }
  return out;
}

/**
 * Foot-Baseline Anchor & Center-of-Mass Aligner
 * Scans the lowest opaque pixel (max Y) and horizontal center-of-mass of every frame,
 * snapping all frames to a unified ground baseline (targetBaselineY) and optional horizontal center.
 *
 * @param {Array<ImageData>} frames - Array of frame ImageData objects
 * @param {object} options - { targetBaselineY, alignHorizontalCenter }
 * @returns {{ alignedFrames: Array<ImageData>, telemetry: Array<object>, baselineY: number }}
 */
export function alignFrameBaselines(frames, options = {}) {
  if (!frames || frames.length === 0) {
    return { alignedFrames: [], telemetry: [], baselineY: 0 };
  }

  const w = frames[0].width;
  const h = frames[0].height;
  const targetBaselineY =
    typeof options.targetBaselineY === "number"
      ? options.targetBaselineY
      : Math.floor(h * 0.88);
  const alignHorizontalCenter =
    typeof options.alignHorizontalCenter === "boolean" ? options.alignHorizontalCenter : true;
  const targetCenterX = Math.floor(w * 0.5);

  const alignedFrames = [];
  const telemetry = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const metrics = analyzeFrameMetrics(frame);
    const dy = metrics.isEmpty ? 0 : targetBaselineY - metrics.maxY;
    const dx =
      metrics.isEmpty || !alignHorizontalCenter ? 0 : targetCenterX - metrics.centerOfMassX;

    const shifted = translateImageData(frame, dx, dy);
    alignedFrames.push(shifted);

    telemetry.push({
      frameIndex: i,
      originalMaxY: metrics.maxY,
      originalComX: metrics.centerOfMassX,
      appliedDx: dx,
      appliedDy: dy,
      newBaselineY: metrics.maxY + dy
    });
  }

  return {
    alignedFrames,
    telemetry,
    baselineY: targetBaselineY
  };
}

/**
 * Paper-Doll Modular Slicer (Bonus Tool)
 * Uses the Stage 2 Mannequin Color-ID mask to segment a static sprite into modular anatomical layers:
 * - Head (#FF5555)
 * - Torso (#55FF55)
 * - Arms + Weapon (#5555FF, #FFFF55, #FFFFFF)
 * - Legs (#FF55FF, #55FFFF)
 * For sprite pixels that extend slightly outside the mannequin silhouette (e.g. helmet plume, cape, sword tip),
 * assigns each opaque sprite pixel to the nearest mannequin Color-ID pixel via Voronoi/BFS distance!
 * Then generates a 4-frame procedural 1-2px vertical bobbing idle animation where legs stay grounded!
 */
export function generatePaperDollIdleFrames(spriteImageData, mannequinMaskImageData) {
  const w = spriteImageData.width;
  const h = spriteImageData.height;
  const sprite = spriteImageData.data;
  const mask = mannequinMaskImageData.data;

  // Part IDs: 1 = HEAD, 2 = TORSO, 3 = ARMS_WEAPON, 4 = LEGS
  const partMap = new Uint8Array(w * h);

  const cHead = hexToRgb(MANNEQUIN_COLORS.HEAD);
  const cTorso = hexToRgb(MANNEQUIN_COLORS.TORSO);
  const cFArm = hexToRgb(MANNEQUIN_COLORS.FRONT_ARM);
  const cBArm = hexToRgb(MANNEQUIN_COLORS.BACK_ARM);
  const cWeap = hexToRgb(MANNEQUIN_COLORS.WEAPON);
  const cFLeg = hexToRgb(MANNEQUIN_COLORS.FRONT_LEG);
  const cBLeg = hexToRgb(MANNEQUIN_COLORS.BACK_LEG);

  const matchColor = (r, g, b, target) =>
    Math.abs(r - target.r) < 25 && Math.abs(g - target.g) < 25 && Math.abs(b - target.b) < 25;

  const seedPoints = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = mask[idx];
      const g = mask[idx + 1];
      const b = mask[idx + 2];
      if (r < 20 && g < 20 && b < 20) continue; // Black background

      let partId = 0;
      if (matchColor(r, g, b, cHead)) partId = 1;
      else if (matchColor(r, g, b, cTorso)) partId = 2;
      else if (matchColor(r, g, b, cFArm) || matchColor(r, g, b, cBArm) || matchColor(r, g, b, cWeap))
        partId = 3;
      else if (matchColor(r, g, b, cFLeg) || matchColor(r, g, b, cBLeg)) partId = 4;

      if (partId > 0) {
        partMap[y * w + x] = partId;
        seedPoints.push({ x, y, partId });
      }
    }
  }

  // Create separate layer buffers for Head, Torso, Arms/Weapon, and Legs
  const layers = {
    head: new ImageData(w, h),
    torso: new ImageData(w, h),
    arms: new ImageData(w, h),
    legs: new ImageData(w, h)
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (sprite[idx + 3] < 128) continue;

      let partId = partMap[y * w + x];
      if (partId === 0 && seedPoints.length > 0) {
        // Find nearest mannequin Color-ID seed pixel so plumes, capes, and swords attach to their host limb
        let minDistSq = Infinity;
        let bestPart = 2;
        for (let s = 0; s < seedPoints.length; s++) {
          const sp = seedPoints[s];
          const dx = x - sp.x;
          const dy = y - sp.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            bestPart = sp.partId;
          }
        }
        partId = bestPart;
      }

      const targetLayer =
        partId === 1
          ? layers.head.data
          : partId === 2
          ? layers.torso.data
          : partId === 3
          ? layers.arms.data
          : layers.legs.data;

      targetLayer[idx] = sprite[idx];
      targetLayer[idx + 1] = sprite[idx + 1];
      targetLayer[idx + 2] = sprite[idx + 2];
      targetLayer[idx + 3] = 255;
    }
  }

  // Composite helper (painter's order: legs -> torso -> arms -> head)
  const compositeWithOffsets = (offsets) => {
    const out = new ImageData(w, h);
    const dst = out.data;

    const blitLayer = (layerData, dx, dy) => {
      const src = layerData.data;
      for (let y = 0; y < h; y++) {
        const sy = y - dy;
        if (sy < 0 || sy >= h) continue;
        for (let x = 0; x < w; x++) {
          const sx = x - dx;
          if (sx < 0 || sx >= w) continue;
          const sIdx = (sy * w + sx) * 4;
          if (src[sIdx + 3] >= 128) {
            const dIdx = (y * w + x) * 4;
            dst[dIdx] = src[sIdx];
            dst[dIdx + 1] = src[sIdx + 1];
            dst[dIdx + 2] = src[sIdx + 2];
            dst[dIdx + 3] = 255;
          }
        }
      }
    };

    // Legs remain planted on the ground baseline (dy = 0)
    blitLayer(layers.legs, 0, offsets.legsY);
    blitLayer(layers.torso, 0, offsets.torsoY);
    blitLayer(layers.arms, offsets.armsX, offsets.armsY);
    blitLayer(layers.head, 0, offsets.headY);

    return out;
  };

  // 4-frame classic RPG idle breathing/bobbing cycle (1-2px offsets with secondary motion lag)
  const frameConfigs = [
    { name: "Idle 1 (Neutral)", legsY: 0, torsoY: 0, armsX: 0, armsY: 0, headY: 0 },
    { name: "Idle 2 (Inhale Dip)", legsY: 0, torsoY: 1, armsX: 0, armsY: 1, headY: 1 },
    { name: "Idle 3 (Deep Crouch)", legsY: 0, torsoY: 1, armsX: 0, armsY: 2, headY: 2 },
    { name: "Idle 4 (Exhale Rise)", legsY: 0, torsoY: 0, armsX: 0, armsY: 1, headY: 1 }
  ];

  const frames = frameConfigs.map((cfg) => compositeWithOffsets(cfg));
  return {
    frames,
    layers
  };
}

/**
 * Pack an array of native-resolution ImageData frames into a packed Sprite Sheet ImageData
 * and compute frame coordinates for JSON Atlas export.
 *
 * @param {Array<ImageData>} frames
 * @param {number} columns - Number of columns per row
 * @param {number} padding - Pixel padding between frames
 * @param {number} baselineY - Ground baseline Y coordinate for pivot metadata
 */
export function packSpriteSheet(frames, columns = 4, padding = 2, baselineY = 56) {
  if (!frames || frames.length === 0) {
    return {
      sheetImageData: new ImageData(1, 1),
      frameRects: [],
      sheetWidth: 1,
      sheetHeight: 1
    };
  }

  const count = frames.length;
  const cols = Math.max(1, Math.min(count, Math.floor(columns)));
  const rows = Math.ceil(count / cols);
  const fw = frames[0].width;
  const fh = frames[0].height;
  const pad = Math.max(0, Math.floor(padding));

  const sheetWidth = cols * fw + (cols + 1) * pad;
  const sheetHeight = rows * fh + (rows + 1) * pad;
  const sheetImageData = new ImageData(sheetWidth, sheetHeight);
  const dst = sheetImageData.data;

  const frameRects = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const destX = pad + col * (fw + pad);
    const destY = pad + row * (fh + pad);

    const src = frames[i].data;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const sIdx = (y * fw + x) * 4;
        const dIdx = ((destY + y) * sheetWidth + (destX + x)) * 4;
        dst[dIdx] = src[sIdx];
        dst[dIdx + 1] = src[sIdx + 1];
        dst[dIdx + 2] = src[sIdx + 2];
        dst[dIdx + 3] = src[sIdx + 3];
      }
    }

    const metrics = analyzeFrameMetrics(frames[i]);
    frameRects.push({
      index: i,
      name: `sprite_frame_${String(i).padStart(2, "0")}`,
      x: destX,
      y: destY,
      w: fw,
      h: fh,
      pivot: {
        x: Number((0.5).toFixed(3)),
        y: Number((baselineY / fh).toFixed(3)),
        pixelX: Math.floor(fw * 0.5),
        pixelY: baselineY
      },
      bounds: {
        minX: metrics.minX,
        minY: metrics.minY,
        maxX: metrics.maxX,
        maxY: metrics.maxY
      }
    });
  }

  return {
    sheetImageData,
    frameRects,
    sheetWidth,
    sheetHeight
  };
}

/**
 * Generate companion JSON Atlas compatible with Godot / Phaser 3 / Aseprite
 */
export function generateSpriteSheetAtlasJson(packedInfo, animConfig = {}) {
  const { frameRects, sheetWidth, sheetHeight } = packedInfo;
  const {
    imageFilename = "pixelforge_spritesheet.png",
    fps = 8,
    loopMode = "forward",
    tagName = "idle_or_walk",
    perspective = "Isometric (30° / 2:1)",
    frameTags = null
  } = animConfig;

  const durationMs = Math.round(1000 / Math.max(1, fps));
  const framesHash = {};

  frameRects.forEach((fr) => {
    framesHash[fr.name] = {
      frame: { x: fr.x, y: fr.y, w: fr.w, h: fr.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: fr.w, h: fr.h },
      sourceSize: { w: fr.w, h: fr.h },
      pivot: { x: fr.pivot.x, y: fr.pivot.y },
      footBaselinePixel: { x: fr.pivot.pixelX, y: fr.pivot.pixelY },
      duration: durationMs
    };
  });

  const resolvedFrameTags = Array.isArray(frameTags) && frameTags.length > 0
    ? frameTags
    : [
        {
          name: tagName,
          from: 0,
          to: Math.max(0, frameRects.length - 1),
          direction: loopMode,
          fps
        }
      ];

  return JSON.stringify(
    {
      frames: framesHash,
      meta: {
        app: "PixelForge Studio — 5-Stage Deterministic Pixel Pipeline",
        version: "1.0.0",
        image: imageFilename,
        format: "RGBA8888",
        perspective,
        size: { w: sheetWidth, h: sheetHeight },
        scale: "1",
        frameTags: resolvedFrameTags
      }
    },
    null,
    2
  );
}


/**
 * Smart Character Segment Detector & Aspect-Preserving Frame Normalizer
 * Handles widescreen (e.g. 16:9 1024x571 from Nano Banana) or multi-character images by:
 * 1. Sampling the background color at (0,0) (typically #FF00FF magenta)
 * 2. Detecting contiguous horizontal character segments separated by background gaps
 * 3. Extracting each character into an aspect-ratio-preserved high-res frame matching
 *    (nativeW : nativeH) with feet anchored near 88% height and zero distortion!
 */
export function detectAndNormalizeCharacters(rawImageData, nativeW = 64, nativeH = 64) {
  const w = rawImageData.width;
  const h = rawImageData.height;
  const src = rawImageData.data;

  // Sample top-left pixel (0,0) as background reference
  const bgR = src[0];
  const bgG = src[1];
  const bgB = src[2];
  const thresholdSq = 75 * 75;

  const isForeground = (x, y) => {
    const idx = (y * w + x) * 4;
    if (src[idx + 3] < 128) return false;
    const dr = src[idx] - bgR;
    const dg = src[idx + 1] - bgG;
    const db = src[idx + 2] - bgB;
    return dr * dr + dg * dg + db * db > thresholdSq;
  };

  // Scan columns for foreground activity
  const colHasFg = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    let fgCount = 0;
    for (let y = 0; y < h; y++) {
      if (isForeground(x, y)) {
        fgCount++;
        if (fgCount >= 3) {
          colHasFg[x] = 1;
          break;
        }
      }
    }
  }

  // Group contiguous foreground columns (bridging tiny 1-3px gaps within a single character)
  const rawSegments = [];
  let inSeg = false;
  let segStart = 0;
  let gapCount = 0;
  const maxInternalGap = Math.max(2, Math.floor(w * 0.005));

  for (let x = 0; x < w; x++) {
    if (colHasFg[x]) {
      if (!inSeg) {
        inSeg = true;
        segStart = x;
      }
      gapCount = 0;
    } else if (inSeg) {
      gapCount++;
      if (gapCount > maxInternalGap) {
        const segEnd = x - gapCount;
        if (segEnd - segStart >= Math.max(12, Math.floor(w * 0.03))) {
          rawSegments.push({ minX: segStart, maxX: segEnd });
        }
        inSeg = false;
        gapCount = 0;
      }
    }
  }
  if (inSeg) {
    const segEnd = w - 1 - gapCount;
    if (segEnd - segStart >= Math.max(12, Math.floor(w * 0.03))) {
      rawSegments.push({ minX: segStart, maxX: segEnd });
    }
  }

  // Fallback if no segments detected: treat entire image as 1 segment
  if (rawSegments.length === 0) {
    rawSegments.push({ minX: 0, maxX: w - 1 });
  }

  // Find vertical minY..maxY bounds for each segment and global max character height/width
  let maxCharH = 1;
  let maxCharW = 1;

  const segments = rawSegments.map((seg) => {
    let minY = h - 1;
    let maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = seg.minX; x <= seg.maxX; x++) {
        if (isForeground(x, y)) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (minY > maxY) {
      minY = 0;
      maxY = h - 1;
    }
    const charW = seg.maxX - seg.minX + 1;
    const charH = maxY - minY + 1;
    if (charH > maxCharH) maxCharH = charH;
    if (charW > maxCharW) maxCharW = charW;
    return {
      minX: seg.minX,
      maxX: seg.maxX,
      minY,
      maxY,
      charW,
      charH
    };
  });

  // Determine uniform high-res cell size with aspect ratio matching (nativeW : nativeH)
  // so characters fill ~78% of cell height (or width) without any aspect distortion!
  const targetAspect = nativeW / Math.max(1, nativeH);
  let cellH = Math.ceil(maxCharH / 0.78);
  let cellW = Math.round(cellH * targetAspect);

  if (maxCharW > cellW * 0.86) {
    cellW = Math.ceil(maxCharW / 0.86);
    cellH = Math.round(cellW / targetAspect);
  }

  // Ensure cell dimensions are multiples of a clean integer or at least nativeW x nativeH
  cellW = Math.max(nativeW, cellW);
  cellH = Math.max(nativeH, cellH);

  const targetBaselineY = Math.floor(cellH * 0.88);
  const targetCenterX = Math.floor(cellW * 0.5);

  const createBgFilledImageData = (width, height) => {
    const img = new ImageData(width, height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = bgR;
      d[i + 1] = bgG;
      d[i + 2] = bgB;
      d[i + 3] = 255;
    }
    return img;
  };

  // Extract each character into its own normalized high-res cell ImageData
  const characterFramesHighRes = segments.map((seg) => {
    const cellImg = createBgFilledImageData(cellW, cellH);
    const dst = cellImg.data;

    const srcCenterX = Math.floor((seg.minX + seg.maxX) * 0.5);
    const offsetX = targetCenterX - srcCenterX;
    const offsetY = targetBaselineY - seg.maxY;

    for (let sy = seg.minY; sy <= seg.maxY; sy++) {
      const dy = sy + offsetY;
      if (dy < 0 || dy >= cellH) continue;
      for (let sx = seg.minX; sx <= seg.maxX; sx++) {
        const dx = sx + offsetX;
        if (dx < 0 || dx >= cellW) continue;
        const sIdx = (sy * w + sx) * 4;
        const dIdx = (dy * cellW + dx) * 4;
        dst[dIdx] = src[sIdx];
        dst[dIdx + 1] = src[sIdx + 1];
        dst[dIdx + 2] = src[sIdx + 2];
        dst[dIdx + 3] = src[sIdx + 3];
      }
    }
    return cellImg;
  });

  // Also stitch a normalized horizontal strip of all detected characters
  const count = characterFramesHighRes.length;
  const stripImg = createBgFilledImageData(cellW * count, cellH);
  const stripDst = stripImg.data;
  const totalStripW = cellW * count;

  characterFramesHighRes.forEach((cellImg, idx) => {
    const cSrc = cellImg.data;
    const xOff = idx * cellW;
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const sIdx = (y * cellW + x) * 4;
        const dIdx = (y * totalStripW + (xOff + x)) * 4;
        stripDst[dIdx] = cSrc[sIdx];
        stripDst[dIdx + 1] = cSrc[sIdx + 1];
        stripDst[dIdx + 2] = cSrc[sIdx + 2];
        stripDst[dIdx + 3] = cSrc[sIdx + 3];
      }
    }
  });

  return {
    count,
    cellW,
    cellH,
    segments,
    characterFramesHighRes,
    normalizedStripHighRes: stripImg
  };
}

/**
 * Rich Library of Game Animation Actions for transforming a Locked Static Sprite
 * into a multi-frame animation (both via AI Prompt/Reference Sheet and In-Browser 6-Part Articulation).
 */
export const ANIMATION_ACTION_LIBRARY = {
  walk: {
    id: "walk",
    name: "Walk Cycle (4-Frame Stride)",
    tag: "walk",
    defaultFps: 6,
    loopMode: "forward",
    mannequinPoses: ["walk1", "walk2", "walk3", "walk4"],
    frameDescriptions: [
      "Frame 1 (Contact Heel Strike): front leg extended forward planting heel with knee slightly flexed, back leg pushing off behind with bent knee, front arm bent in ready guard, back arm swinging forward",
      "Frame 2 (Passing Low): body bobs 2px lower as front knee flexes deeply to absorb weight, back knee tucks up 65 degrees as foot clears floor",
      "Frame 3 (Opposite Contact): back leg swings far forward planting heel, front leg drives behind with heel lifting, arms counter-swing",
      "Frame 4 (Passing High): body rises 1px on ball of foot push-off, front knee bends high swinging through to neutral"
    ],
    keyframes: [
      {
        head: { dx: 0, dy: 0, deg: 0 },
        torso: { dx: 0, dy: 0, deg: 2 },
        frontArm: { dx: -1, dy: 0, deg: -14 },
        backArm: { dx: 2, dy: 0, deg: 18 },
        frontLeg: { dx: 2, dy: 0, deg: -22 },
        backLeg: { dx: -2, dy: 0, deg: 22 }
      },
      {
        head: { dx: 0, dy: 1, deg: 1 },
        torso: { dx: 0, dy: 1, deg: 3 },
        frontArm: { dx: 0, dy: 1, deg: -4 },
        backArm: { dx: 0, dy: 1, deg: 6 },
        frontLeg: { dx: 0, dy: 0, deg: -6 },
        backLeg: { dx: 0, dy: -1, deg: 10 }
      },
      {
        head: { dx: 0, dy: 0, deg: 0 },
        torso: { dx: 0, dy: 0, deg: -2 },
        frontArm: { dx: 2, dy: 0, deg: 18 },
        backArm: { dx: -2, dy: 0, deg: -18 },
        frontLeg: { dx: -2, dy: 0, deg: 22 },
        backLeg: { dx: 2, dy: 0, deg: -22 }
      },
      {
        head: { dx: 0, dy: -1, deg: -1 },
        torso: { dx: 0, dy: -1, deg: 0 },
        frontArm: { dx: 1, dy: -1, deg: 6 },
        backArm: { dx: -1, dy: -1, deg: -6 },
        frontLeg: { dx: -1, dy: -1, deg: 8 },
        backLeg: { dx: 1, dy: 0, deg: -6 }
      }
    ]
  },

  run: {
    id: "run",
    name: "Run / Sprint Cycle (4-Frame Dash)",
    tag: "run",
    defaultFps: 9,
    loopMode: "forward",
    mannequinPoses: ["run1", "run2", "run3", "run4"],
    frameDescriptions: [
      "Frame 1 (Forward Drive): aggressive 16-degree torso lean, front leg reaching forward with bent knee, elbows bent 85 degrees pumping hard, cape trailing back",
      "Frame 2 (Airborne Tuck): body airborne in mid-stride, lead knee tucked 80 degrees high, trailing heel kicked up towards glutes",
      "Frame 3 (Opposite Drive): back leg driving hard forward, front leg pushing back, arms reversing pumping sprint motion",
      "Frame 4 (Airborne Transition): high flight stride with compact bent arms and flexed knees clearing ground"
    ],
    keyframes: [
      {
        head: { dx: 2, dy: 1, deg: 6 },
        torso: { dx: 1, dy: 1, deg: 10 },
        frontArm: { dx: -2, dy: 0, deg: -26 },
        backArm: { dx: 3, dy: -1, deg: 28 },
        frontLeg: { dx: 3, dy: -1, deg: -34 },
        backLeg: { dx: -3, dy: 0, deg: 32 }
      },
      {
        head: { dx: 2, dy: 2, deg: 8 },
        torso: { dx: 1, dy: 2, deg: 12 },
        frontArm: { dx: 0, dy: 1, deg: -8 },
        backArm: { dx: 1, dy: 1, deg: 10 },
        frontLeg: { dx: 1, dy: -1, deg: -10 },
        backLeg: { dx: -1, dy: -2, deg: 14 }
      },
      {
        head: { dx: 2, dy: 1, deg: 6 },
        torso: { dx: 1, dy: 1, deg: 8 },
        frontArm: { dx: 3, dy: -1, deg: 28 },
        backArm: { dx: -2, dy: 0, deg: -26 },
        frontLeg: { dx: -3, dy: 0, deg: 32 },
        backLeg: { dx: 3, dy: -1, deg: -34 }
      },
      {
        head: { dx: 1, dy: -1, deg: 4 },
        torso: { dx: 1, dy: -1, deg: 8 },
        frontArm: { dx: 1, dy: -1, deg: 10 },
        backArm: { dx: -1, dy: -1, deg: -10 },
        frontLeg: { dx: -1, dy: -2, deg: 12 },
        backLeg: { dx: 1, dy: -1, deg: -12 }
      }
    ]
  },

  attack: {
    id: "attack",
    name: "Melee Attack / Sword Slash (4-Frame Combo)",
    tag: "attack",
    defaultFps: 8,
    loopMode: "forward",
    mannequinPoses: ["idle", "attackWindup", "attackStrike", "attackFollow"],
    frameDescriptions: [
      "Frame 1 (Combat Ready Guard): athletic guard stance with 12-degree knee flex, elbows bent holding weapon poised",
      "Frame 2 (Coiled Windup): torso coiled back, weapon arm pulled high overhead with elbow tightly bent 110 degrees, knees crouched low",
      "Frame 3 (Forward Slash Lunge): deep forward lunge with front knee bent 52 degrees, weapon arm whipping forward in powerful slash extension",
      "Frame 4 (Follow-Through): weapon completes slashing arc low, rear knee absorbs momentum as character returns toward guard"
    ],
    keyframes: [
      {
        head: { dx: 0, dy: 0, deg: 0 },
        torso: { dx: 0, dy: 0, deg: 0 },
        frontArm: { dx: 0, dy: 0, deg: -8 },
        backArm: { dx: 0, dy: 0, deg: 6 },
        frontLeg: { dx: 0, dy: 0, deg: -4 },
        backLeg: { dx: 0, dy: 0, deg: 4 }
      },
      {
        head: { dx: -1, dy: 0, deg: -5 },
        torso: { dx: -1, dy: 0, deg: -10 },
        frontArm: { dx: -2, dy: -3, deg: -48 },
        backArm: { dx: -1, dy: -1, deg: -14 },
        frontLeg: { dx: -1, dy: 0, deg: 10 },
        backLeg: { dx: -1, dy: 0, deg: -8 }
      },
      {
        head: { dx: 3, dy: 1, deg: 8 },
        torso: { dx: 2, dy: 1, deg: 14 },
        frontArm: { dx: 4, dy: 2, deg: 38 },
        backArm: { dx: -2, dy: 1, deg: -20 },
        frontLeg: { dx: 3, dy: 0, deg: -26 },
        backLeg: { dx: -2, dy: 0, deg: 24 }
      },
      {
        head: { dx: 1, dy: 1, deg: 3 },
        torso: { dx: 1, dy: 1, deg: 6 },
        frontArm: { dx: 2, dy: 1, deg: 16 },
        backArm: { dx: -1, dy: 0, deg: -8 },
        frontLeg: { dx: 1, dy: 0, deg: -10 },
        backLeg: { dx: -1, dy: 0, deg: 10 }
      }
    ]
  },

  smash: {
    id: "smash",
    name: "Heavy Overhead Smash / Slam (4-Frame Arc)",
    tag: "smash",
    defaultFps: 7,
    loopMode: "forward",
    mannequinPoses: ["attackWindup", "smash", "smashImpact", "idle"],
    frameDescriptions: [
      "Frame 1 (High Windup): elbows bent overhead coiling weapon with both knees flexed in crouch",
      "Frame 2 (Downward Drive): body plunging forward with deep knee flexion driving weapon down",
      "Frame 3 (Ground Impact): deep crouch lunge with knees bent 48 degrees, weapon smashing floor with burst effect",
      "Frame 4 (Shock Recovery): shoulders lifting, pulling weapon up from ground impact"
    ],
    keyframes: [
      {
        head: { dx: 0, dy: 0, deg: 0 },
        torso: { dx: 0, dy: 0, deg: 0 },
        frontArm: { dx: 0, dy: 0, deg: -6 },
        backArm: { dx: 0, dy: 0, deg: 6 },
        frontLeg: { dx: 0, dy: 0, deg: -4 },
        backLeg: { dx: 0, dy: 0, deg: 4 }
      },
      {
        head: { dx: 0, dy: -2, deg: -8 },
        torso: { dx: 0, dy: -2, deg: -12 },
        frontArm: { dx: -2, dy: -4, deg: -55 },
        backArm: { dx: -2, dy: -4, deg: -50 },
        frontLeg: { dx: 0, dy: 1, deg: 12 },
        backLeg: { dx: 0, dy: 1, deg: -10 }
      },
      {
        head: { dx: 2, dy: 2, deg: 12 },
        torso: { dx: 2, dy: 2, deg: 20 },
        frontArm: { dx: 3, dy: 3, deg: 45 },
        backArm: { dx: 3, dy: 3, deg: 40 },
        frontLeg: { dx: 2, dy: 1, deg: -22 },
        backLeg: { dx: -2, dy: 1, deg: 22 }
      },
      {
        head: { dx: 1, dy: 1, deg: 4 },
        torso: { dx: 1, dy: 1, deg: 8 },
        frontArm: { dx: 1, dy: 1, deg: 12 },
        backArm: { dx: 1, dy: 1, deg: 10 },
        frontLeg: { dx: 1, dy: 0, deg: -8 },
        backLeg: { dx: -1, dy: 0, deg: 8 }
      }
    ]
  },

  cast: {
    id: "cast",
    name: "Spell Cast / Battle Cry (4-Frame Channel)",
    tag: "cast",
    defaultFps: 6,
    loopMode: "forward",
    mannequinPoses: ["castCharge", "castChannel", "castRelease", "castRecover"],
    frameDescriptions: [
      "Frame 1 (Focus Gather): slight knee flex, elbows drawn close to chest gathering magical energy",
      "Frame 2 (Channel Skyward): head and chest tilted back, arms raised high with bent elbows holding the magical focus",
      "Frame 3 (Release Burst): deep forward lunge with bent front knee, arms thrust forward releasing magical wave",
      "Frame 4 (Cooldown Return): arms lower smoothly back to balanced combat stance"
    ],
    keyframes: [
      {
        head: { dx: 0, dy: 1, deg: 4 },
        torso: { dx: 0, dy: 1, deg: 4 },
        frontArm: { dx: -1, dy: 1, deg: -16 },
        backArm: { dx: -1, dy: 1, deg: -12 },
        frontLeg: { dx: 0, dy: 0, deg: -4 },
        backLeg: { dx: 0, dy: 0, deg: 4 }
      },
      {
        head: { dx: 0, dy: -1, deg: -8 },
        torso: { dx: 0, dy: -1, deg: -6 },
        frontArm: { dx: 0, dy: -3, deg: -42 },
        backArm: { dx: 1, dy: -2, deg: 30 },
        frontLeg: { dx: 0, dy: 0, deg: 0 },
        backLeg: { dx: 0, dy: 0, deg: 0 }
      },
      {
        head: { dx: 1, dy: 0, deg: 4 },
        torso: { dx: 1, dy: 0, deg: 8 },
        frontArm: { dx: 3, dy: -1, deg: 26 },
        backArm: { dx: 2, dy: -1, deg: 24 },
        frontLeg: { dx: 1, dy: 0, deg: -14 },
        backLeg: { dx: -1, dy: 0, deg: 14 }
      },
      {
        head: { dx: 0, dy: 0, deg: 0 },
        torso: { dx: 0, dy: 0, deg: 2 },
        frontArm: { dx: 1, dy: 0, deg: 8 },
        backArm: { dx: 0, dy: 0, deg: 6 },
        frontLeg: { dx: 0, dy: 0, deg: -4 },
        backLeg: { dx: 0, dy: 0, deg: 4 }
      }
    ]
  },

  hit: {
    id: "hit",
    name: "Hit Recoil / Shield Block (4-Frame Defend)",
    tag: "hit_defend",
    defaultFps: 7,
    loopMode: "forward",
    mannequinPoses: ["hitBrace", "hitImpact", "hitSkid", "hitRecover"],
    frameDescriptions: [
      "Frame 1 (Brace Guard): shield arm raised with 95-degree elbow bend across chest, knees flexed in solid footing",
      "Frame 2 (Impact Knockback): head snapped back 14 degrees, torso jolted backward, front knee buckling under force",
      "Frame 3 (Skid Recovery): boots braced wide with deep 45-degree knee bend absorbing shock",
      "Frame 4 (Counter Ready): weight shifting back forward into ready combat guard"
    ],
    keyframes: [
      {
        head: { dx: 0, dy: 1, deg: 4 },
        torso: { dx: 0, dy: 1, deg: 4 },
        frontArm: { dx: 1, dy: -1, deg: -18 },
        backArm: { dx: 2, dy: -1, deg: -22 },
        frontLeg: { dx: 1, dy: 0, deg: -8 },
        backLeg: { dx: -1, dy: 0, deg: 8 }
      },
      {
        head: { dx: -3, dy: 1, deg: -12 },
        torso: { dx: -2, dy: 1, deg: -14 },
        frontArm: { dx: -2, dy: -1, deg: -28 },
        backArm: { dx: -1, dy: -1, deg: -24 },
        frontLeg: { dx: -1, dy: 0, deg: 16 },
        backLeg: { dx: -2, dy: 0, deg: -12 }
      },
      {
        head: { dx: -2, dy: 2, deg: -6 },
        torso: { dx: -1, dy: 2, deg: -8 },
        frontArm: { dx: -1, dy: 0, deg: -16 },
        backArm: { dx: 0, dy: 0, deg: -14 },
        frontLeg: { dx: 1, dy: 0, deg: -10 },
        backLeg: { dx: -2, dy: 0, deg: 12 }
      },
      {
        head: { dx: 0, dy: 0, deg: 0 },
        torso: { dx: 0, dy: 0, deg: 0 },
        frontArm: { dx: 0, dy: 0, deg: 0 },
        backArm: { dx: 0, dy: 0, deg: 0 },
        frontLeg: { dx: 0, dy: 0, deg: 0 },
        backLeg: { dx: 0, dy: 0, deg: 0 }
      }
    ]
  },

  jump: {
    id: "jump",
    name: "Jump & Landing Arc (4-Frame Aerial)",
    tag: "jump",
    defaultFps: 6,
    loopMode: "forward",
    mannequinPoses: ["jumpSquash", "jumpAscent", "jumpApex", "jumpLand"],
    frameDescriptions: [
      "Frame 1 (Crouch Squash): deep 50-degree knee bend crouch storing energy for leap, body dipping 4px low",
      "Frame 2 (Launch Extension): legs pushing off ground, knees driving straight, arms reaching up",
      "Frame 3 (Mid-Air Apex): character high in air with both knees tucked tight 85 degrees and cape billowing",
      "Frame 4 (Landing Impact): boots touch down with deep knee flexion absorbing ground impact"
    ],
    keyframes: [
      {
        head: { dx: 0, dy: 2, deg: 4 },
        torso: { dx: 0, dy: 2, deg: 6 },
        frontArm: { dx: -1, dy: 2, deg: -14 },
        backArm: { dx: -1, dy: 2, deg: -12 },
        frontLeg: { dx: 0, dy: 0, deg: -10 },
        backLeg: { dx: 0, dy: 0, deg: 10 }
      },
      {
        head: { dx: 0, dy: -3, deg: -4 },
        torso: { dx: 0, dy: -3, deg: -2 },
        frontArm: { dx: 1, dy: -4, deg: -24 },
        backArm: { dx: 1, dy: -4, deg: 20 },
        frontLeg: { dx: 0, dy: -2, deg: 8 },
        backLeg: { dx: 0, dy: -2, deg: -8 }
      },
      {
        head: { dx: 0, dy: -4, deg: 0 },
        torso: { dx: 0, dy: -4, deg: 4 },
        frontArm: { dx: 1, dy: -5, deg: -30 },
        backArm: { dx: -1, dy: -5, deg: 26 },
        frontLeg: { dx: 2, dy: -4, deg: -22 },
        backLeg: { dx: -2, dy: -4, deg: 22 }
      },
      {
        head: { dx: 0, dy: 1, deg: 3 },
        torso: { dx: 0, dy: 1, deg: 4 },
        frontArm: { dx: 1, dy: 1, deg: 10 },
        backArm: { dx: -1, dy: 1, deg: -8 },
        frontLeg: { dx: 1, dy: 0, deg: -8 },
        backLeg: { dx: -1, dy: 0, deg: 8 }
      }
    ]
  },

  idle: {
    id: "idle",
    name: "Idle Breathing Loop (4-Frame Stance)",
    tag: "idle",
    defaultFps: 5,
    loopMode: "forward",
    mannequinPoses: ["idle", "idleBreatheLow", "idleBreatheSettle", "idleBreatheRise"],
    frameDescriptions: [
      "Frame 1 (Neutral Ready): athletic standing combat stance, knees flexed 12 degrees, weapon in comfortable guard",
      "Frame 2 (Breathing Dip): chest and shoulders settle 1px lower as knees flex slightly, weapon dips smoothly",
      "Frame 3 (Deep Settle): head and weapon arm lag 1px down at bottom of natural breathing cycle",
      "Frame 4 (Inhale Rise): chest rises smoothly back toward neutral combat stance"
    ],
    keyframes: [
      {
        head: { dx: 0, dy: 0, deg: 0 },
        torso: { dx: 0, dy: 0, deg: 0 },
        frontArm: { dx: 0, dy: 0, deg: 0 },
        backArm: { dx: 0, dy: 0, deg: 0 },
        frontLeg: { dx: 0, dy: 0, deg: 0 },
        backLeg: { dx: 0, dy: 0, deg: 0 }
      },
      {
        head: { dx: 0, dy: 1, deg: 0 },
        torso: { dx: 0, dy: 1, deg: 1 },
        frontArm: { dx: 0, dy: 1, deg: 3 },
        backArm: { dx: 0, dy: 1, deg: -2 },
        frontLeg: { dx: 0, dy: 0, deg: 0 },
        backLeg: { dx: 0, dy: 0, deg: 0 }
      },
      {
        head: { dx: 0, dy: 2, deg: 1 },
        torso: { dx: 0, dy: 1, deg: 2 },
        frontArm: { dx: 0, dy: 2, deg: 6 },
        backArm: { dx: 0, dy: 2, deg: -4 },
        frontLeg: { dx: 0, dy: 0, deg: 0 },
        backLeg: { dx: 0, dy: 0, deg: 0 }
      },
      {
        head: { dx: 0, dy: 1, deg: 0 },
        torso: { dx: 0, dy: 0, deg: 1 },
        frontArm: { dx: 0, dy: 1, deg: 2 },
        backArm: { dx: 0, dy: 1, deg: -1 },
        frontLeg: { dx: 0, dy: 0, deg: 0 },
        backLeg: { dx: 0, dy: 0, deg: 0 }
      }
    ]
  },

  victory: {
    id: "victory",
    name: "Victory / Taunt Pose (4-Frame Salutation)",
    tag: "victory",
    defaultFps: 6,
    loopMode: "forward",
    mannequinPoses: ["idle", "victoryPump", "victoryPeak", "victoryReturn"],
    frameDescriptions: [
      "Frame 1 (Pride Stance): character stands proud in neutral stance, chest forward",
      "Frame 2 (Raise Weapon): weapon arm pumped skyward with elbow bent 75 degrees in triumph",
      "Frame 3 (Peak Salute): weapon held high at peak victory extension with flexed knee stance",
      "Frame 4 (Return): weapon lowers smoothly back to combat ready position"
    ],
    keyframes: [
      {
        head: { dx: 0, dy: 0, deg: 0 },
        torso: { dx: 0, dy: 0, deg: 0 },
        frontArm: { dx: 0, dy: 0, deg: 0 },
        backArm: { dx: 0, dy: 0, deg: 0 },
        frontLeg: { dx: 0, dy: 0, deg: 0 },
        backLeg: { dx: 0, dy: 0, deg: 0 }
      },
      {
        head: { dx: 0, dy: -1, deg: -4 },
        torso: { dx: 0, dy: -1, deg: -3 },
        frontArm: { dx: -1, dy: -3, deg: -36 },
        backArm: { dx: 0, dy: 0, deg: 8 },
        frontLeg: { dx: 0, dy: 0, deg: 0 },
        backLeg: { dx: 0, dy: 0, deg: 0 }
      },
      {
        head: { dx: 0, dy: -1, deg: -6 },
        torso: { dx: 0, dy: -1, deg: -5 },
        frontArm: { dx: -1, dy: -4, deg: -52 },
        backArm: { dx: 0, dy: -1, deg: 12 },
        frontLeg: { dx: 0, dy: 0, deg: 0 },
        backLeg: { dx: 0, dy: 0, deg: 0 }
      },
      {
        head: { dx: 0, dy: 0, deg: 0 },
        torso: { dx: 0, dy: 0, deg: 0 },
        frontArm: { dx: 0, dy: 0, deg: 0 },
        backArm: { dx: 0, dy: 0, deg: 0 },
        frontLeg: { dx: 0, dy: 0, deg: 0 },
        backLeg: { dx: 0, dy: 0, deg: 0 }
      }
    ]
  },

  custom: {
    id: "custom",
    name: "Custom Mannequin Strip (User Sculpted)",
    tag: "custom_strip",
    defaultFps: 6,
    loopMode: "forward",
    mannequinPoses: ["walk1", "walk2", "walk3", "walk4"],
    frameDescriptions: [
      "Frame 1: Custom sculpted mannequin pose #1",
      "Frame 2: Custom sculpted mannequin pose #2",
      "Frame 3: Custom sculpted mannequin pose #3",
      "Frame 4: Custom sculpted mannequin pose #4"
    ],
    keyframes: [
      { head: { dx: 0, dy: 0, deg: 0 }, torso: { dx: 0, dy: 0, deg: 0 }, frontArm: { dx: 0, dy: 0, deg: 0 }, backArm: { dx: 0, dy: 0, deg: 0 }, frontLeg: { dx: 0, dy: 0, deg: 0 }, backLeg: { dx: 0, dy: 0, deg: 0 } },
      { head: { dx: 0, dy: 0, deg: 0 }, torso: { dx: 0, dy: 0, deg: 0 }, frontArm: { dx: 0, dy: 0, deg: 0 }, backArm: { dx: 0, dy: 0, deg: 0 }, frontLeg: { dx: 0, dy: 0, deg: 0 }, backLeg: { dx: 0, dy: 0, deg: 0 } },
      { head: { dx: 0, dy: 0, deg: 0 }, torso: { dx: 0, dy: 0, deg: 0 }, frontArm: { dx: 0, dy: 0, deg: 0 }, backArm: { dx: 0, dy: 0, deg: 0 }, frontLeg: { dx: 0, dy: 0, deg: 0 }, backLeg: { dx: 0, dy: 0, deg: 0 } },
      { head: { dx: 0, dy: 0, deg: 0 }, torso: { dx: 0, dy: 0, deg: 0 }, frontArm: { dx: 0, dy: 0, deg: 0 }, backArm: { dx: 0, dy: 0, deg: 0 }, frontLeg: { dx: 0, dy: 0, deg: 0 }, backLeg: { dx: 0, dy: 0, deg: 0 } }
    ]
  }
};

/**
 * 6-Part Articulated Pose Animator:
 * Slices a static sprite into 6 anatomical parts using the Stage 2 Mannequin Color-ID mask:
 *   1: HEAD (#FF5555)
 *   2: TORSO (#55FF55)
 *   3: FRONT_ARM + WEAPON (#5555FF, #FFFFFF)
 *   4: BACK_ARM (#FFFF55)
 *   5: FRONT_LEG (#FF55FF)
 *   6: BACK_LEG (#55FFFF)
 * Rotates and translates each part around its anatomical joint pivot using nearest-neighbor
 * inverse mapping to generate any action preset (Walk, Run, Attack, Cast, Hit, Jump, Idle, Victory)
 * directly from the user's Locked Static Base Character!
 */
export function generateArticulatedActionFrames(
  spriteImageData,
  mannequinMaskImageData,
  actionKey = "walk"
) {
  const action = ANIMATION_ACTION_LIBRARY[actionKey] || ANIMATION_ACTION_LIBRARY.walk;
  const w = spriteImageData.width;
  const h = spriteImageData.height;
  const sprite = spriteImageData.data;
  const mask = mannequinMaskImageData.data;

  const cHead = hexToRgb(MANNEQUIN_COLORS.HEAD);
  const cTorso = hexToRgb(MANNEQUIN_COLORS.TORSO);
  const cFArm = hexToRgb(MANNEQUIN_COLORS.FRONT_ARM);
  const cBArm = hexToRgb(MANNEQUIN_COLORS.BACK_ARM);
  const cWeap = hexToRgb(MANNEQUIN_COLORS.WEAPON);
  const cFLeg = hexToRgb(MANNEQUIN_COLORS.FRONT_LEG);
  const cBLeg = hexToRgb(MANNEQUIN_COLORS.BACK_LEG);

  const matchColor = (r, g, b, target) =>
    Math.abs(r - target.r) < 28 && Math.abs(g - target.g) < 28 && Math.abs(b - target.b) < 28;

  const partMap = new Uint8Array(w * h);
  const seedPoints = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = mask[idx];
      const g = mask[idx + 1];
      const b = mask[idx + 2];
      if (r < 20 && g < 20 && b < 20) continue;

      let partId = 0;
      if (matchColor(r, g, b, cHead)) partId = 1;
      else if (matchColor(r, g, b, cTorso)) partId = 2;
      else if (matchColor(r, g, b, cFArm) || matchColor(r, g, b, cWeap)) partId = 3;
      else if (matchColor(r, g, b, cBArm)) partId = 4;
      else if (matchColor(r, g, b, cFLeg)) partId = 5;
      else if (matchColor(r, g, b, cBLeg)) partId = 6;

      if (partId > 0) {
        partMap[y * w + x] = partId;
        seedPoints.push({ x, y, partId });
      }
    }
  }

  const partKeys = ["head", "torso", "frontArm", "backArm", "frontLeg", "backLeg"];
  const layers = {};
  const bounds = {};

  partKeys.forEach((k) => {
    layers[k] = new ImageData(w, h);
    bounds[k] = { minX: w, minY: h, maxX: 0, maxY: 0, count: 0 };
  });

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (sprite[idx + 3] < 128) continue;

      let partId = partMap[y * w + x];
      if (partId === 0 && seedPoints.length > 0) {
        let minDistSq = Infinity;
        let bestPart = 2;
        for (let s = 0; s < seedPoints.length; s++) {
          const sp = seedPoints[s];
          const dx = x - sp.x;
          const dy = y - sp.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            bestPart = sp.partId;
          }
        }
        partId = bestPart;
      }

      const key = partKeys[(partId || 2) - 1] || "torso";
      const dst = layers[key].data;
      dst[idx] = sprite[idx];
      dst[idx + 1] = sprite[idx + 1];
      dst[idx + 2] = sprite[idx + 2];
      dst[idx + 3] = 255;

      const b = bounds[key];
      if (x < b.minX) b.minX = x;
      if (y < b.minY) b.minY = y;
      if (x > b.maxX) b.maxX = x;
      if (y > b.maxY) b.maxY = y;
      b.count++;
    }
  }

  // Compute natural anatomical pivot points for each part
  const pivots = {};
  partKeys.forEach((k) => {
    const b = bounds[k];
    if (b.count === 0) {
      pivots[k] = { x: w * 0.5, y: h * 0.5 };
      return;
    }
    const cx = (b.minX + b.maxX) * 0.5;
    if (k === "head") {
      // Pivot at neck (bottom-center of head)
      pivots[k] = { x: cx, y: b.maxY };
    } else if (k === "torso") {
      // Pivot at waist (lower torso)
      pivots[k] = { x: cx, y: b.minY + (b.maxY - b.minY) * 0.75 };
    } else {
      // Limbs pivot at shoulder / hip (top of limb)
      pivots[k] = { x: cx, y: b.minY + (b.maxY - b.minY) * 0.2 };
    }
  });

  // Scale pixel offsets proportionally to canvas resolution (calibrated for 64px base)
  const resScale = Math.max(1, w / 64);

  const blitRotatedLayer = (outData, layerData, pivot, transform) => {
    const src = layerData.data;
    const dst = outData.data;
    const dx = Math.round((transform?.dx || 0) * resScale);
    const dy = Math.round((transform?.dy || 0) * resScale);
    const rad = ((transform?.deg || 0) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const px = pivot.x;
    const py = pivot.y;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Inverse map output pixel (x,y) back to source layer (sx,sy)
        const rx = x - dx - px;
        const ry = y - dy - py;
        const sx = Math.round(rx * cosA + ry * sinA + px);
        const sy = Math.round(-rx * sinA + ry * cosA + py);
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;

        const sIdx = (sy * w + sx) * 4;
        if (src[sIdx + 3] >= 128) {
          const dIdx = (y * w + x) * 4;
          dst[dIdx] = src[sIdx];
          dst[dIdx + 1] = src[sIdx + 1];
          dst[dIdx + 2] = src[sIdx + 2];
          dst[dIdx + 3] = 255;
        }
      }
    }
  };

  // Painter's order so limbs layer naturally
  const drawOrder = ["backLeg", "backArm", "torso", "frontLeg", "head", "frontArm"];

  const frames = action.keyframes.map((kf) => {
    const out = new ImageData(w, h);
    for (const partKey of drawOrder) {
      blitRotatedLayer(out, layers[partKey], pivots[partKey], kf[partKey]);
    }
    return out;
  });

  return {
    frames,
    action
  };
}

/**
 * Builds a Composite AI Animation Reference & Pose Conditioning Sheet on a #FF00FF magenta background.
 * Combines the user's Locked Static Base Character (Left Reference Slot) with the 4-frame
 * Articulated Pose Draft Strip (or Mannequin Pose Strip) so AI image generators (Nano Banana / Gemini /
 * ChatGPT / ControlNet) see both the exact character identity and the 4 distinct target poses!
 */
export function buildCompositeAiAnimationReferenceSheet(
  baseSpriteNative,
  articulatedFramesNative,
  scaleFactor = 4
) {
  if (!baseSpriteNative) return new ImageData(1, 1);

  const fw = baseSpriteNative.width;
  const fh = baseSpriteNative.height;
  const frames =
    articulatedFramesNative && articulatedFramesNative.length > 0
      ? articulatedFramesNative
      : [baseSpriteNative];

  // Gap of 8 native pixels between frames so AI clearly separates characters
  const gap = Math.max(6, Math.round(fw * 0.12));
  const totalSlots = 1 + frames.length; // Slot 0 = Base Reference, Slots 1..N = Pose Frames
  const nativeStripW = totalSlots * fw + (totalSlots + 1) * gap;
  const nativeStripH = fh + gap * 2;

  const compositeNative = new ImageData(nativeStripW, nativeStripH);
  const dst = compositeNative.data;

  // Fill entire background with #FF00FF magenta
  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = 255;
    dst[i + 1] = 0;
    dst[i + 2] = 255;
    dst[i + 3] = 255;
  }

  const blitSprite = (srcImg, slotIndex) => {
    const src = srcImg.data;
    const xOff = gap + slotIndex * (fw + gap);
    const yOff = gap;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const sIdx = (y * fw + x) * 4;
        if (src[sIdx + 3] < 128) continue;
        const dIdx = ((yOff + y) * nativeStripW + (xOff + x)) * 4;
        dst[dIdx] = src[sIdx];
        dst[dIdx + 1] = src[sIdx + 1];
        dst[dIdx + 2] = src[sIdx + 2];
        dst[dIdx + 3] = 255;
      }
    }
  };

  // Slot 0: Locked Static Base Character
  blitSprite(baseSpriteNative, 0);

  // Draw clean dividers between all slots
  for (let s = 1; s <= frames.length; s++) {
    const divX = s * (fw + gap) + Math.floor(gap * 0.5);
    const isBaseDivider = s === 1;
    for (let y = 2; y < nativeStripH - 2; y += 2) {
      const dIdx = (y * nativeStripW + divX) * 4;
      if (isBaseDivider) {
        // 1px cyan dashed line separating Base Reference (Slot 0) from Pose Strip
        dst[dIdx] = 0;
        dst[dIdx + 1] = 229;
        dst[dIdx + 2] = 255;
        dst[dIdx + 3] = 255;
      } else {
        // Subtle white dotted divider between individual pose guide frames
        dst[dIdx] = 220;
        dst[dIdx + 1] = 220;
        dst[dIdx + 2] = 220;
        dst[dIdx + 3] = 255;
      }
    }
  }

  // Slots 1..N: Articulated target pose frames (Color-ID Mannequin keyframes)
  frames.forEach((f, idx) => {
    blitSprite(f, idx + 1);
  });

  // Nearest-neighbor upscale so AI receives a crisp high-res reference sheet
  const upFactor = Math.max(1, Math.min(8, scaleFactor));
  const outW = nativeStripW * upFactor;
  const outH = nativeStripH * upFactor;
  const out = new ImageData(outW, outH);
  const outDst = out.data;

  for (let y = 0; y < outH; y++) {
    const sy = Math.floor(y / upFactor);
    for (let x = 0; x < outW; x++) {
      const sx = Math.floor(x / upFactor);
      const sIdx = (sy * nativeStripW + sx) * 4;
      const dIdx = (y * outW + x) * 4;
      outDst[dIdx] = dst[sIdx];
      outDst[dIdx + 1] = dst[sIdx + 1];
      outDst[dIdx + 2] = dst[sIdx + 2];
      outDst[dIdx + 3] = 255;
    }
  }

  return out;
}
