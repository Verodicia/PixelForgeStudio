/**
 * PixelForge Studio — Stage 4: Deterministic Pixel Cleanup Engine
 * Pure HTML5 Canvas ImageData / TypedArray mathematical algorithms:
 * 1. applyChromaKey (Euclidean RGB distance + strict binary alpha thresholding)
 * 2. centerSampleDownscale (Inner-50% Block Mode, Inner-50% Block Median, Center Pixel)
 * 3. quantizeToPaletteLab (Perceptual CIELAB L*a*b* Delta-E nearest-neighbor color mapping)
 * 4. morphologicalCleanup (Orphan single-pixel stripper & 1px pinhole filler)
 * 5. generate1pxOutline (4-way N/S/E/W neighbor detection: None, Solid Dark, or Selective Outlining)
 */

import { rgbToLab, deltaE, hexToRgb, buildPaletteLookup } from "./palettes.js";

/**
 * 1. Chroma-Key & Strict Binary Alpha Thresholding with Smart Despill & Contiguous Border Flood-Fill
 * @param {ImageData} srcImageData - Raw high-res source ImageData
 * @param {{r:number, g:number, b:number}} keyRgb - Background key color (e.g. #FF00FF or sampled (0,0))
 * @param {number} tolerance - Slider [0..150], mapped to Euclidean RGB distance
 * @param {number} alphaCutoff - Binary alpha threshold [1..254] for existing semi-transparent pixels
 * @param {number} despillStrength - Suppression factor [0..1] to decontaminate background color bleed on edge pixels
 * @param {boolean} contiguousFill - If true, flood-fills inward from image borders to safely clear background without punching holes in character
 * @param {number} edgeShavePx - Trims the 1-2px blurry AI anti-aliasing blend zone bordering the background (0, 1, or 2px)
 * @returns {ImageData} New ImageData with strictly binary alpha (0 or 255) and despilled edge colors
 */
export function applyChromaKey(
  srcImageData,
  keyRgb,
  tolerance = 32,
  alphaCutoff = 128,
  despillStrength = 0.85,
  contiguousFill = true,
  edgeShavePx = 1
) {
  const w = srcImageData.width;
  const h = srcImageData.height;
  const src = srcImageData.data;
  const out = new ImageData(w, h);
  const dst = out.data;

  // Map 0..100 slider to Euclidean RGB distance (tolerance up to 150 allows handling noisy AI backgrounds)
  const maxDist = (tolerance / 100) * 260;
  const maxDistSq = maxDist * maxDist;
  const kr = keyRgb.r;
  const kg = keyRgb.g;
  const kb = keyRgb.b;

  // Pixel-level background flag
  const isBg = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const sIdx = idx * 4;
      const a = src[sIdx + 3];

      if (a < alphaCutoff) {
        isBg[idx] = 1;
        continue;
      }

      const r = src[sIdx];
      const g = src[sIdx + 1];
      const b = src[sIdx + 2];

      const dr = r - kr;
      const dg = g - kg;
      const db = b - kb;
      const distSq = dr * dr + dg * dg + db * db;

      if (distSq <= maxDistSq) {
        isBg[idx] = 1;
      }
    }
  }

  // Contiguous Outer Flood-Fill:
  // Starts BFS queue from all image borders and clears connected background inwards.
  // Uses a slightly relaxed distance threshold for border-connected pixels to eradicate subtle
  // gradients and vignettes, without touching internal character details.
  if (contiguousFill) {
    const queue = new Int32Array(w * h);
    let qHead = 0;
    let qTail = 0;
    const visited = new Uint8Array(w * h);
    const borderDistSq = Math.max(maxDistSq, Math.pow(maxDist * 1.25 + 18, 2));

    const checkAndPush = (x, y) => {
      const idx = y * w + x;
      if (visited[idx]) return;
      visited[idx] = 1;

      const sIdx = idx * 4;
      if (src[sIdx + 3] < alphaCutoff) {
        isBg[idx] = 1;
        queue[qTail++] = idx;
        return;
      }

      const dr = src[sIdx] - kr;
      const dg = src[sIdx + 1] - kg;
      const db = src[sIdx + 2] - kb;
      const distSq = dr * dr + dg * dg + db * db;

      if (distSq <= borderDistSq) {
        isBg[idx] = 1;
        queue[qTail++] = idx;
      }
    };

    for (let x = 0; x < w; x++) {
      checkAndPush(x, 0);
      checkAndPush(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      checkAndPush(0, y);
      checkAndPush(w - 1, y);
    }

    while (qHead < qTail) {
      const curr = queue[qHead++];
      const cx = curr % w;
      const cy = Math.floor(curr / w);

      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1]
      ];

      for (let n = 0; n < 4; n++) {
        const nx = neighbors[n][0];
        const ny = neighbors[n][1];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const nIdx = ny * w + nx;
        if (visited[nIdx]) continue;
        visited[nIdx] = 1;

        const sIdx = nIdx * 4;
        if (src[sIdx + 3] < alphaCutoff) {
          isBg[nIdx] = 1;
          queue[qTail++] = nIdx;
          continue;
        }

        const dr = src[sIdx] - kr;
        const dg = src[sIdx + 1] - kg;
        const db = src[sIdx + 2] - kb;
        const distSq = dr * dr + dg * dg + db * db;

        if (distSq <= borderDistSq) {
          isBg[nIdx] = 1;
          queue[qTail++] = nIdx;
        }
      }
    }
  }

  // Despill & Decontamination Pass on surviving opaque pixels:
  // Detects the chromatic bias of the background key color (e.g. magenta, purple, green, cyan)
  // and subtracts background color contamination from the surviving edge pixels.
  const despillFactor = Math.max(0, Math.min(1, despillStrength));
  const isMagentaBias = (kr > kg * 1.25 && kb > kg * 1.25) || (kr > 130 && kb > 130 && kg < 100);
  const isGreenBias = kg > kr * 1.25 && kg > kb * 1.25;
  const isBlueBias = kb > kr * 1.25 && kb > kg * 1.25;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const sIdx = idx * 4;

      if (isBg[idx]) {
        dst[sIdx] = 0;
        dst[sIdx + 1] = 0;
        dst[sIdx + 2] = 0;
        dst[sIdx + 3] = 0;
        continue;
      }

      let r = src[sIdx];
      let g = src[sIdx + 1];
      let b = src[sIdx + 2];

      if (despillFactor > 0) {
        if (isMagentaBias) {
          // Magenta/purple background elevates R and B above G.
          // True non-background reference luminance is G channel.
          const excess = Math.max(0, Math.min(r - g, b - g));
          if (excess > 0) {
            const dr = r - kr;
            const dg = g - kg;
            const db = b - kb;
            const curDistSq = dr * dr + dg * dg + db * db;
            // Stronger despill close to background boundary
            const proximity = curDistSq < maxDistSq * 5 ? 1.0 : Math.max(0, 1 - (curDistSq - maxDistSq * 5) / (maxDistSq * 5));
            const sub = Math.round(excess * despillFactor * (0.65 + 0.35 * proximity));
            r = Math.max(0, r - sub);
            b = Math.max(0, b - sub);
          }
        } else if (isGreenBias) {
          const excess = Math.max(0, g - Math.max(r, b));
          if (excess > 0) {
            const sub = Math.round(excess * despillFactor);
            g = Math.max(0, g - sub);
          }
        } else if (isBlueBias) {
          const excess = Math.max(0, b - Math.max(r, g));
          if (excess > 0) {
            const sub = Math.round(excess * despillFactor);
            b = Math.max(0, b - sub);
          }
        } else {
          // Custom background despill: measure projection onto key color vector
          const keyLenSq = kr * kr + kg * kg + kb * kb || 1;
          const dot = (r * kr + g * kg + b * kb) / keyLenSq;
          if (dot > 0.3) {
            const dr = r - kr;
            const dg = g - kg;
            const db = b - kb;
            if (dr * dr + dg * dg + db * db < maxDistSq * 4.5) {
              r = Math.max(0, Math.round(r - kr * 0.22 * dot * despillFactor));
              g = Math.max(0, Math.round(g - kg * 0.22 * dot * despillFactor));
              b = Math.max(0, Math.round(b - kb * 0.22 * dot * despillFactor));
            }
          }
        }
      }

      dst[sIdx] = r;
      dst[sIdx + 1] = g;
      dst[sIdx + 2] = b;
      dst[sIdx + 3] = 255; // Strict binary alpha
    }
  }

  // Edge Halo Shaver Pass:
  // Trims the outermost 1 to 2 pixel AI anti-aliasing blend zone bordering transparent pixels
  // if those boundary pixels had background similarity or chromatic spill in the original source
  if (edgeShavePx > 0) {
    const passes = Math.min(2, Math.max(1, Math.floor(edgeShavePx)));
    for (let pass = 0; pass < passes; pass++) {
      const copy = new Uint8ClampedArray(dst);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          if (copy[idx + 3] === 0) continue;

          const leftT = x === 0 || copy[idx - 4 + 3] === 0;
          const rightT = x === w - 1 || copy[idx + 4 + 3] === 0;
          const topT = y === 0 || copy[idx - w * 4 + 3] === 0;
          const bottomT = y === h - 1 || copy[idx + w * 4 + 3] === 0;

          if (leftT || rightT || topT || bottomT) {
            // Check original source pixel to detect background blend contamination
            const sr = src[idx];
            const sg = src[idx + 1];
            const sb = src[idx + 2];
            const sdr = sr - kr;
            const sdg = sg - kg;
            const sdb = sb - kb;
            const sDistSq = sdr * sdr + sdg * sdg + sdb * sdb;

            const hasOriginalSpill = isMagentaBias
              ? Math.min(sr, sb) - sg > 18
              : isGreenBias
              ? sg - Math.max(sr, sb) > 18
              : isBlueBias
              ? sb - Math.max(sr, sg) > 18
              : false;

            if (sDistSq <= maxDistSq * 4.5 || hasOriginalSpill || pass < edgeShavePx - 1) {
              dst[idx] = 0;
              dst[idx + 1] = 0;
              dst[idx + 2] = 0;
              dst[idx + 3] = 0;
            }
          }
        }
      }
    }
  }

  return out;
}

/**
 * 2. Center-Sampled Grid Downscaler (Mixel Eliminator)
 * Divides source image into (targetW x targetH) cells and samples only the inner 50% core
 * (or exact center pixel) to strip out blurry AI anti-aliased transitions between giant pixels.
 *
 * @param {ImageData} srcImageData - Chroma-keyed high-res ImageData
 * @param {number} targetW - Native target width (e.g. 64)
 * @param {number} targetH - Native target height (e.g. 64)
 * @param {"inner-mode"|"inner-median"|"center-pixel"} mode - Sampling algorithm
 * @param {number} coreRatio - Inner core ratio (default 0.5 = inner 50% of cell dimensions)
 * @returns {ImageData} Downscaled native-resolution ImageData
 */
export function centerSampleDownscale(
  srcImageData,
  targetW,
  targetH,
  mode = "inner-mode",
  coreRatio = 0.5,
  minOpaqueRatio = 0.48
) {
  const sw = srcImageData.width;
  const sh = srcImageData.height;
  const src = srcImageData.data;
  const out = new ImageData(targetW, targetH);
  const dst = out.data;

  const cellW = sw / targetW;
  const cellH = sh / targetH;
  const marginRatio = (1 - coreRatio) * 0.5;

  for (let ty = 0; ty < targetH; ty++) {
    const cellStartY = ty * cellH;
    const cellEndY = (ty + 1) * cellH;

    for (let tx = 0; tx < targetW; tx++) {
      const cellStartX = tx * cellW;
      const cellEndX = (tx + 1) * cellW;
      const outIdx = (ty * targetW + tx) * 4;

      if (mode === "center-pixel") {
        const cx = Math.min(sw - 1, Math.floor((cellStartX + cellEndX) * 0.5));
        const cy = Math.min(sh - 1, Math.floor((cellStartY + cellEndY) * 0.5));
        const sIdx = (cy * sw + cx) * 4;
        if (src[sIdx + 3] >= 128) {
          dst[outIdx] = src[sIdx];
          dst[outIdx + 1] = src[sIdx + 1];
          dst[outIdx + 2] = src[sIdx + 2];
          dst[outIdx + 3] = 255;
        }
        continue;
      }

      // Compute inner 50% core bounds (e.g. inner 8x8 of a 16x16 block)
      const innerStartX = Math.max(0, Math.floor(cellStartX + cellW * marginRatio));
      const innerEndX = Math.min(sw, Math.ceil(cellEndX - cellW * marginRatio));
      const innerStartY = Math.max(0, Math.floor(cellStartY + cellH * marginRatio));
      const innerEndY = Math.min(sh, Math.ceil(cellEndY - cellH * marginRatio));

      const x0 = innerStartX < innerEndX ? innerStartX : Math.floor(cellStartX);
      const x1 = innerStartX < innerEndX ? innerEndX : Math.max(x0 + 1, Math.ceil(cellEndX));
      const y0 = innerStartY < innerEndY ? innerStartY : Math.floor(cellStartY);
      const y1 = innerStartY < innerEndY ? innerEndY : Math.max(y0 + 1, Math.ceil(cellEndY));

      let totalSamples = 0;
      let opaqueCount = 0;

      if (mode === "inner-mode") {
        // Quantize slightly (shift by 2 bits = 6-bit per channel bucket) when counting frequency
        // so minor AI noise doesn't split identical flat colors, while tracking exact RGB average per bucket
        const freqMap = new Map();
        let bestBucketKey = -1;
        let bestCount = 0;

        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            totalSamples++;
            const sIdx = (py * sw + px) * 4;
            if (src[sIdx + 3] >= 128) {
              opaqueCount++;
              const r = src[sIdx];
              const g = src[sIdx + 1];
              const b = src[sIdx + 2];
              const bucketKey = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
              let entry = freqMap.get(bucketKey);
              if (!entry) {
                entry = { count: 0, sumR: 0, sumG: 0, sumB: 0 };
                freqMap.set(bucketKey, entry);
              }
              entry.count++;
              entry.sumR += r;
              entry.sumG += g;
              entry.sumB += b;

              if (entry.count > bestCount) {
                bestCount = entry.count;
                bestBucketKey = bucketKey;
              }
            }
          }
        }

        // Require sufficient opaque sample coverage in inner core to avoid rogue fringe blocks
        if (opaqueCount > 0 && opaqueCount >= totalSamples * minOpaqueRatio && bestBucketKey !== -1) {
          const winner = freqMap.get(bestBucketKey);
          dst[outIdx] = Math.round(winner.sumR / winner.count);
          dst[outIdx + 1] = Math.round(winner.sumG / winner.count);
          dst[outIdx + 2] = Math.round(winner.sumB / winner.count);
          dst[outIdx + 3] = 255;
        }
      } else {
        // "inner-median": Collect R, G, B arrays for opaque pixels and pick median
        const rVals = [];
        const gVals = [];
        const bVals = [];

        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            totalSamples++;
            const sIdx = (py * sw + px) * 4;
            if (src[sIdx + 3] >= 128) {
              opaqueCount++;
              rVals.push(src[sIdx]);
              gVals.push(src[sIdx + 1]);
              bVals.push(src[sIdx + 2]);
            }
          }
        }

        if (opaqueCount > 0 && opaqueCount >= totalSamples * minOpaqueRatio) {
          rVals.sort((a, b) => a - b);
          gVals.sort((a, b) => a - b);
          bVals.sort((a, b) => a - b);
          const mid = Math.floor(opaqueCount * 0.5);
          dst[outIdx] = rVals[mid];
          dst[outIdx + 1] = gVals[mid];
          dst[outIdx + 2] = bVals[mid];
          dst[outIdx + 3] = 255;
        }
      }
    }
  }

  return out;
}

/**
 * 3. Perceptual Palette Quantization in CIELAB (L*a*b*) Color Space
 * Maps every opaque pixel to the closest color in the Stage 1 Master Palette using Euclidean Delta-E.
 *
 * @param {ImageData} srcImageData - Downscaled native ImageData
 * @param {Array} paletteLookup - Precomputed palette entries from buildPaletteLookup()
 * @returns {ImageData} Quantized native ImageData
 */
export function quantizeToPaletteLab(srcImageData, paletteLookup) {
  if (!paletteLookup || paletteLookup.length === 0) {
    return new ImageData(
      new Uint8ClampedArray(srcImageData.data),
      srcImageData.width,
      srcImageData.height
    );
  }

  const w = srcImageData.width;
  const h = srcImageData.height;
  const src = srcImageData.data;
  const out = new ImageData(w, h);
  const dst = out.data;

  // Cache RGB -> nearest palette entry to accelerate repeated colors
  const colorCache = new Map();

  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] < 128) {
      continue;
    }
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const key = (r << 16) | (g << 8) | b;

    let matched = colorCache.get(key);
    if (!matched) {
      const pixelLab = rgbToLab(r, g, b);
      let minDelta = Infinity;
      matched = paletteLookup[0];

      for (let p = 0; p < paletteLookup.length; p++) {
        const entry = paletteLookup[p];
        const dE = deltaE(pixelLab, entry.lab);
        if (dE < minDelta) {
          minDelta = dE;
          matched = entry;
        }
      }
      colorCache.set(key, matched);
    }

    dst[i] = matched.r;
    dst[i + 1] = matched.g;
    dst[i + 2] = matched.b;
    dst[i + 3] = 255;
  }

  return out;
}

/**
 * 4a. Morphological Cleanup: Orphan Pixel Stripper & 1px Pinhole Filler
 * - Orphan Pixel Stripper: Removes isolated single opaque pixels surrounded by transparent pixels.
 * - Pinhole Filler: Fills single 1px transparent holes surrounded by >=3 orthogonal opaque neighbors.
 *
 * @param {ImageData} srcImageData
 * @param {boolean} stripOrphans
 * @param {boolean} fillPinholes
 * @returns {ImageData}
 */
export function morphologicalCleanup(srcImageData, stripOrphans = true, fillPinholes = true) {
  const w = srcImageData.width;
  const h = srcImageData.height;
  const work = new Uint8ClampedArray(srcImageData.data);

  // Pass 1: Strip isolated orphan pixels (0 orthogonal neighbors and <=1 diagonal neighbor)
  if (stripOrphans) {
    const copy = new Uint8ClampedArray(work);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (copy[idx + 3] < 128) continue;

        let orthoNeighbors = 0;
        if (y > 0 && copy[((y - 1) * w + x) * 4 + 3] >= 128) orthoNeighbors++;
        if (y < h - 1 && copy[((y + 1) * w + x) * 4 + 3] >= 128) orthoNeighbors++;
        if (x > 0 && copy[(y * w + (x - 1)) * 4 + 3] >= 128) orthoNeighbors++;
        if (x < w - 1 && copy[(y * w + (x + 1)) * 4 + 3] >= 128) orthoNeighbors++;

        if (orthoNeighbors === 0) {
          work[idx] = 0;
          work[idx + 1] = 0;
          work[idx + 2] = 0;
          work[idx + 3] = 0;
        }
      }
    }
  }

  // Pass 2: Fill 1px transparent pinholes surrounded by all 4 orthogonal opaque neighbors
  if (fillPinholes) {
    const copy = new Uint8ClampedArray(work);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        if (copy[idx + 3] >= 128) continue;

        const nIdx = ((y - 1) * w + x) * 4;
        const sIdx = ((y + 1) * w + x) * 4;
        const wIdx = (y * w + (x - 1)) * 4;
        const eIdx = (y * w + (x + 1)) * 4;

        const nOpaque = copy[nIdx + 3] >= 128;
        const sOpaque = copy[sIdx + 3] >= 128;
        const wOpaque = copy[wIdx + 3] >= 128;
        const eOpaque = copy[eIdx + 3] >= 128;

        if (nOpaque && sOpaque && wOpaque && eOpaque) {
          // Adopt N neighbor color for deterministic crispness
          work[idx] = copy[nIdx];
          work[idx + 1] = copy[nIdx + 1];
          work[idx + 2] = copy[nIdx + 2];
          work[idx + 3] = 255;
        }
      }
    }
  }

  return new ImageData(work, w, h);
}

/**
 * 4b. Programmatic 1px Outliner
 * Checks 4-way (N, S, E, W) neighbors of transparent pixels bordering opaque pixels.
 * Modes:
 * - "none": No outline
 * - "solid": Solid dark outline color
 * - "selout": Selective Outlining — picks a darker shade ramp in the Master Palette matching
 *             the adjacent interior pixel's hue/chromaticity in CIELAB space.
 *
 * @param {ImageData} srcImageData
 * @param {"none"|"solid"|"selout"} mode
 * @param {string} solidHex - Hex color for solid mode (e.g. "#141013")
 * @param {Array} paletteLookup - Precomputed palette lookup from buildPaletteLookup()
 * @returns {ImageData}
 */
export function generate1pxOutline(
  srcImageData,
  mode = "selout",
  solidHex = "#141013",
  paletteLookup = []
) {
  if (mode === "none") {
    return new ImageData(
      new Uint8ClampedArray(srcImageData.data),
      srcImageData.width,
      srcImageData.height
    );
  }

  const w = srcImageData.width;
  const h = srcImageData.height;
  const src = srcImageData.data;
  const out = new ImageData(new Uint8ClampedArray(src), w, h);
  const dst = out.data;

  const solidRgb = hexToRgb(solidHex);

  // Find darkest color in palette as fallback
  let darkestEntry = { r: solidRgb.r, g: solidRgb.g, b: solidRgb.b, L: 0 };
  if (paletteLookup && paletteLookup.length > 0) {
    darkestEntry = paletteLookup.reduce((min, cur) => (cur.L < min.L ? cur : min), paletteLookup[0]);
  }

  const offsets = [
    [0, -1], // N
    [0, 1],  // S
    [-1, 0], // W
    [1, 0]   // E
  ];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      // Only consider transparent pixels
      if (src[idx + 3] >= 128) continue;

      let neighborCount = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;

      for (let d = 0; d < 4; d++) {
        const nx = x + offsets[d][0];
        const ny = y + offsets[d][1];
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const nIdx = (ny * w + nx) * 4;
          if (src[nIdx + 3] >= 128) {
            neighborCount++;
            sumR += src[nIdx];
            sumG += src[nIdx + 1];
            sumB += src[nIdx + 2];
          }
        }
      }

      if (neighborCount === 0) continue;

      if (mode === "solid") {
        dst[idx] = solidRgb.r;
        dst[idx + 1] = solidRgb.g;
        dst[idx + 2] = solidRgb.b;
        dst[idx + 3] = 255;
      } else if (mode === "selout") {
        const avgR = Math.round(sumR / neighborCount);
        const avgG = Math.round(sumG / neighborCount);
        const avgB = Math.round(sumB / neighborCount);

        if (!paletteLookup || paletteLookup.length === 0) {
          // Darken directly by 55% if no palette
          dst[idx] = Math.round(avgR * 0.42);
          dst[idx + 1] = Math.round(avgG * 0.42);
          dst[idx + 2] = Math.round(avgB * 0.45);
          dst[idx + 3] = 255;
          continue;
        }

        const neighborLab = rgbToLab(avgR, avgG, avgB);
        // Target a dark shade ramp ~42% of neighbor's L* (clamped to [8..38])
        const targetL = Math.max(6, Math.min(36, neighborLab.L * 0.45));

        let bestCand = darkestEntry;
        let bestScore = Infinity;

        for (let p = 0; p < paletteLookup.length; p++) {
          const cand = paletteLookup[p];
          // Must be darker than the interior neighbor
          if (cand.L >= neighborLab.L - 4 && cand !== darkestEntry) continue;

          const dL = cand.L - targetL;
          const da = cand.a - neighborLab.a * 0.65;
          const db = cand.bLab - neighborLab.b * 0.65;
          // Weight lightness strongly and hue/chroma moderately for authentic Sel-Out
          const score = dL * dL * 1.4 + da * da + db * db;
          if (score < bestScore) {
            bestScore = score;
            bestCand = cand;
          }
        }

        dst[idx] = bestCand.r;
        dst[idx + 1] = bestCand.g;
        dst[idx + 2] = bestCand.b;
        dst[idx + 3] = 255;
      }
    }
  }

  return out;
}

/**
 * Execute the full Stage 4 Deterministic Pixel Cleanup Pipeline on a raw ImageData buffer
 */
export function runCleanupPipeline(rawImageData, config, masterPaletteHex) {
  const t0 = performance.now();

  const {
    targetW = 64,
    targetH = 64,
    chromaKeyHex = "#FF00FF",
    useTopLeftSample = false,
    chromaTolerance = 32,
    contiguousFill = true,
    despillStrength = 85,
    edgeHaloShave = 1,
    downscaleMode = "inner-mode",
    enableQuantize = true,
    stripOrphans = true,
    fillPinholes = true,
    outlineMode = "selout",
    solidOutlineHex = "#141013"
  } = config;

  // Step 1: Determine chroma key RGB
  let keyRgb = hexToRgb(chromaKeyHex);
  if (useTopLeftSample && rawImageData.data.length >= 4) {
    keyRgb = {
      r: rawImageData.data[0],
      g: rawImageData.data[1],
      b: rawImageData.data[2]
    };
  }

  const keyedData = applyChromaKey(
    rawImageData,
    keyRgb,
    chromaTolerance,
    128,
    (despillStrength ?? 85) / 100,
    contiguousFill !== false,
    edgeHaloShave ?? 1
  );

  // Step 2: Center-Sampled Grid Downscaler
  const downscaledData = centerSampleDownscale(keyedData, targetW, targetH, downscaleMode, 0.5, 0.48);

  // Step 3: Perceptual CIELAB Palette Quantization
  const paletteLookup = buildPaletteLookup(masterPaletteHex);
  const quantizedData = enableQuantize
    ? quantizeToPaletteLab(downscaledData, paletteLookup)
    : downscaledData;

  // Step 4a: Morphological Cleanup (Orphan Pixel Stripper & Pinhole Filler)
  const cleanedData = morphologicalCleanup(quantizedData, stripOrphans, fillPinholes);

  // Step 4b: Programmatic 1px Outliner
  const finalData = generate1pxOutline(cleanedData, outlineMode, solidOutlineHex, paletteLookup);

  const elapsedMs = (performance.now() - t0).toFixed(1);

  return {
    keyedData,
    downscaledData,
    quantizedData,
    cleanedData,
    finalData,
    keyRgb,
    elapsedMs
  };
}
