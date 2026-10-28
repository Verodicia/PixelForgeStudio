// PixelForge Studio — Bundled Single-File Runtime
(function() {
"use strict";

// --- js/palettes.js ---
/**
 * PixelForge Studio — Master Color Palettes & Perceptual Color Math (CIELAB)
 */
const BUILTIN_PALETTES = {
  fantasy16: {
    name: "16-Color Fantasy Tactical (Final Fantasy Tactics / Ogre)",
    colors: [
      "#141013", "#2b2330", "#463c57", "#716a7d",
      "#a8a5b5", "#e8e6f0", "#4f2524", "#8a4236",
      "#c96d44", "#f0a85d", "#f7dc88", "#223b2c",
      "#3f6e43", "#73a859", "#243757", "#426896"
    ]
  },
  jrpg32: {
    name: "32-Color 16-Bit JRPG Master (Chrono / Mana)",
    colors: [
      "#0d0b10", "#1e1a24", "#342e40", "#524b63",
      "#7a728f", "#a7a0ba", "#d4d0e0", "#f7f5fa",
      "#3b1725", "#692434", "#a1353e", "#d65645",
      "#ed8751", "#f7be68", "#fae893", "#402618",
      "#6b4126", "#9c6338", "#c99053", "#e6ba7e",
      "#182b29", "#24473b", "#396e4c", "#5c9c5c",
      "#8cc76f", "#1a2238", "#283b63", "#3b6199",
      "#5991c9", "#87c5eb", "#522959", "#8c4685"
    ]
  },
  gameboy4: {
    name: "GameBoy DMG 4-Color Classic",
    colors: [
      "#0f380f", "#306230", "#8bac0f", "#9bbc0f"
    ]
  },
  pico16: {
    name: "PICO-8 16-Color Retro Arcade",
    colors: [
      "#000000", "#1D2B53", "#7E2553", "#008751",
      "#AB5236", "#5F574F", "#C2C3C7", "#FFF1E8",
      "#FF004D", "#FFA300", "#FFEC27", "#00E436",
      "#29ADFF", "#83769C", "#FF77A8", "#FFCCAA"
    ]
  },
  cyber20: {
    name: "20-Color Dark Sci-Fi / Tactical Mecha",
    colors: [
      "#0b0c10", "#181b24", "#282e3d", "#424c63",
      "#6b7999", "#a3b2d1", "#e1eaf7", "#3d142c",
      "#781d42", "#bf2651", "#ff4769", "#472814",
      "#8c4f1d", "#db8625", "#ffc83b", "#0d3330",
      "#176659", "#24a889", "#36f5c2", "#00e5ff"
    ]
  }
};

/**
 * Convert HEX string (#RRGGBB or RRGGBB) to {r, g, b} [0..255]
 */
function hexToRgb(hex) {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

/**
 * Convert {r, g, b} [0..255] to uppercase #RRGGBB string
 */
function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v) => clamp(v).toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert sRGB [0..255] to CIE L*a*b* (D65 illuminant)
 * Used for perceptual palette quantization and selective outlining.
 */
function rgbToLab(r, g, b) {
  // 1. Normalize sRGB to [0..1] and linearize gamma
  let sr = r / 255;
  let sg = g / 255;
  let sb = b / 255;

  sr = sr > 0.04045 ? Math.pow((sr + 0.055) / 1.055, 2.4) : sr / 12.92;
  sg = sg > 0.04045 ? Math.pow((sg + 0.055) / 1.055, 2.4) : sg / 12.92;
  sb = sb > 0.04045 ? Math.pow((sb + 0.055) / 1.055, 2.4) : sb / 12.92;

  // 2. Linear RGB to CIE XYZ (D65 reference white: Xn=0.95047, Yn=1.00000, Zn=1.08883)
  const x = (sr * 0.4124564 + sg * 0.3575761 + sb * 0.1804375) / 0.95047;
  const y = (sr * 0.2126729 + sg * 0.7151522 + sb * 0.0721750) / 1.00000;
  const z = (sr * 0.0193339 + sg * 0.1191920 + sb * 0.9503041) / 1.08883;

  // 3. XYZ to CIELAB
  const epsilon = 0.008856;
  const kappa = 7.787;
  const fx = x > epsilon ? Math.cbrt(x) : (kappa * x) + (16 / 116);
  const fy = y > epsilon ? Math.cbrt(y) : (kappa * y) + (16 / 116);
  const fz = z > epsilon ? Math.cbrt(z) : (kappa * z) + (16 / 116);

  const L = (116 * fy) - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);

  return { L, a, b: bVal };
}

/**
 * Compute Euclidean Delta-E (CIE76) distance in L*a*b* space.
 * Returns squared or true Euclidean distance.
 */
function deltaE(lab1, lab2) {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Precompute RGB + CIELAB lookup table for a hex palette array
 */
function buildPaletteLookup(hexArray) {
  return hexArray.map((hex, index) => {
    const { r, g, b } = hexToRgb(hex);
    const lab = rgbToLab(r, g, b);
    return {
      index,
      hex: rgbToHex(r, g, b),
      r,
      g,
      b,
      L: lab.L,
      a: lab.a,
      bLab: lab.b,
      lab
    };
  });
}

/**
 * Parse imported palette text (.hex, .pal JASC-PAL, or JSON array)
 */
function parsePaletteFileText(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Try JSON first
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : (parsed.colors || []);
      return arr
        .map((c) => {
          const { r, g, b } = hexToRgb(String(c));
          return rgbToHex(r, g, b);
        })
        .filter(Boolean);
    } catch (_) {
      // Fall through to line parser
    }
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Check if JASC-PAL format
  if (lines[0] === "JASC-PAL") {
    const colors = [];
    for (let i = 3; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/).map(Number);
      if (parts.length >= 3 && !parts.some(Number.isNaN)) {
        colors.push(rgbToHex(parts[0], parts[1], parts[2]));
      }
    }
    return colors;
  }

  // Otherwise parse hex codes or R G B lines
  const result = [];
  for (const line of lines) {
    if (line.startsWith(";") || line.startsWith("//")) continue;
    const hexMatch = line.match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
    if (hexMatch) {
      const { r, g, b } = hexToRgb(hexMatch[1]);
      result.push(rgbToHex(r, g, b));
      continue;
    }
    const rgbParts = line.split(/\s+/).map(Number);
    if (rgbParts.length >= 3 && !rgbParts.slice(0, 3).some(Number.isNaN)) {
      result.push(rgbToHex(rgbParts[0], rgbParts[1], rgbParts[2]));
    }
  }
  return result;
}

/**
 * Format palette into exportable formats (.hex, .pal, .json)
 */
function formatPaletteExport(hexArray, format = "hex") {
  if (format === "json") {
    return JSON.stringify(
      {
        application: "PixelForge Studio",
        count: hexArray.length,
        colors: hexArray
      },
      null,
      2
    );
  }
  if (format === "pal") {
    const lines = ["JASC-PAL", "0100", String(hexArray.length)];
    for (const hex of hexArray) {
      const { r, g, b } = hexToRgb(hex);
      lines.push(`${r} ${g} ${b}`);
    }
    return lines.join("\n");
  }
  // Default .hex format
  return hexArray.map((h) => h.replace(/^#/, "").toUpperCase()).join("\n");
}

/**
 * Extract a suggested N-color Master Palette directly from an ImageData buffer
 * (typically the chroma-keyed, center-sampled sprite in Stage 4) so the user can
 * retain the exact look, shading ramps, and accent hues of their uploaded image.
 *
 * Uses perceptual CIELAB frequency-weighted furthest-point seeding + medoid snapping
 * so every suggested swatch is a crisp, genuine color from the sprite.
 *
 * @param {ImageData} imageData - Keyed / downscaled sprite ImageData (alpha < 128 ignored)
 * @param {number} targetCount - Number of colors to extract (e.g. 8, 12, 16, 24, 32)
 * @returns {string[]} Array of uppercase #RRGGBB hex strings
 */
function extractDominantSpritePalette(imageData, targetCount = 16, keyHex = null) {
  if (!imageData || !imageData.data) return [...BUILTIN_PALETTES.fantasy16.colors];

  const data = imageData.data;
  const bucketMap = new Map();

  const keyRgb = keyHex ? hexToRgb(keyHex) : null;
  const filterKeyDistSq = keyRgb ? Math.pow(48, 2) : -1;

  // 1. Group opaque pixels into 6-bit RGB buckets (step of 4) to merge sensor/JPEG micro-noise
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Ignore residual chroma-key background or magenta fringe pixels
    if (r > 85 && b > 85 && g < Math.min(r, b) * 0.45 && Math.abs(r - b) < 60) {
      continue;
    }

    if (keyRgb) {
      const dr = r - keyRgb.r;
      const dg = g - keyRgb.g;
      const db = b - keyRgb.b;
      if (dr * dr + dg * dg + db * db <= filterKeyDistSq) {
        continue;
      }
    }

    const qr = r & 0xfc;
    const qg = g & 0xfc;
    const qb = b & 0xfc;
    const key = (qr << 16) | (qg << 8) | qb;

    let entry = bucketMap.get(key);
    if (!entry) {
      entry = { count: 0, sumR: 0, sumG: 0, sumB: 0 };
      bucketMap.set(key, entry);
    }
    entry.count++;
    entry.sumR += r;
    entry.sumG += g;
    entry.sumB += b;
  }

  if (bucketMap.size === 0) {
    return [...BUILTIN_PALETTES.fantasy16.colors].slice(0, targetCount);
  }

  // 2. Build candidate color nodes in CIELAB space
  const nodes = [];
  for (const entry of bucketMap.values()) {
    const r = Math.round(entry.sumR / entry.count);
    const g = Math.round(entry.sumG / entry.count);
    const b = Math.round(entry.sumB / entry.count);
    const lab = rgbToLab(r, g, b);
    nodes.push({
      r,
      g,
      b,
      hex: rgbToHex(r, g, b),
      count: entry.count,
      lab
    });
  }

  // Sort descending by pixel frequency
  nodes.sort((a, b) => b.count - a.count);

  const k = Math.max(2, Math.min(targetCount, nodes.length));
  if (nodes.length <= k) {
    return nodes
      .slice()
      .sort((a, b) => a.lab.L - b.lab.L)
      .map((n) => n.hex);
  }

  // 3. Seed 1: Darkest significant outline/shadow color (so outlines stay crisp)
  let darkestNode = nodes[0];
  for (const n of nodes) {
    if (n.count >= 2 && n.lab.L < darkestNode.lab.L) {
      darkestNode = n;
    }
  }

  const seeds = [darkestNode];
  const minDistSq = new Float64Array(nodes.length).fill(Infinity);

  const updateDistances = (newSeed) => {
    for (let i = 0; i < nodes.length; i++) {
      const dL = nodes[i].lab.L - newSeed.lab.L;
      const da = nodes[i].lab.a - newSeed.lab.a;
      const db = nodes[i].lab.b - newSeed.lab.b;
      const dSq = dL * dL + da * da + db * db;
      if (dSq < minDistSq[i]) {
        minDistSq[i] = dSq;
      }
    }
  };

  updateDistances(darkestNode);

  // Also ensure the most frequent dominant color is included early
  if (nodes[0] !== darkestNode && seeds.length < k) {
    seeds.push(nodes[0]);
    updateDistances(nodes[0]);
  }

  // 4. Perceptual furthest-point + frequency-weighted seeding for remaining k - seeds.length colors
  // Weighting by Math.pow(count, 0.38) * minDeltaE preserves both main armor/cape ramps and distinct accents (gold, eyes, skin)
  while (seeds.length < k) {
    let bestIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < nodes.length; i++) {
      if (minDistSq[i] < 4.0) continue; // Ignore near-duplicates (< 2.0 Delta-E)
      const dist = Math.sqrt(minDistSq[i]);
      const score = dist * Math.pow(nodes[i].count, 0.38);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;
    const chosen = nodes[bestIdx];
    seeds.push(chosen);
    updateDistances(chosen);
  }

  // 5. Run 4 iterations of CIELAB cluster assignment & medoid snapping
  // (snapping each cluster center to the highest-weight real sprite color near the centroid)
  let centroids = seeds.map((s) => ({ L: s.lab.L, a: s.lab.a, b: s.lab.b }));
  const assignments = new Int32Array(nodes.length);

  for (let iter = 0; iter < 4; iter++) {
    const sumL = new Float64Array(centroids.length);
    const sumA = new Float64Array(centroids.length);
    const sumB = new Float64Array(centroids.length);
    const sumW = new Float64Array(centroids.length);

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dL = n.lab.L - centroids[c].L;
        const da = n.lab.a - centroids[c].a;
        const db = n.lab.b - centroids[c].b;
        const d = dL * dL + da * da + db * db;
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      assignments[i] = bestC;
      const w = Math.pow(n.count, 0.65);
      sumL[bestC] += n.lab.L * w;
      sumA[bestC] += n.lab.a * w;
      sumB[bestC] += n.lab.b * w;
      sumW[bestC] += w;
    }

    for (let c = 0; c < centroids.length; c++) {
      if (sumW[c] > 0) {
        centroids[c] = {
          L: sumL[c] / sumW[c],
          a: sumA[c] / sumW[c],
          b: sumB[c] / sumW[c]
        };
      }
    }
  }

  // 6. Snap each cluster to its best representative real node (medoid) and deduplicate hexes
  const chosenHexSet = new Set();
  const finalNodes = [];

  for (let c = 0; c < centroids.length; c++) {
    let bestNode = null;
    let bestMetric = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (assignments[i] !== c) continue;
      const n = nodes[i];
      const dL = n.lab.L - centroids[c].L;
      const da = n.lab.a - centroids[c].a;
      const db = n.lab.b - centroids[c].b;
      const dist = Math.sqrt(dL * dL + da * da + db * db);
      const metric = dist / Math.pow(n.count, 0.25);
      if (metric < bestMetric && !chosenHexSet.has(n.hex)) {
        bestMetric = metric;
        bestNode = n;
      }
    }
    if (bestNode) {
      chosenHexSet.add(bestNode.hex);
      finalNodes.push(bestNode);
    }
  }

  // Sort final swatches cleanly from dark to light (L*)
  finalNodes.sort((a, b) => a.lab.L - b.lab.L);
  return finalNodes.map((n) => n.hex);
}


// --- js/mannequin.js ---
/**
 * PixelForge Studio — Stage 2: Base Mannequin & Pose Blockout Generator
 * Renders a crisp, zero-AA Color-ID parametric mannequin onto native resolution ImageData,
 * supports Nearest-Neighbor upscaling to target AI resolution, Sobel Edge/Canny Map generation,
 * and multi-frame horizontal conditioning strip stitching.
 */
const MANNEQUIN_COLORS = {
  HEAD: "#FF5555",       // Red
  TORSO: "#55FF55",      // Green
  FRONT_ARM: "#5555FF",  // Blue
  BACK_ARM: "#FFFF55",   // Yellow
  FRONT_LEG: "#FF55FF",  // Magenta-Pink
  BACK_LEG: "#55FFFF",   // Cyan
  WEAPON: "#FFFFFF",     // White
  BG: "#000000"          // Black conditioning background
};
const POSE_PRESETS = {
  idle: {
    name: "Idle Combat Ready",
    headTilt: 0,
    torsoLean: 2,
    frontArmAngle: 22,
    frontElbowBend: 55,
    backArmAngle: -18,
    backElbowBend: 45,
    frontLegAngle: 8,
    frontKneeBend: 12,
    backLegAngle: -10,
    backKneeBend: 16,
    weaponAngle: -35,
    bobOffset: 0
  },
  walk1: {
    name: "Walk Frame 1 (Contact Heel Strike)",
    headTilt: 2,
    torsoLean: 6,
    frontArmAngle: -28,
    frontElbowBend: 40,
    backArmAngle: 32,
    backElbowBend: 45,
    frontLegAngle: 24,
    frontKneeBend: 8,
    backLegAngle: -22,
    backKneeBend: 35,
    weaponAngle: -15,
    bobOffset: 0
  },
  walk2: {
    name: "Walk Frame 2 (Passing Low - Deep Knee Dip)",
    headTilt: 0,
    torsoLean: 5,
    frontArmAngle: -6,
    frontElbowBend: 50,
    backArmAngle: 8,
    backElbowBend: 50,
    frontLegAngle: 4,
    frontKneeBend: 28,
    backLegAngle: -2,
    backKneeBend: 65,
    weaponAngle: -28,
    bobOffset: 2
  },
  walk3: {
    name: "Walk Frame 3 (Opposite Contact)",
    headTilt: -2,
    torsoLean: 6,
    frontArmAngle: 32,
    frontElbowBend: 45,
    backArmAngle: -28,
    backElbowBend: 40,
    frontLegAngle: -22,
    frontKneeBend: 35,
    backLegAngle: 24,
    backKneeBend: 8,
    weaponAngle: -45,
    bobOffset: 0
  },
  walk4: {
    name: "Walk Frame 4 (Passing High - Knee Lift)",
    headTilt: 0,
    torsoLean: 4,
    frontArmAngle: 8,
    frontElbowBend: 50,
    backArmAngle: -6,
    backElbowBend: 50,
    frontLegAngle: -4,
    frontKneeBend: 65,
    backLegAngle: 4,
    backKneeBend: 12,
    weaponAngle: -32,
    bobOffset: -1
  },
  run1: {
    name: "Run Frame 1 (Forward Drive & Bent Arms)",
    headTilt: 6,
    torsoLean: 16,
    frontArmAngle: -45,
    frontElbowBend: 85,
    backArmAngle: 45,
    backElbowBend: 90,
    frontLegAngle: 35,
    frontKneeBend: 22,
    backLegAngle: -38,
    backKneeBend: 48,
    weaponAngle: -10,
    bobOffset: 0
  },
  run2: {
    name: "Run Frame 2 (Airborne High Knee Tuck)",
    headTilt: 4,
    torsoLean: 14,
    frontArmAngle: -15,
    frontElbowBend: 90,
    backArmAngle: 15,
    backElbowBend: 90,
    frontLegAngle: 10,
    frontKneeBend: 80,
    backLegAngle: -12,
    backKneeBend: 85,
    weaponAngle: -25,
    bobOffset: -3
  },
  run3: {
    name: "Run Frame 3 (Opposite Drive)",
    headTilt: 6,
    torsoLean: 16,
    frontArmAngle: 45,
    frontElbowBend: 90,
    backArmAngle: -45,
    backElbowBend: 85,
    frontLegAngle: -38,
    frontKneeBend: 48,
    backLegAngle: 35,
    backKneeBend: 22,
    weaponAngle: -45,
    bobOffset: 0
  },
  run4: {
    name: "Run Frame 4 (Opposite Airborne High Knee Tuck)",
    headTilt: 4,
    torsoLean: 14,
    frontArmAngle: 15,
    frontElbowBend: 90,
    backArmAngle: -15,
    backElbowBend: 90,
    frontLegAngle: -12,
    frontKneeBend: 85,
    backLegAngle: 10,
    backKneeBend: 80,
    weaponAngle: -20,
    bobOffset: -3
  },
  attackWindup: {
    name: "Attack Windup (Coiled Elbow & Crouch)",
    headTilt: -8,
    torsoLean: -12,
    frontArmAngle: -105,
    frontElbowBend: 110,
    backArmAngle: -35,
    backElbowBend: 60,
    frontLegAngle: 16,
    frontKneeBend: 35,
    backLegAngle: -24,
    backKneeBend: 42,
    weaponAngle: -135,
    bobOffset: 2
  },
  attackStrike: {
    name: "Attack Strike (Deep Lunge & Slash Extension)",
    headTilt: 10,
    torsoLean: 20,
    frontArmAngle: 45,
    frontElbowBend: 25,
    backArmAngle: -45,
    backElbowBend: 70,
    frontLegAngle: -30,
    frontKneeBend: 52,
    backLegAngle: 28,
    backKneeBend: 18,
    weaponAngle: 25,
    bobOffset: 3
  },
  attackFollow: {
    name: "Attack Follow-Through (Low Arc Recovery)",
    headTilt: 4,
    torsoLean: 10,
    frontArmAngle: 65,
    frontElbowBend: 40,
    backArmAngle: -25,
    backElbowBend: 50,
    frontLegAngle: -18,
    frontKneeBend: 35,
    backLegAngle: 16,
    backKneeBend: 25,
    weaponAngle: 45,
    bobOffset: 1
  },
  smash: {
    name: "Heavy Overhead Smash",
    headTilt: 8,
    torsoLean: 18,
    frontArmAngle: 55,
    frontElbowBend: 35,
    backArmAngle: 45,
    backElbowBend: 45,
    frontLegAngle: -15,
    frontKneeBend: 48,
    backLegAngle: 15,
    backKneeBend: 48,
    weaponAngle: 75,
    bobOffset: 4
  },
  smashImpact: {
    name: "Smash Ground Impact (Shockwave)",
    headTilt: 12,
    torsoLean: 24,
    frontArmAngle: 75,
    frontElbowBend: 20,
    backArmAngle: 60,
    backElbowBend: 30,
    frontLegAngle: -20,
    frontKneeBend: 58,
    backLegAngle: 20,
    backKneeBend: 55,
    weaponAngle: 95,
    bobOffset: 5
  },
  castCharge: {
    name: "Cast Charge (Energy Focus)",
    headTilt: -4,
    torsoLean: 2,
    frontArmAngle: -25,
    frontElbowBend: 70,
    backArmAngle: 20,
    backElbowBend: 65,
    frontLegAngle: 10,
    frontKneeBend: 18,
    backLegAngle: -10,
    backKneeBend: 20,
    weaponAngle: -45,
    bobOffset: 1
  },
  castChannel: {
    name: "Spell Cast Channel (Raised Elbows)",
    headTilt: -10,
    torsoLean: -4,
    frontArmAngle: -85,
    frontElbowBend: 65,
    backArmAngle: -65,
    backElbowBend: 80,
    frontLegAngle: 10,
    frontKneeBend: 18,
    backLegAngle: -12,
    backKneeBend: 22,
    weaponAngle: -90,
    bobOffset: -2
  },
  cast: {
    name: "Spell Cast Channel (Raised Elbows)",
    headTilt: -10,
    torsoLean: -4,
    frontArmAngle: -85,
    frontElbowBend: 65,
    backArmAngle: -65,
    backElbowBend: 80,
    frontLegAngle: 10,
    frontKneeBend: 18,
    backLegAngle: -12,
    backKneeBend: 22,
    weaponAngle: -90,
    bobOffset: -2
  },
  castRelease: {
    name: "Cast Release (Magic Wave Thrust)",
    headTilt: 8,
    torsoLean: 16,
    frontArmAngle: 35,
    frontElbowBend: 30,
    backArmAngle: -30,
    backElbowBend: 65,
    frontLegAngle: -24,
    frontKneeBend: 48,
    backLegAngle: 22,
    backKneeBend: 22,
    weaponAngle: 30,
    bobOffset: 2
  },
  castRecover: {
    name: "Cast Cooldown Guard",
    headTilt: 0,
    torsoLean: 2,
    frontArmAngle: 0,
    frontElbowBend: 50,
    backArmAngle: -10,
    backElbowBend: 45,
    frontLegAngle: 6,
    frontKneeBend: 14,
    backLegAngle: -8,
    backKneeBend: 16,
    weaponAngle: -35,
    bobOffset: 0
  },
  hitBrace: {
    name: "Hit Brace Guard (Shield Raised)",
    headTilt: -6,
    torsoLean: -6,
    frontArmAngle: -45,
    frontElbowBend: 95,
    backArmAngle: -20,
    backElbowBend: 55,
    frontLegAngle: 14,
    frontKneeBend: 24,
    backLegAngle: -16,
    backKneeBend: 30,
    weaponAngle: -70,
    bobOffset: 0
  },
  hitImpact: {
    name: "Hit Knockback Impact",
    headTilt: -18,
    torsoLean: -20,
    frontArmAngle: -65,
    frontElbowBend: 105,
    backArmAngle: -80,
    backElbowBend: 85,
    frontLegAngle: 24,
    frontKneeBend: 45,
    backLegAngle: -28,
    backKneeBend: 55,
    weaponAngle: -95,
    bobOffset: 3
  },
  hitDefend: {
    name: "Hit Reaction / Shield Brace",
    headTilt: -14,
    torsoLean: -16,
    frontArmAngle: -45,
    frontElbowBend: 95,
    backArmAngle: -65,
    backElbowBend: 75,
    frontLegAngle: 18,
    frontKneeBend: 38,
    backLegAngle: -24,
    backKneeBend: 48,
    weaponAngle: -80,
    bobOffset: 2
  },
  hitSkid: {
    name: "Hit Skid Recovery",
    headTilt: -8,
    torsoLean: -10,
    frontArmAngle: -30,
    frontElbowBend: 80,
    backArmAngle: -40,
    backElbowBend: 65,
    frontLegAngle: 10,
    frontKneeBend: 32,
    backLegAngle: -14,
    backKneeBend: 36,
    weaponAngle: -60,
    bobOffset: 2
  },
  hitRecover: {
    name: "Hit Recovery to Combat Guard",
    headTilt: -2,
    torsoLean: 0,
    frontArmAngle: 10,
    frontElbowBend: 60,
    backArmAngle: -15,
    backElbowBend: 50,
    frontLegAngle: 6,
    frontKneeBend: 16,
    backLegAngle: -8,
    backKneeBend: 18,
    weaponAngle: -40,
    bobOffset: 0
  },
  jumpSquash: {
    name: "Jump Frame 1 (Crouch Squash)",
    headTilt: 4,
    torsoLean: 10,
    frontArmAngle: -20,
    frontElbowBend: 65,
    backArmAngle: 25,
    backElbowBend: 60,
    frontLegAngle: 20,
    frontKneeBend: 55,
    backLegAngle: -15,
    backKneeBend: 50,
    weaponAngle: -30,
    bobOffset: 4
  },
  jumpAscent: {
    name: "Jump Frame 2 (Launch Extension)",
    headTilt: -4,
    torsoLean: 2,
    frontArmAngle: -70,
    frontElbowBend: 35,
    backArmAngle: -45,
    backElbowBend: 30,
    frontLegAngle: -6,
    frontKneeBend: 8,
    backLegAngle: 8,
    backKneeBend: 10,
    weaponAngle: -80,
    bobOffset: -3
  },
  jumpApex: {
    name: "Jump Frame 3 (Mid-Air Apex Tucked Knees)",
    headTilt: 0,
    torsoLean: 6,
    frontArmAngle: -40,
    frontElbowBend: 70,
    backArmAngle: 30,
    backElbowBend: 65,
    frontLegAngle: 12,
    frontKneeBend: 85,
    backLegAngle: -8,
    backKneeBend: 90,
    weaponAngle: -40,
    bobOffset: -6
  },
  jump: {
    name: "Jump Apex (Tucked Knees)",
    headTilt: 0,
    torsoLean: 6,
    frontArmAngle: -40,
    frontElbowBend: 70,
    backArmAngle: 30,
    backElbowBend: 65,
    frontLegAngle: 12,
    frontKneeBend: 85,
    backLegAngle: -8,
    backKneeBend: 90,
    weaponAngle: -40,
    bobOffset: -6
  },
  jumpLand: {
    name: "Jump Frame 4 (Landing Impact Absorption)",
    headTilt: 6,
    torsoLean: 12,
    frontArmAngle: 10,
    frontElbowBend: 75,
    backArmAngle: -15,
    backElbowBend: 70,
    frontLegAngle: 16,
    frontKneeBend: 52,
    backLegAngle: -18,
    backKneeBend: 48,
    weaponAngle: -15,
    bobOffset: 3
  },
  idleBreatheLow: {
    name: "Idle Breathing Dip",
    headTilt: 0,
    torsoLean: 2,
    frontArmAngle: 20,
    frontElbowBend: 58,
    backArmAngle: -20,
    backElbowBend: 48,
    frontLegAngle: 8,
    frontKneeBend: 16,
    backLegAngle: -10,
    backKneeBend: 20,
    weaponAngle: -32,
    bobOffset: 1
  },
  idleBreatheSettle: {
    name: "Idle Breathing Settle",
    headTilt: 1,
    torsoLean: 3,
    frontArmAngle: 18,
    frontElbowBend: 62,
    backArmAngle: -22,
    backElbowBend: 50,
    frontLegAngle: 8,
    frontKneeBend: 18,
    backLegAngle: -10,
    backKneeBend: 22,
    weaponAngle: -30,
    bobOffset: 2
  },
  idleBreatheRise: {
    name: "Idle Inhale Rise",
    headTilt: -1,
    torsoLean: 1,
    frontArmAngle: 24,
    frontElbowBend: 52,
    backArmAngle: -16,
    backElbowBend: 42,
    frontLegAngle: 8,
    frontKneeBend: 10,
    backLegAngle: -10,
    backKneeBend: 14,
    weaponAngle: -38,
    bobOffset: -1
  },
  victoryPump: {
    name: "Victory Raise Weapon",
    headTilt: -4,
    torsoLean: 2,
    frontArmAngle: -90,
    frontElbowBend: 85,
    backArmAngle: 15,
    backElbowBend: 50,
    frontLegAngle: 6,
    frontKneeBend: 12,
    backLegAngle: -8,
    backKneeBend: 14,
    weaponAngle: -110,
    bobOffset: -1
  },
  victoryPeak: {
    name: "Victory Cheer (Pumped Arm & Bent Knee)",
    headTilt: -8,
    torsoLean: 4,
    frontArmAngle: -150,
    frontElbowBend: 75,
    backArmAngle: 25,
    backElbowBend: 45,
    frontLegAngle: 12,
    frontKneeBend: 24,
    backLegAngle: -14,
    backKneeBend: 28,
    weaponAngle: -160,
    bobOffset: -2
  },
  victory: {
    name: "Victory Cheer (Pumped Arm & Bent Knee)",
    headTilt: -6,
    torsoLean: 0,
    frontArmAngle: -150,
    frontElbowBend: 75,
    backArmAngle: 25,
    backElbowBend: 45,
    frontLegAngle: 8,
    frontKneeBend: 14,
    backLegAngle: -10,
    backKneeBend: 18,
    weaponAngle: -160,
    bobOffset: 0
  },
  victoryReturn: {
    name: "Victory Salutation Lower",
    headTilt: -2,
    torsoLean: 0,
    frontArmAngle: -70,
    frontElbowBend: 65,
    backArmAngle: 10,
    backElbowBend: 45,
    frontLegAngle: 8,
    frontKneeBend: 12,
    backLegAngle: -10,
    backKneeBend: 16,
    weaponAngle: -80,
    bobOffset: 0
  }
};

/**
 * Low-level crisp integer pixel primitives operating directly on ImageData
 */
function setPixelRgb(data, width, height, x, y, rgb) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= width || iy < 0 || iy >= height) return;
  const idx = (iy * width + ix) * 4;
  data[idx] = rgb.r;
  data[idx + 1] = rgb.g;
  data[idx + 2] = rgb.b;
  data[idx + 3] = 255;
}

function drawFilledEllipse(data, width, height, cx, cy, rx, ry, angleDeg, hexColor) {
  const rgb = hexToRgb(hexColor);
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const maxR = Math.ceil(Math.max(rx, ry)) + 1;

  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      const lx = dx * cosA + dy * sinA;
      const ly = -dx * sinA + dy * cosA;
      const norm = (lx * lx) / (rx * rx + 0.001) + (ly * ly) / (ry * ry + 0.001);
      if (norm <= 1.0) {
        setPixelRgb(data, width, height, cx + dx, cy + dy, rgb);
      }
    }
  }
}

function drawCapsuleSegment(data, width, height, x0, y0, x1, y1, radius, hexColor) {
  const rgb = hexToRgb(hexColor);
  const minX = Math.floor(Math.min(x0, x1) - radius - 1);
  const maxX = Math.ceil(Math.max(x0, x1) + radius + 1);
  const minY = Math.floor(Math.min(y0, y1) - radius - 1);
  const maxY = Math.ceil(Math.max(y0, y1) + radius + 1);

  const vx = x1 - x0;
  const vy = y1 - y0;
  const lenSq = vx * vx + vy * vy;
  const rSq = radius * radius;

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      let t = 0;
      if (lenSq > 0.0001) {
        t = ((px - x0) * vx + (py - y0) * vy) / lenSq;
        t = Math.max(0, Math.min(1, t));
      }
      const projX = x0 + t * vx;
      const projY = y0 + t * vy;
      const distSq = (px - projX) * (px - projX) + (py - projY) * (py - projY);
      if (distSq <= rSq) {
        setPixelRgb(data, width, height, px, py, rgb);
      }
    }
  }
}

function drawOrientedQuad(data, width, height, cx, cy, halfWTop, halfWBot, halfH, angleDeg, hexColor) {
  const rgb = hexToRgb(hexColor);
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const bound = Math.ceil(Math.max(halfWTop, halfWBot, halfH) * 1.6) + 2;

  for (let dy = -bound; dy <= bound; dy++) {
    for (let dx = -bound; dx <= bound; dx++) {
      const lx = dx * cosA + dy * sinA;
      const ly = -dx * sinA + dy * cosA;
      if (ly >= -halfH && ly <= halfH) {
        const t = (ly + halfH) / (2 * halfH + 0.001);
        const allowedHalfW = halfWTop * (1 - t) + halfWBot * t;
        if (Math.abs(lx) <= allowedHalfW) {
          setPixelRgb(data, width, height, cx + dx, cy + dy, rgb);
        }
      }
    }
  }
}

/**
 * Compute all joint coordinates and render the parametric Color-ID mannequin
 * into a native resolution ImageData object.
 */
function renderMannequinImageData(width, height, params = {}) {
  const {
    headRatio = 1.25,       // 0.8 (realistic) to 1.8 (chibi)
    shoulderWidth = 1.0,    // 0.7 to 1.5
    limbThickness = 1.0,    // 0.7 to 1.5
    facing = "SE",          // SE, SW, NE, NW, N, S, E, W
    headTilt = 0,
    torsoLean = 2,
    frontArmAngle = 22,
    frontElbowBend = 55,
    backArmAngle = -18,
    backElbowBend = 45,
    frontLegAngle = 8,
    frontKneeBend = 12,
    backLegAngle = -8,
    backKneeBend = 16,
    weaponAngle = -35,
    bobOffset = 0,
    showWeapon = true,
    transparentBg = false
  } = params;

  const imgData = new ImageData(width, height);
  const data = imgData.data;

  if (!transparentBg) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }

  // Scale metrics relative to canvas dimensions
  const scale = Math.min(width, height) / 64;
  const cx = width * 0.5;
  const groundY = height * 0.88;

  // Facing direction horizontal multiplier and isometric depth offset
  const isLeft = facing.includes("W");
  const isBack = facing.includes("N");
  const isSide = facing === "E" || facing === "W";
  const dirX = isLeft ? -1 : 1;
  const isoTwist = facing === "N" || facing === "S" ? 1.15 : isSide ? 0.65 : 0.92;

  const limbR = Math.max(1.4, 2.5 * limbThickness * scale);
  const upperLegLen = 7.2 * scale;
  const lowerLegLen = 7.0 * scale;
  const upperArmLen = 6.2 * scale;
  const lowerArmLen = 6.4 * scale;
  const torsoH = 14.0 * scale;
  const headR = Math.max(3.5, 6.8 * headRatio * scale);

  const hipY = groundY - (upperLegLen + lowerLegLen) + bobOffset * scale;
  const hipSpread = 3.2 * shoulderWidth * isoTwist * scale;

  const backHipX = cx - dirX * hipSpread * 0.75;
  const backHipY = hipY - (isBack ? -1.0 : 1.0) * scale;
  const frontHipX = cx + dirX * hipSpread * 0.75;
  const frontHipY = hipY + (isBack ? -0.5 : 0.5) * scale;

  const leanRad = (torsoLean * dirX * Math.PI) / 180;
  const torsoCenterX = cx + Math.sin(leanRad) * (torsoH * 0.5);
  const torsoCenterY = hipY - Math.cos(leanRad) * (torsoH * 0.5);

  const neckX = cx + Math.sin(leanRad) * torsoH;
  const neckY = hipY - Math.cos(leanRad) * torsoH;

  const shoulderSpan = 5.6 * shoulderWidth * isoTwist * scale;
  const backShoulderX = neckX - dirX * shoulderSpan * 0.85;
  const backShoulderY = neckY + 2.0 * scale;
  const frontShoulderX = neckX + dirX * shoulderSpan * 0.85;
  const frontShoulderY = neckY + 2.6 * scale;

  // 1. Compute Articulated Back Leg (Hip -> Knee -> Ankle -> Directional Toe)
  const bThighRad = ((backLegAngle * dirX) * Math.PI) / 180;
  const backKneeX = backHipX + Math.sin(bThighRad) * upperLegLen;
  const backKneeY = backHipY + Math.cos(bThighRad) * upperLegLen;

  const bShinRad = (((backLegAngle - backKneeBend * 0.92) * dirX) * Math.PI) / 180;
  const backAnkleX = backKneeX + Math.sin(bShinRad) * lowerLegLen;
  const backAnkleY = backKneeY + Math.cos(bShinRad) * lowerLegLen;

  const footLen = 4.2 * scale;
  const backToeX = backAnkleX + dirX * footLen * (isBack ? 0.35 : 0.88);
  const backToeY = backAnkleY + (isBack ? -0.6 : 0.5) * scale;

  // 2. Compute Articulated Front Leg (Hip -> Knee -> Ankle -> Directional Toe)
  const fThighRad = ((frontLegAngle * dirX) * Math.PI) / 180;
  const frontKneeX = frontHipX + Math.sin(fThighRad) * upperLegLen;
  const frontKneeY = frontHipY + Math.cos(fThighRad) * upperLegLen;

  const fShinRad = (((frontLegAngle - frontKneeBend * 0.92) * dirX) * Math.PI) / 180;
  const frontAnkleX = frontKneeX + Math.sin(fShinRad) * lowerLegLen;
  const frontAnkleY = frontKneeY + Math.cos(fShinRad) * lowerLegLen;

  const frontToeX = frontAnkleX + dirX * footLen * (isBack ? 0.35 : 0.88);
  const frontToeY = frontAnkleY + (isBack ? -0.6 : 0.5) * scale;

  // 3. Compute Articulated Back Arm (Shoulder -> Elbow -> Hand)
  const bArmRad = ((backArmAngle * dirX) * Math.PI) / 180;
  const backElbowX = backShoulderX + Math.sin(bArmRad) * upperArmLen;
  const backElbowY = backShoulderY + Math.cos(bArmRad) * upperArmLen;

  const bForearmRad = (((backArmAngle + backElbowBend * 0.92) * dirX) * Math.PI) / 180;
  const backHandX = backElbowX + Math.sin(bForearmRad) * lowerArmLen;
  const backHandY = backElbowY + Math.cos(bForearmRad) * lowerArmLen;

  // 4. Compute Articulated Front Arm (Shoulder -> Elbow -> Hand)
  const fArmRad = ((frontArmAngle * dirX) * Math.PI) / 180;
  const frontElbowX = frontShoulderX + Math.sin(fArmRad) * upperArmLen;
  const frontElbowY = frontShoulderY + Math.cos(fArmRad) * upperArmLen;

  const fForearmRad = (((frontArmAngle + frontElbowBend * 0.92) * dirX) * Math.PI) / 180;
  const frontHandX = frontElbowX + Math.sin(fForearmRad) * lowerArmLen;
  const frontHandY = frontElbowY + Math.cos(fForearmRad) * lowerArmLen;

  // 5. Weapon anchor extends from front hand
  const weapRad = ((weaponAngle * dirX) * Math.PI) / 180;
  const weapLen = 19 * scale;
  const weapTipX = frontHandX + Math.cos(weapRad) * weapLen * dirX;
  const weapTipY = frontHandY + Math.sin(weapRad) * weapLen;
  const weapPommelX = frontHandX - Math.cos(weapRad) * (4 * scale) * dirX;
  const weapPommelY = frontHandY - Math.sin(weapRad) * (4 * scale);

  // 6. Head center & gaze
  const headX = neckX + Math.sin(((headTilt * dirX) * Math.PI) / 180) * (headR * 0.6);
  const headY = neckY - headR * 0.82;

  // Sub-renderers with joint disks for natural anatomical bending
  const drawArticulatedLeg = (hipX, hipY, kneeX, kneeY, ankleX, ankleY, toeX, toeY, colorHex) => {
    // Upper Thigh
    drawCapsuleSegment(data, width, height, hipX, hipY, kneeX, kneeY, limbR, colorHex);
    // Knee joint disk
    drawFilledEllipse(data, width, height, kneeX, kneeY, limbR * 1.06, limbR * 1.06, 0, colorHex);
    // Lower Shin/Calf
    drawCapsuleSegment(data, width, height, kneeX, kneeY, ankleX, ankleY, limbR * 0.92, colorHex);
    // Directional Foot / Toe
    drawCapsuleSegment(data, width, height, ankleX, ankleY, toeX, toeY, limbR * 0.86, colorHex);
  };

  const drawArticulatedArm = (shoulderX, shoulderY, elbowX, elbowY, handX, handY, colorHex) => {
    // Upper Arm
    drawCapsuleSegment(data, width, height, shoulderX, shoulderY, elbowX, elbowY, limbR * 0.95, colorHex);
    // Elbow joint disk
    drawFilledEllipse(data, width, height, elbowX, elbowY, limbR * 0.98, limbR * 0.98, 0, colorHex);
    // Lower Forearm
    drawCapsuleSegment(data, width, height, elbowX, elbowY, handX, handY, limbR * 0.88, colorHex);
    // Hand fist
    drawFilledEllipse(data, width, height, handX, handY, limbR * 0.92, limbR * 0.92, 0, colorHex);
  };

  // Painter's algorithm order depends on whether facing North (back) or South (front)
  const renderBackParts = () => {
    // Back Leg (#55FFFF Cyan)
    drawArticulatedLeg(backHipX, backHipY, backKneeX, backKneeY, backAnkleX, backAnkleY, backToeX, backToeY, MANNEQUIN_COLORS.BACK_LEG);
    // Back Arm (#FFFF55 Yellow)
    drawArticulatedArm(backShoulderX, backShoulderY, backElbowX, backElbowY, backHandX, backHandY, MANNEQUIN_COLORS.BACK_ARM);
  };

  const renderTorsoAndHead = () => {
    // 1. Torso Base Quad (#55FF55 Green)
    drawOrientedQuad(
      data,
      width,
      height,
      torsoCenterX,
      torsoCenterY,
      shoulderSpan * 0.95,
      hipSpread * 0.88,
      torsoH * 0.54,
      torsoLean * dirX,
      MANNEQUIN_COLORS.TORSO
    );

    // Front vs Back Torso Clarification
    if (!isBack) {
      // Chest breastplate highlight line (#AAFFAA)
      drawCapsuleSegment(
        data,
        width,
        height,
        torsoCenterX - dirX * (shoulderSpan * 0.22),
        torsoCenterY - torsoH * 0.25,
        torsoCenterX + dirX * (shoulderSpan * 0.35),
        torsoCenterY - torsoH * 0.08,
        Math.max(1.0, 1.4 * scale),
        "#AAFFAA"
      );
      // Belt line (#228822) & buckle (#FFFFFF)
      const beltY = torsoCenterY + torsoH * 0.32;
      drawCapsuleSegment(
        data,
        width,
        height,
        torsoCenterX - hipSpread * 0.55,
        beltY,
        torsoCenterX + hipSpread * 0.55,
        beltY,
        Math.max(1.0, 1.2 * scale),
        "#228822"
      );
      drawFilledEllipse(
        data,
        width,
        height,
        torsoCenterX + dirX * (hipSpread * 0.15),
        beltY,
        Math.max(1.2, 1.6 * scale),
        Math.max(1.2, 1.6 * scale),
        0,
        "#FFFFFF"
      );
    } else {
      // Back Spine harness line (#226622)
      drawCapsuleSegment(
        data,
        width,
        height,
        neckX,
        neckY + 1.5 * scale,
        torsoCenterX,
        hipY - 1.5 * scale,
        Math.max(1.0, 1.4 * scale),
        "#226622"
      );
    }

    // 2. Head Base Ellipse (#FF5555 Red)
    drawFilledEllipse(
      data,
      width,
      height,
      headX,
      headY,
      headR * 0.92,
      headR,
      headTilt * dirX,
      MANNEQUIN_COLORS.HEAD
    );

    // Front vs Back Head Clarification
    if (!isBack) {
      // Eye visor / gaze line in facing direction (#FFAAAA)
      const vX0 = headX + dirX * (headR * 0.12);
      const vY0 = headY - headR * 0.06;
      const vX1 = headX + dirX * (headR * 0.72);
      const vY1 = headY + headR * 0.12;
      drawCapsuleSegment(data, width, height, vX0, vY0, vX1, vY1, Math.max(1.0, 1.3 * scale), "#FFAAAA");
      // White eye pupil dot at focal point
      setPixelRgb(data, width, height, vX1, vY1, { r: 255, g: 255, b: 255 });
    } else {
      // Back of head occipital / hair contour (#AA2222)
      const crestX = headX - dirX * (headR * 0.32);
      drawFilledEllipse(data, width, height, crestX, headY - headR * 0.12, headR * 0.52, headR * 0.62, 0, "#AA2222");
    }
  };

  const renderFrontParts = () => {
    // Front Leg (#FF55FF Magenta)
    drawArticulatedLeg(frontHipX, frontHipY, frontKneeX, frontKneeY, frontAnkleX, frontAnkleY, frontToeX, frontToeY, MANNEQUIN_COLORS.FRONT_LEG);
    // Weapon/Prop (#FFFFFF White)
    if (showWeapon) {
      drawCapsuleSegment(
        data,
        width,
        height,
        weapPommelX,
        weapPommelY,
        weapTipX,
        weapTipY,
        Math.max(1.1, limbR * 0.58),
        MANNEQUIN_COLORS.WEAPON
      );
    }
    // Front Arm (#5555FF Blue)
    drawArticulatedArm(frontShoulderX, frontShoulderY, frontElbowX, frontElbowY, frontHandX, frontHandY, MANNEQUIN_COLORS.FRONT_ARM);
  };

  if (isBack) {
    renderFrontParts();
    renderTorsoAndHead();
    renderBackParts();
  } else {
    renderBackParts();
    renderTorsoAndHead();
    renderFrontParts();
  }

  return imgData;
}

/**
 * Nearest-Neighbor Upscaler from native resolution ImageData to AI Target Resolution
 */
function upscaleNearestNeighbor(srcImageData, factor) {
  const sw = srcImageData.width;
  const sh = srcImageData.height;
  const dw = sw * factor;
  const dh = sh * factor;
  const dstImageData = new ImageData(dw, dh);
  const src = srcImageData.data;
  const dst = dstImageData.data;

  for (let y = 0; y < dh; y++) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < dw; x++) {
      const sx = Math.floor(x / factor);
      const sIdx = (sy * sw + sx) * 4;
      const dIdx = (y * dw + x) * 4;
      dst[dIdx] = src[sIdx];
      dst[dIdx + 1] = src[sIdx + 1];
      dst[dIdx + 2] = src[sIdx + 2];
      dst[dIdx + 3] = src[sIdx + 3];
    }
  }
  return dstImageData;
}

/**
 * Generate a Sobel Edge / Canny Conditioning Map from an ImageData buffer
 * Detects boundaries between distinct Color-ID regions and outputs white edges on black background.
 */
function generateSobelEdgeMap(srcImageData, threshold = 40) {
  const w = srcImageData.width;
  const h = srcImageData.height;
  const src = srcImageData.data;
  const out = new ImageData(w, h);
  const dst = out.data;

  // Compute per-channel Sobel gradients so adjacent color-IDs with similar luminance still produce crisp edges
  const gxKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyKernel = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rx = 0, ry = 0;
      let gx = 0, gy = 0;
      let bx = 0, by = 0;

      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        const ny = Math.max(0, Math.min(h - 1, y + ky));
        for (let kx = -1; kx <= 1; kx++) {
          const nx = Math.max(0, Math.min(w - 1, x + kx));
          const idx = (ny * w + nx) * 4;
          const kwx = gxKernel[k];
          const kwy = gyKernel[k];
          rx += src[idx] * kwx;
          ry += src[idx] * kwy;
          gx += src[idx + 1] * kwx;
          gy += src[idx + 1] * kwy;
          bx += src[idx + 2] * kwx;
          by += src[idx + 2] * kwy;
          k++;
        }
      }

      const magR = Math.hypot(rx, ry);
      const magG = Math.hypot(gx, gy);
      const magB = Math.hypot(bx, by);
      const mag = Math.max(magR, magG, magB);

      const edgeVal = mag >= threshold ? 255 : 0;
      const outIdx = (y * w + x) * 4;
      dst[outIdx] = edgeVal;
      dst[outIdx + 1] = edgeVal;
      dst[outIdx + 2] = edgeVal;
      dst[outIdx + 3] = 255;
    }
  }
  return out;
}

/**
 * Stitch multiple pose presets horizontally into a composite multi-frame conditioning strip
 */
function buildMultiPoseMannequinStrip(nativeW, nativeH, baseParams, poseKeys) {
  const count = poseKeys.length;
  const stripData = new ImageData(nativeW * count, nativeH);
  const dst = stripData.data;
  const totalW = nativeW * count;

  poseKeys.forEach((poseKey, frameIndex) => {
    const preset =
      typeof poseKey === "object" && poseKey !== null
        ? poseKey
        : POSE_PRESETS[poseKey] || POSE_PRESETS.idle;
    const frameImg = renderMannequinImageData(nativeW, nativeH, {
      ...baseParams,
      ...preset
    });
    const src = frameImg.data;
    const offsetX = frameIndex * nativeW;

    for (let y = 0; y < nativeH; y++) {
      for (let x = 0; x < nativeW; x++) {
        const sIdx = (y * nativeW + x) * 4;
        const dIdx = (y * totalW + (offsetX + x)) * 4;
        dst[dIdx] = src[sIdx];
        dst[dIdx + 1] = src[sIdx + 1];
        dst[dIdx + 2] = src[sIdx + 2];
        dst[dIdx + 3] = src[sIdx + 3];
      }
    }
  });

  return stripData;
}


// --- js/synthDemo.js ---
/**
 * PixelForge Studio — Procedural Synthetic AI Sprite Generator
 * Dynamically generates a high-res noisy/blurry AI-style sprite on a chroma-key background
 * that reflects the user's Stage 1 (Resolution, Upscale, Palette), Stage 2 (Proportions,
 * Facing, Pose, Weapon toggle), and Stage 3 (Character Class, Armor, Weapon description).
 */


/**
 * Deterministic pseudo-random generator for reproducible synthetic AI noise
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive color ramps from the user's Stage 3 text description and Stage 1 Master Palette
 */
function deriveCharacterColorTheme(params = {}) {
  const desc = `${params.charClass || ""} ${params.armor || ""} ${params.weapon || ""} ${params.material || ""}`.toLowerCase();
  const paletteHex = params.paletteHex || [];

  // If using a tiny monochrome palette like GameBoy 4-color, bias base shades toward palette luminance
  if (paletteHex.length > 0 && paletteHex.length <= 6) {
    const rgbs = paletteHex.map((h) => hexToRgb(h));
    rgbs.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
    const dark = rgbs[0] || { r: 15, g: 56, b: 15 };
    const midDark = rgbs[Math.min(1, rgbs.length - 1)];
    const midLight = rgbs[Math.min(2, rgbs.length - 1)];
    const light = rgbs[rgbs.length - 1];
    return {
      armorBase: [midLight.r, midLight.g, midLight.b],
      armorHi: [light.r, light.g, light.b],
      armorShadow: [midDark.r, midDark.g, midDark.b],
      clothBase: [midDark.r, midDark.g, midDark.b],
      clothDark: [dark.r, dark.g, dark.b],
      capeLight: [midLight.r, midLight.g, midLight.b],
      capeDark: [dark.r, dark.g, dark.b],
      trimGold: [light.r, light.g, light.b],
      trimHi: [light.r, light.g, light.b],
      trimDark: [midDark.r, midDark.g, midDark.b],
      bootColor: [dark.r, dark.g, dark.b],
      bladeBase: [light.r, light.g, light.b]
    };
  }

  // Cyber Ninja / Sci-Fi / Neon theme
  if (desc.includes("cyber") || desc.includes("ninja") || desc.includes("neon") || desc.includes("mecha") || desc.includes("plasma")) {
    return {
      armorBase: [45, 54, 74],
      armorHi: [95, 115, 150],
      armorShadow: [24, 28, 40],
      clothBase: [20, 145, 165],
      clothDark: [14, 85, 102],
      capeLight: [38, 225, 245],
      capeDark: [18, 110, 130],
      trimGold: [255, 75, 110],
      trimHi: [255, 150, 175],
      trimDark: [140, 30, 60],
      bootColor: [30, 35, 48],
      bladeBase: [54, 245, 194]
    };
  }

  // Forest Mage / Druid / Emerald theme
  if (desc.includes("mage") || desc.includes("forest") || desc.includes("emerald") || desc.includes("druid") || desc.includes("wizard") || desc.includes("alchemist")) {
    return {
      armorBase: [62, 112, 72],
      armorHi: [115, 172, 102],
      armorShadow: [34, 62, 44],
      clothBase: [46, 88, 56],
      clothDark: [28, 54, 36],
      capeLight: [145, 92, 54],
      capeDark: [95, 58, 34],
      trimGold: [242, 192, 92],
      trimHi: [250, 230, 145],
      trimDark: [155, 102, 48],
      bootColor: [105, 64, 40],
      bladeBase: [135, 215, 250]
    };
  }

  // Dwarven Berserker / Crimson / Bronze theme
  if (desc.includes("berserker") || desc.includes("dwarf") || desc.includes("barbarian") || desc.includes("warrior") || desc.includes("warhammer")) {
    return {
      armorBase: [155, 95, 62],
      armorHi: [218, 152, 98],
      armorShadow: [96, 54, 36],
      clothBase: [145, 42, 46],
      clothDark: [88, 24, 28],
      capeLight: [185, 58, 52],
      capeDark: [115, 32, 30],
      trimGold: [240, 178, 88],
      trimHi: [252, 224, 140],
      trimDark: [142, 82, 42],
      bootColor: [92, 52, 34],
      bladeBase: [210, 212, 224]
    };
  }

  // Default Paladin / Knight theme
  return {
    armorBase: [166, 162, 180],
    armorHi: [232, 230, 240],
    armorShadow: [110, 104, 126],
    clothBase: [68, 105, 152],
    clothDark: [42, 62, 95],
    capeLight: [168, 48, 56],
    capeDark: [115, 28, 42],
    trimGold: [240, 168, 93],
    trimHi: [247, 220, 136],
    trimDark: [138, 66, 54],
    bootColor: [138, 66, 54],
    bladeBase: [225, 224, 238]
  };
}

/**
 * Paint a shaded character at native resolution matching the user's Stage 2 Mannequin
 * pose, proportions, facing direction, weapon toggle, and Stage 3 color theme.
 */
function renderBaseKnightNative(nativeW, nativeH, params = {}) {
  const {
    headRatio = 1.25,
    shoulderWidth = 1.0,
    limbThickness = 1.0,
    facing = "SE",
    headTilt = 0,
    torsoLean = 2,
    frontArmAngle = 22,
    frontElbowBend = 55,
    backArmAngle = -18,
    backElbowBend = 45,
    frontLegAngle = 8,
    frontKneeBend = 12,
    backLegAngle = -8,
    backKneeBend = 16,
    weaponAngle = -35,
    bobOffset = 0,
    showWeapon = true
  } = params;

  const theme = deriveCharacterColorTheme(params);
  const buf = new ImageData(nativeW, nativeH);
  const data = buf.data;

  const scale = Math.min(nativeW, nativeH) / 64;
  const cx = nativeW * 0.5;
  const groundY = nativeH * 0.88;

  const isLeft = facing.includes("W");
  const isBack = facing.includes("N");
  const isSide = facing === "E" || facing === "W";
  const dirX = isLeft ? -1 : 1;
  const isoTwist = facing === "N" || facing === "S" ? 1.15 : isSide ? 0.65 : 0.92;

  const limbR = Math.max(1.5, 2.6 * limbThickness * scale);
  const upperLegLen = 7.2 * scale;
  const lowerLegLen = 7.0 * scale;
  const upperArmLen = 6.2 * scale;
  const lowerArmLen = 6.4 * scale;
  const torsoH = 14.0 * scale;
  const headR = Math.max(3.6, 6.8 * headRatio * scale);

  const hipY = groundY - (upperLegLen + lowerLegLen) + bobOffset * scale;
  const hipSpread = 3.2 * shoulderWidth * isoTwist * scale;

  const backHipX = cx - dirX * hipSpread * 0.75;
  const backHipY = hipY - (isBack ? -1.0 : 1.0) * scale;
  const frontHipX = cx + dirX * hipSpread * 0.75;
  const frontHipY = hipY + (isBack ? -0.5 : 0.5) * scale;

  const leanRad = (torsoLean * dirX * Math.PI) / 180;
  const torsoCenterX = cx + Math.sin(leanRad) * (torsoH * 0.5);
  const torsoCenterY = hipY - Math.cos(leanRad) * (torsoH * 0.5);

  const neckX = cx + Math.sin(leanRad) * torsoH;
  const neckY = hipY - Math.cos(leanRad) * torsoH;

  const shoulderSpan = 5.6 * shoulderWidth * isoTwist * scale;
  const backShoulderX = neckX - dirX * shoulderSpan * 0.85;
  const backShoulderY = neckY + 2.0 * scale;
  const frontShoulderX = neckX + dirX * shoulderSpan * 0.85;
  const frontShoulderY = neckY + 2.6 * scale;

  // 1. Articulated Back Leg (Thigh -> Knee -> Shin -> Directional Toe)
  const bThighRad = ((backLegAngle * dirX) * Math.PI) / 180;
  const backKneeX = backHipX + Math.sin(bThighRad) * upperLegLen;
  const backKneeY = backHipY + Math.cos(bThighRad) * upperLegLen;

  const bShinRad = (((backLegAngle - backKneeBend * 0.92) * dirX) * Math.PI) / 180;
  const backAnkleX = backKneeX + Math.sin(bShinRad) * lowerLegLen;
  const backAnkleY = backKneeY + Math.cos(bShinRad) * lowerLegLen;

  const footLen = 4.2 * scale;
  const backToeX = backAnkleX + dirX * footLen * (isBack ? 0.35 : 0.88);
  const backToeY = backAnkleY + (isBack ? -0.6 : 0.5) * scale;

  // 2. Articulated Front Leg (Thigh -> Knee -> Shin -> Directional Toe)
  const fThighRad = ((frontLegAngle * dirX) * Math.PI) / 180;
  const frontKneeX = frontHipX + Math.sin(fThighRad) * upperLegLen;
  const frontKneeY = frontHipY + Math.cos(fThighRad) * upperLegLen;

  const fShinRad = (((frontLegAngle - frontKneeBend * 0.92) * dirX) * Math.PI) / 180;
  const frontAnkleX = frontKneeX + Math.sin(fShinRad) * lowerLegLen;
  const frontAnkleY = frontKneeY + Math.cos(fShinRad) * lowerLegLen;

  const frontToeX = frontAnkleX + dirX * footLen * (isBack ? 0.35 : 0.88);
  const frontToeY = frontAnkleY + (isBack ? -0.6 : 0.5) * scale;

  // 3. Articulated Back Arm (Shoulder -> Elbow -> Hand)
  const bArmRad = ((backArmAngle * dirX) * Math.PI) / 180;
  const backElbowX = backShoulderX + Math.sin(bArmRad) * upperArmLen;
  const backElbowY = backShoulderY + Math.cos(bArmRad) * upperArmLen;

  const bForearmRad = (((backArmAngle + backElbowBend * 0.92) * dirX) * Math.PI) / 180;
  const backHandX = backElbowX + Math.sin(bForearmRad) * lowerArmLen;
  const backHandY = backElbowY + Math.cos(bForearmRad) * lowerArmLen;

  // 4. Articulated Front Arm (Shoulder -> Elbow -> Hand)
  const fArmRad = ((frontArmAngle * dirX) * Math.PI) / 180;
  const frontElbowX = frontShoulderX + Math.sin(fArmRad) * upperArmLen;
  const frontElbowY = frontShoulderY + Math.cos(fArmRad) * upperArmLen;

  const fForearmRad = (((frontArmAngle + frontElbowBend * 0.92) * dirX) * Math.PI) / 180;
  const frontHandX = frontElbowX + Math.sin(fForearmRad) * lowerArmLen;
  const frontHandY = frontElbowY + Math.cos(fForearmRad) * lowerArmLen;

  const weapRad = ((weaponAngle * dirX) * Math.PI) / 180;
  const weapLen = 20 * scale;
  const weapTipX = frontHandX + Math.cos(weapRad) * weapLen * dirX;
  const weapTipY = frontHandY + Math.sin(weapRad) * weapLen;
  const weapPommelX = frontHandX - Math.cos(weapRad) * (4 * scale) * dirX;
  const weapPommelY = frontHandY - Math.sin(weapRad) * (4 * scale);

  const headX = neckX + Math.sin(((headTilt * dirX) * Math.PI) / 180) * (headR * 0.6);
  const headY = neckY - headR * 0.82;

  const putPix = (x, y, r, g, b) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= nativeW || iy < 0 || iy >= nativeH) return;
    const idx = (iy * nativeW + ix) * 4;
    data[idx] = Math.max(0, Math.min(255, Math.round(r)));
    data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
    data[idx + 3] = 255;
  };

  const paintShadedCapsule = (x0, y0, x1, y1, radius, baseRgb, highlightRgb, shadowRgb, bootRgb = null) => {
    const minX = Math.floor(Math.min(x0, x1) - radius - 1);
    const maxX = Math.ceil(Math.max(x0, x1) + radius + 1);
    const minY = Math.floor(Math.min(y0, y1) - radius - 1);
    const maxY = Math.ceil(Math.max(y0, y1) + radius + 1);
    const vx = x1 - x0;
    const vy = y1 - y0;
    const lenSq = vx * vx + vy * vy;
    const rSq = radius * radius;

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        let t = 0;
        if (lenSq > 0.0001) {
          t = Math.max(0, Math.min(1, ((px - x0) * vx + (py - y0) * vy) / lenSq));
        }
        const projX = x0 + t * vx;
        const projY = y0 + t * vy;
        const dx = px - projX;
        const dy = py - projY;
        const distSq = dx * dx + dy * dy;
        if (distSq <= rSq) {
          const light = (dx * -0.55 + dy * -0.45) / (radius + 0.01);
          const col = bootRgb && t > 0.58 ? bootRgb : baseRgb;
          let r = col[0];
          let g = col[1];
          let b = col[2];
          if (light > 0.18) {
            r = r * 0.55 + highlightRgb[0] * 0.45;
            g = g * 0.55 + highlightRgb[1] * 0.45;
            b = b * 0.55 + highlightRgb[2] * 0.45;
          } else if (light < -0.2) {
            r = r * 0.55 + shadowRgb[0] * 0.45;
            g = g * 0.55 + shadowRgb[1] * 0.45;
            b = b * 0.55 + shadowRgb[2] * 0.45;
          }
          putPix(px, py, r, g, b);
        }
      }
    }
  };

  // Flowing Cape behind Character
  const capeTopY = neckY + 1 * scale;
  const capeBotY = groundY - 3 * scale;
  for (let py = Math.floor(capeTopY); py <= Math.ceil(capeBotY); py++) {
    const t = (py - capeTopY) / Math.max(1, capeBotY - capeTopY);
    const capeCenter = cx - dirX * (3.5 + t * 5.2) * scale;
    const halfW = (3.5 + t * 4.8) * scale;
    for (let px = Math.floor(capeCenter - halfW); px <= Math.ceil(capeCenter + halfW); px++) {
      const shade = (px - capeCenter) / (halfW + 0.1);
      const col = shade < 0 ? theme.capeLight : theme.capeDark;
      putPix(px, py, col[0], col[1], col[2]);
    }
  }

  // Back Leg (Thigh -> Knee -> Shin -> Foot)
  paintShadedCapsule(
    backHipX,
    backHipY,
    backKneeX,
    backKneeY,
    limbR,
    theme.armorShadow,
    theme.armorBase,
    [32, 28, 42]
  );
  paintShadedCapsule(
    backKneeX,
    backKneeY,
    backAnkleX,
    backAnkleY,
    limbR * 0.94,
    theme.armorShadow,
    theme.armorBase,
    [32, 28, 42],
    theme.bootColor
  );
  paintShadedCapsule(
    backAnkleX,
    backAnkleY,
    backToeX,
    backToeY,
    limbR * 0.88,
    theme.bootColor,
    theme.armorShadow,
    [24, 20, 32]
  );

  // Back Arm (Upper Arm -> Elbow -> Forearm/Hand)
  paintShadedCapsule(
    backShoulderX,
    backShoulderY,
    backElbowX,
    backElbowY,
    limbR * 0.92,
    theme.clothBase,
    theme.armorBase,
    theme.clothDark,
    theme.trimDark
  );
  paintShadedCapsule(
    backElbowX,
    backElbowY,
    backHandX,
    backHandY,
    limbR * 0.86,
    theme.clothBase,
    theme.armorBase,
    theme.clothDark,
    theme.trimDark
  );

  // Torso Cuirass & Tabard / Belt
  const halfH = torsoH * 0.55;
  const bound = Math.ceil(Math.max(shoulderSpan, halfH) * 1.6) + 2;
  const radT = (torsoLean * dirX * Math.PI) / 180;
  const cosT = Math.cos(radT);
  const sinT = Math.sin(radT);

  for (let dy = -bound; dy <= bound; dy++) {
    for (let dx = -bound; dx <= bound; dx++) {
      const lx = dx * cosT + dy * sinT;
      const ly = -dx * sinT + dy * cosT;
      if (ly >= -halfH && ly <= halfH) {
        const t = (ly + halfH) / (2 * halfH + 0.001);
        const wAllowed = (shoulderSpan * 0.98) * (1 - t) + (hipSpread * 0.92) * t;
        if (Math.abs(lx) <= wAllowed) {
          let col;
          if (t > 0.62 && t < 0.78) {
            col = theme.trimGold;
          } else if (t >= 0.78) {
            col = lx * dirX > 0 ? theme.clothBase : theme.clothDark;
          } else {
            const spec = lx * -0.4 + ly * -0.5;
            col = spec > 1.2 * scale ? theme.armorHi : spec > -0.8 * scale ? theme.armorBase : theme.armorShadow;
          }
          putPix(torsoCenterX + dx, torsoCenterY + dy, col[0], col[1], col[2]);
        }
      }
    }
  }

  // Helmet / Head with Visor & Plume
  const rx = headR * 0.94;
  const ry = headR * 1.02;
  const maxHR = Math.ceil(Math.max(rx, ry)) + 2;
  for (let dy = -maxHR; dy <= maxHR; dy++) {
    for (let dx = -maxHR; dx <= maxHR; dx++) {
      const norm = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (norm <= 1.0) {
        let col = theme.armorBase;
        if (dx * -0.5 + dy * -0.6 > headR * 0.22) {
          col = theme.armorHi;
        } else if (dx * -0.5 + dy * -0.6 < -headR * 0.25) {
          col = theme.armorShadow;
        }

        const faceX = dx * dirX;
        if (!isBack) {
          if (Math.abs(dy - headR * 0.08) < 1.15 * scale && faceX > -headR * 0.25 && faceX < headR * 0.72) {
            col = [22, 18, 24];
          } else if (Math.abs(faceX - headR * 0.28) < 1.05 * scale && dy > -headR * 0.25 && dy < headR * 0.68) {
            col = theme.trimGold;
          }
        }
        putPix(headX + dx, headY + dy, col[0], col[1], col[2]);
      }
    }
  }

  // Plume crest on top of head
  const plumeBaseX = headX - dirX * headR * 0.15;
  const plumeBaseY = headY - headR * 0.95;
  for (let i = 0; i < Math.ceil(9 * scale); i++) {
    const t = i / (9 * scale);
    const px = plumeBaseX - dirX * t * 6.5 * scale;
    const py = plumeBaseY - Math.sin(t * Math.PI) * 3.8 * scale + t * 1.5 * scale;
    const pr = Math.max(1.2, (1 - t * 0.45) * 2.6 * scale);
    paintShadedCapsule(px, py, px + dirX * scale, py + scale, pr, theme.capeLight, theme.trimHi, theme.capeDark);
  }

  // Front Leg (Thigh -> Knee -> Shin -> Foot)
  paintShadedCapsule(
    frontHipX,
    frontHipY,
    frontKneeX,
    frontKneeY,
    limbR * 1.04,
    theme.armorBase,
    theme.armorHi,
    theme.armorShadow
  );
  paintShadedCapsule(
    frontKneeX,
    frontKneeY,
    frontAnkleX,
    frontAnkleY,
    limbR * 0.96,
    theme.armorBase,
    theme.armorHi,
    theme.armorShadow,
    theme.bootColor
  );
  paintShadedCapsule(
    frontAnkleX,
    frontAnkleY,
    frontToeX,
    frontToeY,
    limbR * 0.9,
    theme.bootColor,
    theme.armorShadow,
    [24, 20, 32]
  );

  // Weapon / Prop (if enabled in Stage 2/3)
  if (showWeapon) {
    paintShadedCapsule(
      weapPommelX,
      weapPommelY,
      weapTipX,
      weapTipY,
      Math.max(1.3, limbR * 0.62),
      theme.bladeBase,
      [248, 248, 255],
      theme.clothBase
    );
    const guardPerpX = -Math.sin(weapRad) * 4.2 * scale;
    const guardPerpY = Math.cos(weapRad) * 4.2 * scale;
    paintShadedCapsule(
      frontHandX - guardPerpX,
      frontHandY - guardPerpY,
      frontHandX + guardPerpX,
      frontHandY + guardPerpY,
      Math.max(1.1, 1.3 * scale),
      theme.trimGold,
      theme.trimHi,
      theme.trimDark
    );
  }

  // Front Arm (Upper Arm -> Elbow -> Forearm + Pauldron)
  paintShadedCapsule(
    frontShoulderX,
    frontShoulderY,
    frontElbowX,
    frontElbowY,
    limbR * 0.96,
    theme.clothBase,
    theme.armorBase,
    theme.clothDark,
    theme.trimGold
  );
  paintShadedCapsule(
    frontElbowX,
    frontElbowY,
    frontHandX,
    frontHandY,
    limbR * 0.9,
    theme.clothBase,
    theme.armorBase,
    theme.clothDark,
    theme.trimGold
  );
  paintShadedCapsule(
    frontShoulderX - dirX * 1.2 * scale,
    frontShoulderY - 1.2 * scale,
    frontShoulderX + dirX * 1.5 * scale,
    frontShoulderY + 1.0 * scale,
    limbR * 1.28,
    theme.trimGold,
    theme.trimHi,
    theme.trimDark
  );

  return buf;
}

/**
 * Turn a clean native ImageData into a synthetic "Raw AI Output" at (nativeW * upscaleFactor, nativeH * upscaleFactor)
 * complete with #FF00FF magenta background, anti-aliased edge bleed, mixel boundary blur,
 * subtle color noise, and a few deliberate orphan pixels / pinholes for Stage 4 testing.
 */
function synthesizeRawAIFromNative(nativeData, upscaleFactor = 16, seed = 1337) {
  const nw = nativeData.width;
  const nh = nativeData.height;
  const src = nativeData.data;

  const modSrc = new Uint8ClampedArray(src);
  const rand = mulberry32(seed);

  const orphanCoords = [
    [Math.floor(nw * 0.12), Math.floor(nh * 0.18)],
    [Math.floor(nw * 0.86), Math.floor(nh * 0.15)],
    [Math.floor(nw * 0.14), Math.floor(nh * 0.76)],
    [Math.floor(nw * 0.88), Math.floor(nh * 0.72)],
    [Math.floor(nw * 0.22), Math.floor(nh * 0.08)],
    [Math.floor(nw * 0.79), Math.floor(nh * 0.84)]
  ];
  for (const [ox, oy] of orphanCoords) {
    if (ox >= 0 && ox < nw && oy >= 0 && oy < nh) {
      const idx = (oy * nw + ox) * 4;
      if (modSrc[idx + 3] === 0) {
        modSrc[idx] = 210;
        modSrc[idx + 1] = 95;
        modSrc[idx + 2] = 155;
        modSrc[idx + 3] = 255;
      }
    }
  }

  const cx = Math.floor(nw * 0.5);
  const cy = Math.floor(nh * 0.52);
  for (const [px, py] of [
    [cx, cy],
    [cx + 2, cy - 3]
  ]) {
    const idx = (py * nw + px) * 4;
    if (modSrc[idx + 3] === 255) {
      modSrc[idx] = 0;
      modSrc[idx + 1] = 0;
      modSrc[idx + 2] = 0;
      modSrc[idx + 3] = 0;
    }
  }

  const outW = nw * upscaleFactor;
  const outH = nh * upscaleFactor;
  const out = new ImageData(outW, outH);
  const dst = out.data;

  const sampleCell = (cxIdx, cyIdx) => {
    const x = Math.max(0, Math.min(nw - 1, cxIdx));
    const y = Math.max(0, Math.min(nh - 1, cyIdx));
    const idx = (y * nw + x) * 4;
    if (modSrc[idx + 3] < 128) {
      return { r: 255, g: 0, b: 255, isBg: true };
    }
    return {
      r: modSrc[idx],
      g: modSrc[idx + 1],
      b: modSrc[idx + 2],
      isBg: false
    };
  };

  for (let y = 0; y < outH; y++) {
    const cellY = Math.floor(y / upscaleFactor);
    const localY = (y % upscaleFactor) / upscaleFactor;

    for (let x = 0; x < outW; x++) {
      const cellX = Math.floor(x / upscaleFactor);
      const localX = (x % upscaleFactor) / upscaleFactor;

      const center = sampleCell(cellX, cellY);
      let r = center.r;
      let g = center.g;
      let b = center.b;

      const horizEdgeDist = localX < 0.25 ? localX / 0.25 : localX > 0.75 ? (1 - localX) / 0.25 : 1.0;
      const vertEdgeDist = localY < 0.25 ? localY / 0.25 : localY > 0.75 ? (1 - localY) / 0.25 : 1.0;

      if (horizEdgeDist < 1.0) {
        const neighborX = localX < 0.5 ? cellX - 1 : cellX + 1;
        const nCol = sampleCell(neighborX, cellY);
        const blend = (1.0 - horizEdgeDist) * 0.45;
        r = r * (1 - blend) + nCol.r * blend;
        g = g * (1 - blend) + nCol.g * blend;
        b = b * (1 - blend) + nCol.b * blend;
      }

      if (vertEdgeDist < 1.0) {
        const neighborY = localY < 0.5 ? cellY - 1 : cellY + 1;
        const nCol = sampleCell(cellX, neighborY);
        const blend = (1.0 - vertEdgeDist) * 0.45;
        r = r * (1 - blend) + nCol.r * blend;
        g = g * (1 - blend) + nCol.g * blend;
        b = b * (1 - blend) + nCol.b * blend;
      }

      const noise = (rand() - 0.5) * 14;
      if (center.isBg && horizEdgeDist === 1.0 && vertEdgeDist === 1.0) {
        const bgShift = Math.floor(rand() * 10);
        r = 255 - bgShift;
        g = Math.floor(rand() * 8);
        b = 255 - bgShift;
      } else {
        r = Math.max(0, Math.min(255, r + noise));
        g = Math.max(0, Math.min(255, g + noise));
        b = Math.max(0, Math.min(255, b + noise));
      }

      const dIdx = (y * outW + x) * 4;
      dst[dIdx] = Math.round(r);
      dst[dIdx + 1] = Math.round(g);
      dst[dIdx + 2] = Math.round(b);
      dst[dIdx + 3] = 255;
    }
  }

  return out;
}

/**
 * Generate single-frame synthetic high-res sprite matching user's Stage 1/2/3 choices
 */
function generateSyntheticAIKnight(nativeW = 64, nativeH = 64, upscaleFactor = 16, params = {}) {
  const effectiveFactor = Math.max(1, Math.min(upscaleFactor, Math.floor(1024 / Math.max(nativeW, nativeH))));
  const nativeKnight = renderBaseKnightNative(nativeW, nativeH, params);
  return synthesizeRawAIFromNative(nativeKnight, effectiveFactor, 42);
}

/**
 * Generate multi-frame horizontal strip matching user's Stage 1/2/3 choices
 */
function generateSyntheticAIStrip(
  nativeW = 64,
  nativeH = 64,
  upscaleFactor = 8,
  baseParams = {},
  poseKeys = ["walk1", "walk2", "walk3", "walk4"]
) {
  const count = poseKeys.length;
  const effectiveFactor = Math.max(1, Math.min(upscaleFactor, Math.floor(512 / Math.max(nativeW, nativeH))));
  const stripNative = new ImageData(nativeW * count, nativeH);
  const dst = stripNative.data;
  const totalNativeW = nativeW * count;

  poseKeys.forEach((key, idx) => {
    const preset =
      typeof key === "object" && key !== null
        ? key
        : POSE_PRESETS[key] || POSE_PRESETS.idle;
    const artificialJitterY = idx % 2 === 0 ? -2 : 2;
    const frameNative = renderBaseKnightNative(nativeW, nativeH, {
      ...baseParams,
      ...preset,
      bobOffset: (preset.bobOffset || 0) + artificialJitterY
    });
    const src = frameNative.data;
    const xOff = idx * nativeW;

    for (let y = 0; y < nativeH; y++) {
      for (let x = 0; x < nativeW; x++) {
        const sIdx = (y * nativeW + x) * 4;
        const dIdx = (y * totalNativeW + (xOff + x)) * 4;
        dst[dIdx] = src[sIdx];
        dst[dIdx + 1] = src[sIdx + 1];
        dst[dIdx + 2] = src[sIdx + 2];
        dst[dIdx + 3] = src[sIdx + 3];
      }
    }
  });

  return synthesizeRawAIFromNative(stripNative, effectiveFactor, 9001);
}


// --- js/cleanupEngine.js ---
/**
 * PixelForge Studio — Stage 4: Deterministic Pixel Cleanup Engine
 * Pure HTML5 Canvas ImageData / TypedArray mathematical algorithms:
 * 1. applyChromaKey (Euclidean RGB distance + strict binary alpha thresholding)
 * 2. centerSampleDownscale (Inner-50% Block Mode, Inner-50% Block Median, Center Pixel)
 * 3. quantizeToPaletteLab (Perceptual CIELAB L*a*b* Delta-E nearest-neighbor color mapping)
 * 4. morphologicalCleanup (Orphan single-pixel stripper & 1px pinhole filler)
 * 5. generate1pxOutline (4-way N/S/E/W neighbor detection: None, Solid Dark, or Selective Outlining)
 */

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
function applyChromaKey(
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
function centerSampleDownscale(
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
function quantizeToPaletteLab(srcImageData, paletteLookup) {
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
function morphologicalCleanup(srcImageData, stripOrphans = true, fillPinholes = true) {
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
function generate1pxOutline(
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
function runCleanupPipeline(rawImageData, config, masterPaletteHex) {
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


// --- js/animationEngine.js ---
/**
 * PixelForge Studio — Stage 5: Animation Timeline, Baseline Aligner & Sprite Sheet Exporter
 * Implements:
 * - sliceHorizontalStrip
 * - alignFrameBaselines (Foot-Baseline Anchor + Horizontal Center-of-Mass Stabilization)
 * - Paper-Doll Modular Slicer (using Stage 2 Mannequin Color-ID mask + procedural 1-2px bobbing idle loop)
 * - packSpriteSheet & generateAtlasJson (Godot / Phaser / Aseprite compatible)
 */


/**
 * Slice a horizontal strip ImageData into N equal-width frames
 */
function sliceHorizontalStrip(stripImageData, frameCount) {
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
function analyzeFrameMetrics(imageData) {
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
function translateImageData(srcImageData, dx, dy) {
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
function alignFrameBaselines(frames, options = {}) {
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
function generatePaperDollIdleFrames(spriteImageData, mannequinMaskImageData) {
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
function packSpriteSheet(frames, columns = 4, padding = 2, baselineY = 56) {
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
function generateSpriteSheetAtlasJson(packedInfo, animConfig = {}) {
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
function detectAndNormalizeCharacters(rawImageData, nativeW = 64, nativeH = 64) {
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
const ANIMATION_ACTION_LIBRARY = {
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
function generateArticulatedActionFrames(
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
function buildCompositeAiAnimationReferenceSheet(
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


// --- js/viewport.js ---
/**
 * PixelForge Studio — Interactive Dual-Canvas Viewport Controller
 * Supports synchronized mouse-wheel zoom, middle-click / drag pan,
 * 1px native pixel grid overlay, perspective alignment guides (Isometric 2:1, 3/4 RPG, 2D Side-Scroller),
 * onion skinning, foot-baseline overlay, and chroma-key eyedropper sampling.
 */
class DualViewportController {
  constructor(options) {
    this.viewportContainer = options.viewportContainer;
    this.leftPane = options.leftPane;
    this.rightPane = options.rightPane;
    this.leftCanvas = options.leftCanvas;
    this.rightCanvas = options.rightCanvas;
    this.leftOverlay = options.leftOverlay;
    this.rightOverlay = options.rightOverlay;
    this.onSampleColor = options.onSampleColor || null;
    this.onHoverPixel = options.onHoverPixel || null;

    this.zoom = 5.0; // Default zoom multiplier relative to native size
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.spacePressed = false;
    this.eyedropperActive = false;
    this.panStartX = 0;
    this.panStartY = 0;

    this.showPixelGrid = true;
    this.showPerspectiveGuide = true;
    this.showCheckerboard = true;
    this.showBaseline = true;
    this.onionSkinEnabled = false;
    this.viewLayout = "split"; // "split" | "left-only" | "right-only"

    this.nativeW = 64;
    this.nativeH = 64;
    this.perspectiveMode = "iso"; // "iso" | "topdown" | "side"
    this.baselineY = 56;

    this.leftImageData = null;
    this.rightImageData = null;
    this.onionImageData = null;

    this._initEvents();
  }

  _initEvents() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        this.spacePressed = true;
        this.viewportContainer.classList.add("pan-cursor");
      }
      if (e.key === "Escape" && this.eyedropperActive) {
        this.setEyedropper(false);
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.spacePressed = false;
        if (!this.isPanning) {
          this.viewportContainer.classList.remove("pan-cursor");
        }
      }
    });

    // Mouse wheel zoom
    this.viewportContainer.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const nextZoom = Math.max(0.5, Math.min(32, this.zoom * factor));
        this.zoom = Number(nextZoom.toFixed(2));
        this.applyTransforms();
      },
      { passive: false }
    );

    // Middle-click (button 1), Space + Left-click, or Left-click drag (when not eyedropping) to pan
    this.viewportContainer.addEventListener("mousedown", (e) => {
      if (this.eyedropperActive && e.button === 0) {
        this._handleEyedropperClick(e);
        return;
      }

      if (e.button === 1 || e.button === 0 || e.button === 2) {
        if (e.button === 1) e.preventDefault();
        this.isPanning = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
        this.viewportContainer.classList.add("panning");
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isPanning) {
        this.panX = Math.round(e.clientX - this.panStartX);
        this.panY = Math.round(e.clientY - this.panStartY);
        this.applyTransforms();
      } else {
        this._handleHoverInspect(e);
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.viewportContainer.classList.remove("panning");
      }
    });
  }

  _handleEyedropperClick(e) {
    const sampleCanvas = (canvas, imgData, label) => {
      if (!canvas || !imgData) return null;
      const rect = canvas.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        const u = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const v = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        const px = Math.max(0, Math.min(imgData.width - 1, Math.floor(u * imgData.width)));
        const py = Math.max(0, Math.min(imgData.height - 1, Math.floor(v * imgData.height)));
        const idx = (py * imgData.width + px) * 4;
        const r = imgData.data[idx];
        const g = imgData.data[idx + 1];
        const b = imgData.data[idx + 2];
        const a = imgData.data[idx + 3];
        return {
          hex: rgbToHex(r, g, b),
          r,
          g,
          b,
          a,
          px,
          py,
          u,
          v,
          label
        };
      }
      return null;
    };

    // Check right output canvas first (what is directly visible to user), then left canvas
    let sample = sampleCanvas(this.rightCanvas, this.rightImageData, "Output");
    if (!sample) {
      sample = sampleCanvas(this.leftCanvas, this.leftImageData, "Source");
    }

    if (sample) {
      // If user clicked on a pixel that was keyed to transparent on the output canvas,
      // recover the raw pixel color from the left source canvas at the matching relative position!
      if (sample.a === 0 && this.leftImageData) {
        const lx = Math.max(0, Math.min(this.leftImageData.width - 1, Math.floor(sample.u * this.leftImageData.width)));
        const ly = Math.max(0, Math.min(this.leftImageData.height - 1, Math.floor(sample.v * this.leftImageData.height)));
        const lIdx = (ly * this.leftImageData.width + lx) * 4;
        sample = {
          hex: rgbToHex(this.leftImageData.data[lIdx], this.leftImageData.data[lIdx + 1], this.leftImageData.data[lIdx + 2]),
          r: this.leftImageData.data[lIdx],
          g: this.leftImageData.data[lIdx + 1],
          b: this.leftImageData.data[lIdx + 2],
          a: this.leftImageData.data[lIdx + 3],
          px: lx,
          py: ly,
          label: "Source (Restored)"
        };
      }

      this.setEyedropper(false);
      if (this.onSampleColor) {
        this.onSampleColor(sample.hex, sample);
      }
    }
  }

  _handleHoverInspect(e) {
    if (!this.onHoverPixel) return;

    const checkCanvas = (canvas, imgData, label) => {
      if (!imgData) return false;
      const rect = canvas.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        const u = (e.clientX - rect.left) / rect.width;
        const v = (e.clientY - rect.top) / rect.height;
        const px = Math.max(0, Math.min(imgData.width - 1, Math.floor(u * imgData.width)));
        const py = Math.max(0, Math.min(imgData.height - 1, Math.floor(v * imgData.height)));
        const idx = (py * imgData.width + px) * 4;
        const r = imgData.data[idx];
        const g = imgData.data[idx + 1];
        const b = imgData.data[idx + 2];
        const a = imgData.data[idx + 3];
        this.onHoverPixel({
          pane: label,
          x: px,
          y: py,
          r,
          g,
          b,
          a,
          hex: rgbToHex(r, g, b)
        });
        return true;
      }
      return false;
    };

    if (!checkCanvas(this.rightCanvas, this.rightImageData, "Output")) {
      checkCanvas(this.leftCanvas, this.leftImageData, "Source");
    }
  }

  setEyedropper(active) {
    this.eyedropperActive = active;
    this.viewportContainer.classList.toggle("eyedropper-cursor", active);
    const pickBtn = document.getElementById("btn-eyedropper-key");
    if (pickBtn) {
      pickBtn.classList.toggle("active", active);
      pickBtn.textContent = active ? "🎯 Click Canvas Pixel" : "💧 Pick from Canvas";
    }
  }

  resetView() {
    this.panX = 0;
    this.panY = 0;
    const maxDim = Math.max(this.nativeW, this.nativeH);
    this.zoom = Number(Math.max(2, Math.min(10, Math.floor(320 / maxDim))).toFixed(2));
    this.applyTransforms();
  }

  setZoom(newZoom) {
    this.zoom = Math.max(0.5, Math.min(32, Number(newZoom)));
    this.applyTransforms();
  }

  setLayout(mode) {
    this.viewLayout = mode;
    this.leftPane.style.display = mode === "right-only" ? "none" : "flex";
    this.rightPane.style.display = mode === "left-only" ? "none" : "flex";
    this.applyTransforms();
  }

  setLeftImage(imageData) {
    this.leftImageData = imageData;
    if (!imageData) return;
    this.leftCanvas.width = imageData.width;
    this.leftCanvas.height = imageData.height;
    const ctx = this.leftCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.putImageData(imageData, 0, 0);
    this.applyTransforms();
  }

  setRightImage(imageData, onionImageData = null) {
    this.rightImageData = imageData;
    this.onionImageData = onionImageData;
    if (!imageData) return;
    this.rightCanvas.width = imageData.width;
    this.rightCanvas.height = imageData.height;
    const ctx = this.rightCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, imageData.width, imageData.height);

    // If onion skinning is enabled and previous frame exists, draw it at 32% opacity first
    if (this.onionSkinEnabled && onionImageData) {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = onionImageData.width;
      tempCanvas.height = onionImageData.height;
      tempCanvas.getContext("2d").putImageData(onionImageData, 0, 0);
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.restore();

      const fgCanvas = document.createElement("canvas");
      fgCanvas.width = imageData.width;
      fgCanvas.height = imageData.height;
      fgCanvas.getContext("2d").putImageData(imageData, 0, 0);
      ctx.drawImage(fgCanvas, 0, 0);
    } else {
      ctx.putImageData(imageData, 0, 0);
    }

    this.applyTransforms();
  }

  applyTransforms() {
    // Display both left and right canvases at the same physical screen size
    // based on native resolution * zoom so Before (1024x1024) and After (64x64) align 1:1 visually!
    const aspectLeft = this.leftImageData
      ? this.leftImageData.width / Math.max(1, this.leftImageData.height)
      : this.nativeW / this.nativeH;
    const aspectRight = this.rightImageData
      ? this.rightImageData.width / Math.max(1, this.rightImageData.height)
      : this.nativeW / this.nativeH;

    const baseDisplayH = Math.round(this.nativeH * this.zoom);
    const displayLeftW = Math.round(baseDisplayH * aspectLeft);
    const displayRightW = Math.round(baseDisplayH * aspectRight);

    const applyToStage = (canvas, overlay, dispW, dispH) => {
      canvas.style.width = `${dispW}px`;
      canvas.style.height = `${dispH}px`;
      canvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
      canvas.classList.toggle("checkerboard-bg", this.showCheckerboard);

      overlay.width = dispW;
      overlay.height = dispH;
      overlay.style.width = `${dispW}px`;
      overlay.style.height = `${dispH}px`;
      overlay.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
    };

    applyToStage(this.leftCanvas, this.leftOverlay, displayLeftW, baseDisplayH);
    applyToStage(this.rightCanvas, this.rightOverlay, displayRightW, baseDisplayH);

    // Draw overlays (pixel grid + perspective guide + foot baseline)
    const leftGridCols = Math.round(this.nativeW * (aspectLeft / (this.nativeW / this.nativeH)));
    const rightGridCols = Math.round(this.nativeW * (aspectRight / (this.nativeW / this.nativeH)));

    this._renderOverlay(this.leftOverlay, leftGridCols, this.nativeH);
    this._renderOverlay(this.rightOverlay, rightGridCols, this.nativeH);

    const zoomBadge = document.getElementById("viewport-zoom-readout");
    if (zoomBadge) {
      zoomBadge.textContent = `${Math.round(this.zoom * 100)}%`;
    }
  }

  _renderOverlay(overlayCanvas, gridCols, gridRows) {
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;
    const ctx = overlayCanvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    const cellW = w / Math.max(1, gridCols);
    const cellH = h / Math.max(1, gridRows);

    // 1. 1px Native Pixel Grid Overlay (only render when zoom is large enough that cells >= 4px)
    if (this.showPixelGrid && cellW >= 4 && cellH >= 4) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.11)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < gridCols; x++) {
        const px = Math.floor(x * cellW) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
      }
      for (let y = 1; y < gridRows; y++) {
        const py = Math.floor(y * cellH) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. Camera & Perspective Alignment Guide
    if (this.showPerspectiveGuide) {
      ctx.save();
      const cx = w * 0.5;
      const baseLinePxY = (this.baselineY / gridRows) * h;

      if (this.perspectiveMode === "iso") {
        // Isometric 2:1 pixel ratio diamond floor tile + vertical symmetry axis
        ctx.strokeStyle = "rgba(0, 229, 255, 0.45)";
        ctx.lineWidth = 1.25;
        const isoHalfW = Math.min(w, h) * 0.38;
        const isoHalfH = isoHalfW * 0.5; // 2:1 isometric ratio
        const centerFloorY = baseLinePxY - isoHalfH * 0.35;

        // Outer diamond
        ctx.beginPath();
        ctx.moveTo(cx, centerFloorY - isoHalfH);
        ctx.lineTo(cx + isoHalfW, centerFloorY);
        ctx.lineTo(cx, centerFloorY + isoHalfH);
        ctx.lineTo(cx - isoHalfW, centerFloorY);
        ctx.closePath();
        ctx.stroke();

        // Inner sub-grid diamond diagonals
        ctx.strokeStyle = "rgba(0, 229, 255, 0.22)";
        ctx.beginPath();
        ctx.moveTo(cx - isoHalfW * 0.5, centerFloorY - isoHalfH * 0.5);
        ctx.lineTo(cx + isoHalfW * 0.5, centerFloorY + isoHalfH * 0.5);
        ctx.moveTo(cx + isoHalfW * 0.5, centerFloorY - isoHalfH * 0.5);
        ctx.lineTo(cx - isoHalfW * 0.5, centerFloorY + isoHalfH * 0.5);
        ctx.stroke();
      } else if (this.perspectiveMode === "topdown") {
        // 3/4 Top-Down RPG perspective box & horizon depth guide
        ctx.strokeStyle = "rgba(0, 229, 255, 0.42)";
        ctx.lineWidth = 1.25;
        const boxW = Math.min(w, h) * 0.56;
        const boxH = boxW * 0.35;
        ctx.strokeRect(cx - boxW * 0.5, baseLinePxY - boxH * 0.75, boxW, boxH);

        // Head-to-body thirds guide
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(0, 229, 255, 0.25)";
        ctx.beginPath();
        ctx.moveTo(0, h * 0.35);
        ctx.lineTo(w, h * 0.35);
        ctx.moveTo(0, h * 0.62);
        ctx.lineTo(w, h * 0.62);
        ctx.stroke();
      } else {
        // 2D Side-Scroller platform plane & height ruler
        ctx.strokeStyle = "rgba(0, 229, 255, 0.45)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, baseLinePxY);
        ctx.lineTo(w, baseLinePxY);
        ctx.stroke();
      }

      // Center vertical axis
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(255, 179, 0, 0.35)";
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Foot-Baseline Ground Anchor Line
    if (this.showBaseline) {
      ctx.save();
      const by = Math.floor((this.baselineY / gridRows) * h) + 0.5;
      ctx.strokeStyle = "rgba(255, 179, 0, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, by);
      ctx.lineTo(w, by);
      ctx.stroke();
      ctx.restore();
    }
  }
}


// --- js/app.js ---
/**
 * PixelForge Studio — Guided 5-Stage Creation Wizard Controller
 * Walks the user one question at a time through Stages 1–5.
 * Every choice made in Stage 1 (Resolution, Camera, Upscale, Palette),
 * Stage 2 (Facing, Proportions, Pose, Weapon Anchor), and
 * Stage 3 (Character Class, Armor, Weapon, Era, Technical Rules)
 * is dynamically woven into the Compiled Prompt and Procedural Synthesizer.
 */

const STORAGE_KEY = "pixelforge_studio_bible_v2";

const STAGE_CONTEXT_LABELS = {
  1: "Stage 1 Preview: Target Canvas Grid & Camera Guide",
  2: "Stage 2 Preview: Color-ID Mannequin & Sobel Canny Edge Map",
  3: "Stage 3 Preview: Conditioning Guide (Left) & Raw AI Output (Right)",
  4: "Stage 4 Split View: Raw High-Res AI Input (Left) → Cleaned Pixel Sprite (Right)",
  5: "Stage 5 Preview: Custom Mannequin Poses & Multi-Frame Animation Strip",
  6: "Stage 6 Preview: Grounded Animation Timeline & Master Packed Sheet"
};

class PixelForgeApp {
  constructor() {
    // Stage 1: Technical Bible state
    this.bible = {
      nativeW: 64,
      nativeH: 64,
      upscaleFactor: 16,
      perspective: "iso", // "iso" | "topdown" | "side"
      paletteKey: "fantasy16",
      paletteHex: [...BUILTIN_PALETTES.fantasy16.colors]
    };

    // Stage 2: Base Mannequin state
    this.mannequin = {
      posePreset: "idle",
      facing: "SE",
      headRatio: 1.25,
      shoulderWidth: 1.0,
      limbThickness: 1.0,
      showWeapon: true,
      headTilt: 0,
      torsoLean: 2,
      frontArmAngle: 22,
      frontElbowBend: 55,
      backArmAngle: -18,
      backElbowBend: 45,
      frontLegAngle: 8,
      frontKneeBend: 12,
      backLegAngle: -8,
      backKneeBend: 16,
      weaponAngle: -35,
      bobOffset: 0
    };

    // Stage 3: Guided AI Bridge state — starts blank so the user chooses their own character!
    this.bridge = {
      charClass: "",
      armor: "",
      weapon: "",
      material: "",
      tokMagentaBg: true,
      tokZeroAA: true,
      tokBoldOutline: true,
      tokFlatLight: true,
      multiFrameStrip: false,
      stripPoses: ["walk1", "walk2", "walk3", "walk4"],
      apiUrl: "http://127.0.0.1:7860/sdapi/v1/img2img",
      apiDenoise: 0.72,
      sourceOriginLabel: ""
    };

    // Stage 4: Deterministic Pixel Cleanup state
    this.cleanup = {
      chromaKeyHex: "#FF00FF",
      useTopLeftSample: false,
      chromaTolerance: 32,
      contiguousFill: true,
      despillStrength: 85,
      edgeHaloShave: 1,
      downscaleMode: "inner-mode",
      enableQuantize: true,
      stripOrphans: true,
      fillPinholes: true,
      outlineMode: "selout",
      solidOutlineHex: "#141013"
    };

    // Stage 5: Animation Timeline & Exporter state
    this.timeline = {
      actionKey: "walk",
      customActionDesc: "",
      aiPromptMode: "strip", // "strip" | "frame1" | "frame2" | "frame3" | "frame4"
      poseGuideMode: "mannequin", // "mannequin" | "paperdoll"
      compositeAiGuideSheet: null,
      savedClips: [],
      frames: [],
      selectedFrameIndex: 0,
      isPlaying: true,
      fps: 6,
      loopMode: "forward",
      playDirection: 1,
      onionSkin: false,
      baselineY: 56,
      alignComX: true,
      sliceCount: 4,
      sheetCols: 4,
      sheetPad: 2,
      animTag: "walk"
    };

    // Custom Mannequin Pose & Strip Sequencer state
    this.customPoses = this._loadCustomPosesFromStorage();
    Object.entries(this.customPoses).forEach(([id, poseObj]) => {
      POSE_PRESETS[id] = poseObj;
    });

    this.customStripFrames = [
      { ...POSE_PRESETS.walk1, name: "Walk Frame 1" },
      { ...POSE_PRESETS.walk2, name: "Walk Frame 2" },
      { ...POSE_PRESETS.walk3, name: "Walk Frame 3" },
      { ...POSE_PRESETS.walk4, name: "Walk Frame 4" }
    ];
    this.customStripActiveIndex = 0;

    // Wizard progress state
    this.activeStage = 1;
    this.completedStages = new Set();
    this.activeQuestionByStage = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };

    // Runtime ImageData buffers
    this.selectedSwatchIndex = 0;
    this.leftBufferMode = "mannequin";
    this.rawAiImageData = null;
    this.rawUploadedOriginalData = null;
    this.detectedCharactersHighRes = [];
    this.selectedDetectedCharIndex = 0;
    this.suggestedImagePaletteHex = [];
    this.suggestedPalCount = 16;
    this.isStripLoaded = false;
    this.stripFrameCount = 1;
    this.mannequinNativeData = null;
    this.mannequinUpscaledData = null;
    this.cannyEdgeData = null;
    this.pipelineResult = null;
    this.packedSheetResult = null;
    this.animTimerId = null;

    this._initViewport();
    this._bindWizardStepperAndQuestions();
    this._bindStage1Controls();
    this._bindStage2Controls();
    this._bindStage3Controls();
    this._bindStage4Controls();
    this._bindStage5Controls();
    this._bindStage6Controls();
    this._bindHeaderAndToolbar();

    // Initialize clean Stage 1 workspace
    this._syncStage1UI();
    this._updateAllPoseSelectDropdowns();
    this._updateMannequinBuffers();
    this._compilePrompt();
    this._updateWizardSummaryBadges();
    this.switchStage(1);
    this._startAnimationLoop();
  }

  _loadCustomPosesFromStorage() {
    try {
      const raw = localStorage.getItem("pixelforge_custom_poses");
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  _saveCustomPose(id, poseObj) {
    this.customPoses[id] = poseObj;
    POSE_PRESETS[id] = poseObj;
    try {
      localStorage.setItem("pixelforge_custom_poses", JSON.stringify(this.customPoses));
    } catch (_) {}
    this._updateAllPoseSelectDropdowns();
  }

  _updateAllPoseSelectDropdowns() {
    const updateSelect = (selectEl, curVal) => {
      if (!selectEl) return;
      const val = curVal !== undefined ? curVal : selectEl.value;
      selectEl.innerHTML = "";

      const defaultGroup = document.createElement("optgroup");
      defaultGroup.label = "Classic Presets";
      Object.entries(POSE_PRESETS).forEach(([key, p]) => {
        if (!key.startsWith("custom_")) {
          const opt = document.createElement("option");
          opt.value = key;
          opt.textContent = p.name;
          defaultGroup.appendChild(opt);
        }
      });
      selectEl.appendChild(defaultGroup);

      const customKeys = Object.keys(this.customPoses);
      if (customKeys.length > 0) {
        const customGroup = document.createElement("optgroup");
        customGroup.label = "Your Custom Poses";
        customKeys.forEach((key) => {
          const p = this.customPoses[key];
          const opt = document.createElement("option");
          opt.value = key;
          opt.textContent = `⭐ ${p.name}`;
          customGroup.appendChild(opt);
        });
        selectEl.appendChild(customGroup);
      }

      if (val && (POSE_PRESETS[val] || this.customPoses[val])) {
        selectEl.value = val;
      }
    };

    updateSelect(document.getElementById("select-pose-preset"), this.mannequin.posePreset);
    updateSelect(document.getElementById("select-frame-preset-picker"), "");
  }

  _saveBibleToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bible));
    } catch (_) {
      // Ignore storage errors
    }
  }

  // ===========================================================================
  // VIEWPORT INITIALIZATION
  // ===========================================================================
  _initViewport() {
    this.viewport = new DualViewportController({
      viewportContainer: document.getElementById("dual-viewport-container"),
      leftPane: document.getElementById("viewport-left-pane"),
      rightPane: document.getElementById("viewport-right-pane"),
      leftCanvas: document.getElementById("canvas-left"),
      rightCanvas: document.getElementById("canvas-right"),
      leftOverlay: document.getElementById("overlay-left"),
      rightOverlay: document.getElementById("overlay-right"),
      onSampleColor: (hex) => {
        this.cleanup.chromaKeyHex = hex;
        this.cleanup.useTopLeftSample = false;
        document.getElementById("input-chroma-color").value = hex;
        document.getElementById("input-chroma-hex").value = hex;
        document.getElementById("check-chroma-topleft").checked = false;
        const pickBtn = document.getElementById("btn-eyedropper-key");
        if (pickBtn) {
          pickBtn.classList.remove("active");
          pickBtn.textContent = "💧 Pick from Canvas";
        }
        this._runStage4Pipeline();
      },
      onHoverPixel: (info) => {
        document.getElementById("hover-color-swatch").style.background = info.hex;
        document.getElementById("hover-coord-text").textContent = `X:${info.x}, Y:${info.y}`;
        document.getElementById("hover-hex-text").textContent = info.hex;
        document.getElementById("hover-rgb-text").textContent = `RGBA(${info.r}, ${info.g}, ${info.b}, ${info.a})`;
      }
    });
  }

  // ===========================================================================
  // WIZARD NAVIGATION (ONE QUESTION AT A TIME + STAGE STEPPER)
  // ===========================================================================
  _bindWizardStepperAndQuestions() {
    document.querySelectorAll(".stepper-node").forEach((node) => {
      node.addEventListener("click", () => {
        const targetStage = Number(node.dataset.stage);
        this.switchStage(targetStage);
      });
    });

    document.querySelectorAll(".wizard-question-card .wq-summary-bar").forEach((bar) => {
      bar.addEventListener("click", () => {
        const card = bar.closest(".wizard-question-card");
        if (!card) return;
        const st = Number(card.dataset.stage);
        const q = Number(card.dataset.q);
        this.openQuestion(st, q);
      });
    });

    document.querySelectorAll("[data-next-q]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".wizard-question-card");
        if (!card) return;
        const st = Number(card.dataset.stage);
        const curQ = Number(card.dataset.q);
        const nextQ = Number(btn.dataset.nextQ);
        card.classList.add("answered");
        this._markQuestionBadgeConfirmed(st, curQ);
        this._compilePrompt();
        this._updateWizardSummaryBadges();
        this.openQuestion(st, nextQ);
      });
    });

    document.querySelectorAll("[data-prev-q]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".wizard-question-card");
        if (!card) return;
        const st = Number(card.dataset.stage);
        const prevQ = Number(btn.dataset.prevQ);
        this.openQuestion(st, prevQ);
      });
    });

    // Stage Completion Buttons
    document.getElementById("btn-complete-stage-1").addEventListener("click", () => {
      this._markAllQuestionsAnswered(1);
      this.completedStages.add(1);
      this._saveBibleToStorage();
      this._compilePrompt();
      this.switchStage(2);
    });

    document.getElementById("btn-complete-stage-2").addEventListener("click", () => {
      this._markAllQuestionsAnswered(2);
      this.completedStages.add(2);
      this._compilePrompt();
      this.switchStage(3);
    });

    document.getElementById("btn-complete-stage-3").addEventListener("click", () => {
      if (!this.rawAiImageData) {
        this.loadSyntheticDemoKnight(false);
      }
      this._markAllQuestionsAnswered(3);
      this.completedStages.add(3);
      this.switchStage(4);
    });

    document.getElementById("btn-complete-stage-5")?.addEventListener("click", () => {
      this._markAllQuestionsAnswered(5);
      this.completedStages.add(5);
      this._compilePrompt();
      this.switchStage(6);
    });
  }

  _markQuestionBadgeConfirmed(stageNum, qNum) {
    const badge = document.getElementById(`ans-${stageNum}-${qNum}`);
    if (badge) badge.classList.remove("needed");
  }

  _markAllQuestionsAnswered(stageNum) {
    document
      .querySelectorAll(`.wizard-question-card[data-stage="${stageNum}"]`)
      .forEach((c) => {
        c.classList.add("answered");
        const q = Number(c.dataset.q);
        this._markQuestionBadgeConfirmed(stageNum, q);
      });
    this._updateWizardSummaryBadges();
  }

  openQuestion(stageNum, qNum) {
    this.activeQuestionByStage[stageNum] = qNum;
    const cards = document.querySelectorAll(`.wizard-question-card[data-stage="${stageNum}"]`);
    cards.forEach((c) => {
      c.classList.toggle("active", Number(c.dataset.q) === qNum);
    });

    if (stageNum === 2) {
      this._setViewportLayoutMode(qNum === 3 ? "split" : "left-only");
      this._refreshViewportBuffers();
    }
  }

  switchStage(stageNum) {
    if (stageNum >= 4 && !this.rawAiImageData) {
      this.loadSyntheticDemoKnight(false);
    }
    if ((stageNum === 5 || stageNum === 6) && this.timeline.frames.length === 0 && this.pipelineResult?.finalData) {
      this._runPaperDollModularSlicer();
    }

    this.activeStage = stageNum;

    for (let s = 1; s <= 6; s++) {
      const node = document.getElementById(`nav-stage-${s}`);
      const circle = document.getElementById(`node-circle-${s}`);
      const line = document.getElementById(`stepper-line-${s}`);
      const isDone = this.completedStages.has(s);
      const isActive = s === stageNum;

      if (node) {
        node.classList.toggle("active", isActive);
        node.classList.toggle("completed", isDone && !isActive);
      }
      if (circle) {
        circle.textContent = isDone && !isActive ? "✓" : String(s);
      }
      if (line) {
        line.classList.toggle("completed", isDone);
      }
    }

    document.querySelectorAll(".stage-inspector").forEach((panel) => {
      panel.classList.toggle("active", Number(panel.dataset.stagePanel) === stageNum);
    });

    document.getElementById("viewport-context-label").textContent =
      STAGE_CONTEXT_LABELS[stageNum] || "";

    const showDock = stageNum === 5 || stageNum === 6;
    document.getElementById("bottom-timeline-dock").classList.toggle("visible", showDock);
    document.getElementById("main-workspace").classList.toggle("dock-visible", showDock);

    if (stageNum === 1) {
      this._setViewportLayoutMode("right-only");
    } else if (stageNum === 2) {
      const q = this.activeQuestionByStage[2] || 1;
      this._setViewportLayoutMode(q === 3 ? "split" : "left-only");
    } else if (stageNum === 3) {
      this._compilePrompt();
      this._setViewportLayoutMode(this.rawAiImageData ? "split" : "left-only");
    } else if (stageNum === 4) {
      this.leftBufferMode = "raw-ai";
      document.getElementById("select-left-buffer-mode").value = "raw-ai";
      this._setViewportLayoutMode("split");
    } else if (stageNum === 5 || stageNum === 6) {
      this._compilePrompt();
      this._setViewportLayoutMode("split");
    }

    this._refreshViewportBuffers();
    this._updateWizardSummaryBadges();
  }

  _setViewportLayoutMode(mode) {
    document.querySelectorAll("[data-layout]").forEach((b) => {
      b.classList.toggle("active", b.dataset.layout === mode);
    });
    this.viewport.setLayout(mode);
  }

  _updateWizardSummaryBadges() {
    const { nativeW, nativeH, upscaleFactor, perspective, paletteHex } = this.bible;
    const aiW = nativeW * upscaleFactor;
    const camShort = { iso: "Isometric 2:1", topdown: "3/4 Top-Down", side: "2D Side" };
    const poseObj = POSE_PRESETS[this.mannequin.posePreset] || POSE_PRESETS.idle;

    const setBadge = (st, q, answeredText, pendingText) => {
      const el = document.getElementById(`ans-${st}-${q}`);
      if (!el) return;
      const isAns = this._isQuestionAnswered(st, q);
      el.textContent = isAns ? answeredText : pendingText;
      el.classList.toggle("needed", !isAns);
    };

    // Stage 1 badges
    setBadge(1, 1, `${nativeW}×${nativeH} px`, `Select Size (${nativeW}×${nativeH})`);
    setBadge(1, 2, camShort[perspective] || "Isometric", "Select Camera");
    setBadge(1, 3, `${upscaleFactor}× (${aiW}px)`, "Select Factor");
    setBadge(1, 4, `${paletteHex.length} Swatches`, "Select Palette");

    // Stage 2 badges
    setBadge(
      2,
      1,
      `${this.mannequin.facing} • Ratio ${this.mannequin.headRatio.toFixed(2)}`,
      "Set Proportions"
    );
    setBadge(2, 2, poseObj.name.split(" (")[0], "Select Pose");
    document.getElementById("ans-2-3").textContent = `${this.mannequinUpscaledData?.width || aiW}px Guides`;

    // Stage 3 badges
    const hasCharDesc = Boolean(
      this.bridge.charClass.trim() || this.bridge.armor.trim() || this.bridge.weapon.trim()
    );
    const b31 = document.getElementById("ans-3-1");
    if (hasCharDesc) {
      b31.textContent = (this.bridge.charClass || this.bridge.armor || "Custom").slice(0, 18);
      b31.classList.remove("needed");
    } else {
      b31.textContent = "Your Input Needed";
      b31.classList.add("needed");
    }

    document.getElementById("ans-3-2").textContent = "Single Base Sprite";

    const badge33 = document.getElementById("ans-3-3");
    if (this.rawAiImageData) {
      badge33.textContent = this.bridge.sourceOriginLabel || `${this.rawAiImageData.width}px Loaded`;
      badge33.classList.remove("needed");
    } else {
      badge33.textContent = "Action Needed";
      badge33.classList.add("needed");
    }

    // Stage 4 badges
    const modeShort = {
      "inner-mode": "Inner-50% Mode",
      "inner-median": "Inner-50% Median",
      "center-pixel": "Center Pixel"
    };
    document.getElementById("ans-4-1").textContent = `${this.cleanup.chromaKeyHex} • Tol ${this.cleanup.chromaTolerance} • Despill ${this.cleanup.despillStrength}% • Shave ${this.cleanup.edgeHaloShave}px`;
    document.getElementById("ans-4-2").textContent = modeShort[this.cleanup.downscaleMode] || "Inner-50%";
    const isExtractedPal = this.bible.paletteKey === "extracted_image";
    document.getElementById("ans-4-3").textContent = this.cleanup.enableQuantize
      ? isExtractedPal
        ? `Image Pal (${paletteHex.length} Col)`
        : `CIELAB (${paletteHex.length} Col)`
      : "Raw RGB";
    document.getElementById("ans-4-4").textContent = this.cleanup.outlineMode.toUpperCase();

    // Stage 5 badges
    const actObj = ANIMATION_ACTION_LIBRARY[this.timeline.actionKey] || ANIMATION_ACTION_LIBRARY.walk;
    const b51 = document.getElementById("ans-5-1");
    if (b51) {
      const fCount =
        this.timeline.actionKey === "custom" && this.customStripFrames
          ? this.customStripFrames.length
          : this.timeline.frames.length;
      b51.textContent = `${actObj.name.split(" (")[0]} (${fCount}F)`;
    }
    const b52 = document.getElementById("ans-5-2");
    if (b52) {
      b52.textContent =
        this.timeline.aiPromptMode === "strip" ? "Multi-Pose Strip" : this.timeline.aiPromptMode.toUpperCase();
    }

    // Stage 6 badges
    const b61 = document.getElementById("ans-6-1");
    if (b61) {
      b61.textContent = `Y = ${this.timeline.baselineY} px`;
    }
    const b62 = document.getElementById("ans-6-2");
    if (b62) {
      b62.textContent = this.packedSheetResult
        ? `${this.packedSheetResult.sheetWidth}×${this.packedSheetResult.sheetHeight} px`
        : "Ready";
    }
  }

  _isQuestionAnswered(stageNum, qNum) {
    const card = document.querySelector(
      `.wizard-question-card[data-stage="${stageNum}"][data-q="${qNum}"]`
    );
    return card ? card.classList.contains("answered") : false;
  }

  _bindHeaderAndToolbar() {
    // Optional Load Sample Project button
    document.getElementById("btn-load-demo-knight").addEventListener("click", () => {
      this.bridge.charClass = "tactical paladin knight";
      this.bridge.armor = "steel plate cuirass, gold pauldrons, crimson cape";
      this.bridge.weapon = "gleaming broadsword";
      this.bridge.material = "16-bit SNES tactical RPG style";
      document.getElementById("prompt-class").value = this.bridge.charClass;
      document.getElementById("prompt-armor").value = this.bridge.armor;
      document.getElementById("prompt-weapon").value = this.bridge.weapon;
      document.getElementById("prompt-material").value = this.bridge.material;
      this._compilePrompt();

      this.loadSyntheticDemoKnight(true);
      [1, 2, 3, 4].forEach((s) => {
        this._markAllQuestionsAnswered(s);
        this.completedStages.add(s);
      });
      this.switchStage(4);
    });

    // Start Fresh button
    document.getElementById("btn-reset-bible").addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      this.completedStages.clear();
      this.rawAiImageData = null;
      this.rawUploadedOriginalData = null;
      this.detectedCharactersHighRes = [];
      this.selectedDetectedCharIndex = 0;
      this.pipelineResult = null;
      this.timeline.frames = [];
      this.bridge.charClass = "";
      this.bridge.armor = "";
      this.bridge.weapon = "";
      this.bridge.material = "";
      this.bridge.sourceOriginLabel = "";
      document.getElementById("prompt-class").value = "";
      document.getElementById("prompt-armor").value = "";
      document.getElementById("prompt-weapon").value = "";
      document.getElementById("prompt-material").value = "";
      document.querySelectorAll(".chip-btn").forEach((b) => b.classList.remove("selected"));
      document.querySelectorAll(".wizard-question-card").forEach((c) => c.classList.remove("answered"));
      this.activeQuestionByStage = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
      for (let s = 1; s <= 6; s++) this.openQuestion(s, 1);

      this._renderDetectedCharSelectorBar();
      this._syncStage1UI();
      this._updateMannequinBuffers();
      this._compilePrompt();
      this.switchStage(1);
    });

    const layoutBtns = document.querySelectorAll("[data-layout]");
    layoutBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        this._setViewportLayoutMode(btn.dataset.layout);
      });
    });

    document.getElementById("select-left-buffer-mode").addEventListener("change", (e) => {
      this.leftBufferMode = e.target.value;
      this._refreshViewportBuffers();
    });

    const bindToggle = (id, prop) => {
      const btn = document.getElementById(id);
      btn.addEventListener("click", () => {
        this.viewport[prop] = !this.viewport[prop];
        btn.classList.toggle("active", this.viewport[prop]);
        this.viewport.applyTransforms();
      });
    };

    bindToggle("toggle-pixel-grid", "showPixelGrid");
    bindToggle("toggle-perspective-guide", "showPerspectiveGuide");
    bindToggle("toggle-checkerboard", "showCheckerboard");
    bindToggle("toggle-baseline-guide", "showBaseline");

    document.getElementById("btn-zoom-in").addEventListener("click", () => {
      this.viewport.setZoom(this.viewport.zoom * 1.25);
    });
    document.getElementById("btn-zoom-out").addEventListener("click", () => {
      this.viewport.setZoom(this.viewport.zoom / 1.25);
    });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => {
      this.viewport.resetView();
    });
  }

  // ===========================================================================
  // STAGE 1: TECHNICAL BIBLE & CONSTRAINTS
  // ===========================================================================
  _bindStage1Controls() {
    const resBtns = document.querySelectorAll("[data-res]");
    resBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const [w, h] = btn.dataset.res.split("x").map(Number);
        document.getElementById("input-native-w").value = w;
        document.getElementById("input-native-h").value = h;
        btn.closest(".wizard-question-card")?.classList.add("answered");
        this._applyNativeResolution(w, h);
      });
    });

    document.getElementById("btn-apply-resolution").addEventListener("click", (e) => {
      const w = Number(document.getElementById("input-native-w").value) || 64;
      const h = Number(document.getElementById("input-native-h").value) || 64;
      e.currentTarget.closest(".wizard-question-card")?.classList.add("answered");
      this._applyNativeResolution(w, h);
    });

    const upBtns = document.querySelectorAll("[data-upscale]");
    upBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.bible.upscaleFactor = Number(btn.dataset.upscale);
        btn.closest(".wizard-question-card")?.classList.add("answered");
        this._saveBibleToStorage();
        this._syncStage1UI();
        this._updateMannequinBuffers();
        this._compilePrompt();
        this._refreshViewportBuffers();
        this._updateWizardSummaryBadges();
      });
    });

    document.getElementById("select-perspective").addEventListener("change", (e) => {
      this.bible.perspective = e.target.value;
      e.currentTarget.closest(".wizard-question-card")?.classList.add("answered");
      this._saveBibleToStorage();
      this._syncStage1UI();
      this._compilePrompt();
      this.viewport.applyTransforms();
      this._updateWizardSummaryBadges();
    });

    document.getElementById("select-palette-preset").addEventListener("change", (e) => {
      const key = e.target.value;
      if (BUILTIN_PALETTES[key]) {
        this.bible.paletteKey = key;
        this.bible.paletteHex = [...BUILTIN_PALETTES[key].colors];
        this.selectedSwatchIndex = 0;
        e.currentTarget.closest(".wizard-question-card")?.classList.add("answered");
        this._saveBibleToStorage();
        this._renderPaletteSwatches();
        this._compilePrompt();
        if (this.rawAiImageData) this._runStage4Pipeline();
        else this._refreshViewportBuffers();
        this._updateWizardSummaryBadges();
      }
    });

    const swatchColorInput = document.getElementById("input-new-swatch-color");
    const swatchHexInput = document.getElementById("input-new-swatch-hex");
    swatchColorInput.addEventListener("input", (e) => {
      swatchHexInput.value = e.target.value.toUpperCase();
    });
    swatchHexInput.addEventListener("change", (e) => {
      const { r, g, b } = hexToRgb(e.target.value);
      const clean = rgbToHex(r, g, b);
      swatchHexInput.value = clean;
      swatchColorInput.value = clean;
    });

    document.getElementById("btn-add-swatch").addEventListener("click", () => {
      const { r, g, b } = hexToRgb(swatchHexInput.value);
      const hex = rgbToHex(r, g, b);
      if (!this.bible.paletteHex.includes(hex)) {
        this.bible.paletteHex.push(hex);
        this.selectedSwatchIndex = this.bible.paletteHex.length - 1;
        this._saveBibleToStorage();
        this._renderPaletteSwatches();
        this._compilePrompt();
        if (this.rawAiImageData) this._runStage4Pipeline();
        else this._refreshViewportBuffers();
        this._updateWizardSummaryBadges();
      }
    });

    document.getElementById("btn-remove-swatch").addEventListener("click", () => {
      if (this.bible.paletteHex.length <= 2) return;
      this.bible.paletteHex.splice(this.selectedSwatchIndex, 1);
      this.selectedSwatchIndex = Math.max(0, this.selectedSwatchIndex - 1);
      this._saveBibleToStorage();
      this._renderPaletteSwatches();
      this._compilePrompt();
      if (this.rawAiImageData) this._runStage4Pipeline();
      else this._refreshViewportBuffers();
      this._updateWizardSummaryBadges();
    });

    const exportPal = (ext) => {
      const content = formatPaletteExport(this.bible.paletteHex, ext);
      this._downloadTextFile(`pixelforge_palette.${ext}`, content);
    };
    document.getElementById("btn-export-pal-hex").addEventListener("click", () => exportPal("hex"));
    document.getElementById("btn-export-pal-pal").addEventListener("click", () => exportPal("pal"));
    document.getElementById("btn-export-pal-json").addEventListener("click", () => exportPal("json"));

    document.getElementById("input-import-palette-file").addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = parsePaletteFileText(String(reader.result || ""));
        if (parsed.length >= 2) {
          this.bible.paletteHex = parsed;
          this.selectedSwatchIndex = 0;
          this._saveBibleToStorage();
          this._renderPaletteSwatches();
          this._compilePrompt();
          if (this.rawAiImageData) this._runStage4Pipeline();
          else this._refreshViewportBuffers();
          this._updateWizardSummaryBadges();
        }
      };
      reader.readAsText(file);
    });
  }

  _applyNativeResolution(w, h) {
    const clampedW = Math.max(16, Math.min(256, Math.round(w)));
    const clampedH = Math.max(16, Math.min(256, Math.round(h)));
    this.bible.nativeW = clampedW;
    this.bible.nativeH = clampedH;
    this.timeline.baselineY = Math.floor(clampedH * 0.88);

    const baseSlider = document.getElementById("slider-baseline-y");
    baseSlider.max = String(clampedH - 1);
    baseSlider.value = String(this.timeline.baselineY);
    document.getElementById("val-baseline-y").textContent = `${this.timeline.baselineY} px`;

    this._saveBibleToStorage();
    this._syncStage1UI();
    this._updateMannequinBuffers();
    this._compilePrompt();
    if (this.rawAiImageData) {
      this._runStage4Pipeline();
    } else {
      this._refreshViewportBuffers();
    }
    this.viewport.resetView();
    this._updateWizardSummaryBadges();
  }

  _syncStage1UI() {
    const { nativeW, nativeH, upscaleFactor, perspective, paletteKey } = this.bible;
    const aiW = nativeW * upscaleFactor;
    const aiH = nativeH * upscaleFactor;

    document.getElementById("input-native-w").value = nativeW;
    document.getElementById("input-native-h").value = nativeH;

    const resKey = `${nativeW}x${nativeH}`;
    document.querySelectorAll("[data-res]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.res === resKey);
    });

    document.querySelectorAll("[data-upscale]").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.upscale) === upscaleFactor);
    });

    document.getElementById("upscale-calc-readout").innerHTML =
      `<code>${nativeW}×${nativeH}</code> Native @ <code>${upscaleFactor}×</code> = <strong>${aiW}×${aiH} px</strong> AI Canvas`;

    document.getElementById("select-perspective").value = perspective;
    if (BUILTIN_PALETTES[paletteKey]) {
      document.getElementById("select-palette-preset").value = paletteKey;
    }

    this.viewport.nativeW = nativeW;
    this.viewport.nativeH = nativeH;
    this.viewport.perspectiveMode = perspective;
    this.viewport.baselineY = this.timeline.baselineY;

    this._renderPaletteSwatches();
  }

  _renderPaletteSwatches() {
    const grid = document.getElementById("master-palette-grid");
    grid.innerHTML = "";
    this.bible.paletteHex.forEach((hex, idx) => {
      const div = document.createElement("div");
      div.className = `palette-swatch-item${idx === this.selectedSwatchIndex ? " selected" : ""}`;
      div.style.backgroundColor = hex;
      div.title = `${hex} (Swatch #${idx + 1})`;
      div.addEventListener("click", () => {
        this.selectedSwatchIndex = idx;
        document.getElementById("input-new-swatch-color").value = hex;
        document.getElementById("input-new-swatch-hex").value = hex;
        this._renderPaletteSwatches();
      });
      grid.appendChild(div);
    });
  }

  _buildStage1BlankCanvasPreview() {
    const { nativeW, nativeH, paletteHex } = this.bible;
    const img = new ImageData(nativeW, nativeH);
    const data = img.data;

    const barH = Math.max(2, Math.min(4, Math.floor(nativeH * 0.06)));
    for (let y = 0; y < barH; y++) {
      for (let x = 0; x < nativeW; x++) {
        const swatchIdx = Math.min(
          paletteHex.length - 1,
          Math.floor((x / nativeW) * paletteHex.length)
        );
        const rgb = hexToRgb(paletteHex[swatchIdx]);
        const idx = (y * nativeW + x) * 4;
        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = 255;
      }
    }
    return img;
  }

  // ===========================================================================
  // STAGE 2: BASE MANNEQUIN & POSE BLOCKOUT GENERATOR
  // ===========================================================================
  _bindStage2Controls() {
    const poseSelect = document.getElementById("select-pose-preset");
    poseSelect.addEventListener("change", (e) => {
      const key = e.target.value;
      const preset = POSE_PRESETS[key];
      if (!preset) return;
      this.mannequin.posePreset = key;
      this.mannequin.headTilt = preset.headTilt;
      this.mannequin.torsoLean = preset.torsoLean;
      this.mannequin.frontArmAngle = preset.frontArmAngle;
      this.mannequin.frontElbowBend = preset.frontElbowBend ?? 55;
      this.mannequin.backArmAngle = preset.backArmAngle;
      this.mannequin.backElbowBend = preset.backElbowBend ?? 45;
      this.mannequin.frontLegAngle = preset.frontLegAngle;
      this.mannequin.frontKneeBend = preset.frontKneeBend ?? 12;
      this.mannequin.backLegAngle = preset.backLegAngle;
      this.mannequin.backKneeBend = preset.backKneeBend ?? 16;
      this.mannequin.weaponAngle = preset.weaponAngle;
      this.mannequin.bobOffset = preset.bobOffset || 0;
      e.currentTarget.closest(".wizard-question-card")?.classList.add("answered");
      this._syncStage2BoneSliders();
      this._updateMannequinBuffers();
      this._compilePrompt();
      this._refreshViewportBuffers();
      this._updateWizardSummaryBadges();
    });

    document.getElementById("select-mannequin-facing").addEventListener("change", (e) => {
      this.mannequin.facing = e.target.value;
      e.currentTarget.closest(".wizard-question-card")?.classList.add("answered");
      this._updateMannequinBuffers();
      this._compilePrompt();
      this._refreshViewportBuffers();
      this._updateWizardSummaryBadges();
    });

    const bindPropSlider = (sliderId, valId, key, formatFn = (v) => v.toFixed(2)) => {
      const slider = document.getElementById(sliderId);
      const readout = document.getElementById(valId);
      slider.addEventListener("input", (e) => {
        const val = Number(e.target.value);
        this.mannequin[key] = val;
        readout.textContent = formatFn(val);
        e.currentTarget.closest(".wizard-question-card")?.classList.add("answered");
        this._updateMannequinBuffers();
        this._compilePrompt();
        this._refreshViewportBuffers();
        this._updateWizardSummaryBadges();
      });
    };

    bindPropSlider("slider-prop-head", "val-prop-head", "headRatio");
    bindPropSlider("slider-prop-shoulder", "val-prop-shoulder", "shoulderWidth");
    bindPropSlider("slider-prop-limb", "val-prop-limb", "limbThickness");

    bindPropSlider("slider-bone-head", "val-bone-head", "headTilt", (v) => `${v}°`);
    bindPropSlider("slider-bone-torso", "val-bone-torso", "torsoLean", (v) => `${v}°`);
    bindPropSlider("slider-bone-farm", "val-bone-farm", "frontArmAngle", (v) => `${v}°`);
    bindPropSlider("slider-bone-felbow", "val-bone-felbow", "frontElbowBend", (v) => `${v}°`);
    bindPropSlider("slider-bone-barm", "val-bone-barm", "backArmAngle", (v) => `${v}°`);
    bindPropSlider("slider-bone-belbow", "val-bone-belbow", "backElbowBend", (v) => `${v}°`);
    bindPropSlider("slider-bone-fleg", "val-bone-fleg", "frontLegAngle", (v) => `${v}°`);
    bindPropSlider("slider-bone-fknee", "val-bone-fknee", "frontKneeBend", (v) => `${v}°`);
    bindPropSlider("slider-bone-bleg", "val-bone-bleg", "backLegAngle", (v) => `${v}°`);
    bindPropSlider("slider-bone-bknee", "val-bone-bknee", "backKneeBend", (v) => `${v}°`);
    bindPropSlider("slider-bone-weapon", "val-bone-weapon", "weaponAngle", (v) => `${v}°`);

    document.getElementById("check-show-weapon").addEventListener("change", (e) => {
      this.mannequin.showWeapon = e.target.checked;
      this._updateMannequinBuffers();
      this._compilePrompt();
      this._refreshViewportBuffers();
    });

    document.getElementById("btn-export-mannequin-png").addEventListener("click", () => {
      if (!this.mannequinUpscaledData) return;
      this._downloadImageDataAsPng(
        this.mannequinUpscaledData,
        `pixelforge_mannequin_${this.mannequinUpscaledData.width}x${this.mannequinUpscaledData.height}.png`
      );
    });

    document.getElementById("btn-export-canny-png").addEventListener("click", () => {
      if (!this.cannyEdgeData) return;
      this._downloadImageDataAsPng(
        this.cannyEdgeData,
        `pixelforge_canny_edge_${this.cannyEdgeData.width}x${this.cannyEdgeData.height}.png`
      );
    });

    document.getElementById("btn-save-stage2-custom-pose")?.addEventListener("click", () => {
      const nameInput = document.getElementById("input-save-stage2-pose-name");
      const name = (nameInput?.value || "").trim() || `Custom Pose #${Object.keys(this.customPoses).length + 1}`;
      const id = "custom_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const poseObj = {
        name,
        headTilt: this.mannequin.headTilt,
        torsoLean: this.mannequin.torsoLean,
        frontArmAngle: this.mannequin.frontArmAngle,
        frontElbowBend: this.mannequin.frontElbowBend ?? 55,
        backArmAngle: this.mannequin.backArmAngle,
        backElbowBend: this.mannequin.backElbowBend ?? 45,
        frontLegAngle: this.mannequin.frontLegAngle,
        frontKneeBend: this.mannequin.frontKneeBend ?? 12,
        backLegAngle: this.mannequin.backLegAngle,
        backKneeBend: this.mannequin.backKneeBend ?? 16,
        weaponAngle: this.mannequin.weaponAngle,
        bobOffset: this.mannequin.bobOffset || 0
      };
      this._saveCustomPose(id, poseObj);
      if (nameInput) nameInput.value = "";
      const feedback = document.getElementById("save-stage2-pose-feedback");
      if (feedback) {
        feedback.style.display = "block";
        feedback.textContent = `✓ Saved pose "${name}" to your preset library!`;
        setTimeout(() => { feedback.style.display = "none"; }, 3500);
      }
    });
  }

  _syncStage2BoneSliders() {
    const m = this.mannequin;
    const setSlider = (sId, vId, val) => {
      const el = document.getElementById(sId);
      const readout = document.getElementById(vId);
      if (el) el.value = val;
      if (readout) readout.textContent = `${val}°`;
    };
    setSlider("slider-bone-head", "val-bone-head", m.headTilt);
    setSlider("slider-bone-torso", "val-bone-torso", m.torsoLean);
    setSlider("slider-bone-farm", "val-bone-farm", m.frontArmAngle);
    setSlider("slider-bone-felbow", "val-bone-felbow", m.frontElbowBend ?? 55);
    setSlider("slider-bone-barm", "val-bone-barm", m.backArmAngle);
    setSlider("slider-bone-belbow", "val-bone-belbow", m.backElbowBend ?? 45);
    setSlider("slider-bone-fleg", "val-bone-fleg", m.frontLegAngle);
    setSlider("slider-bone-fknee", "val-bone-fknee", m.frontKneeBend ?? 12);
    setSlider("slider-bone-bleg", "val-bone-bleg", m.backLegAngle);
    setSlider("slider-bone-bknee", "val-bone-bknee", m.backKneeBend ?? 16);
    setSlider("slider-bone-weapon", "val-bone-weapon", m.weaponAngle);
  }

  _updateMannequinBuffers() {
    const { nativeW, nativeH, upscaleFactor } = this.bible;
    this.mannequinNativeData = renderMannequinImageData(nativeW, nativeH, this.mannequin);

    const effectiveFactor = Math.max(1, Math.min(upscaleFactor, Math.floor(1024 / Math.max(nativeW, nativeH))));
    this.mannequinUpscaledData = upscaleNearestNeighbor(this.mannequinNativeData, effectiveFactor);
    this.cannyEdgeData = generateSobelEdgeMap(this.mannequinUpscaledData, 40);
  }

  // ===========================================================================
  // STAGE 3: GUIDED AI BRIDGE & DYNAMIC MULTI-STAGE PROMPT COMPILER
  // ===========================================================================
  _bindStage3Controls() {
    const syncBridgeInputs = () => {
      this.bridge.charClass = document.getElementById("prompt-class").value;
      this.bridge.armor = document.getElementById("prompt-armor").value;
      this.bridge.weapon = document.getElementById("prompt-weapon").value;
      this.bridge.material = document.getElementById("prompt-material").value;
      this._compilePrompt();
      this._updateWizardSummaryBadges();
    };

    const promptInputs = ["prompt-class", "prompt-armor", "prompt-weapon", "prompt-material"];
    promptInputs.forEach((id) => {
      document.getElementById(id).addEventListener("input", syncBridgeInputs);
    });

    // Quick-pick suggestion chips for Stage 3 Question 1
    document.querySelectorAll("[data-chip-target]").forEach((row) => {
      const targetId = row.dataset.chipTarget;
      const inputEl = document.getElementById(targetId);
      row.querySelectorAll(".chip-btn").forEach((chip) => {
        chip.addEventListener("click", () => {
          row.querySelectorAll(".chip-btn").forEach((b) => b.classList.remove("selected"));
          chip.classList.add("selected");
          if (inputEl) {
            inputEl.value = chip.dataset.val;
            syncBridgeInputs();
          }
        });
      });
    });

    // Technical rule checkboxes in Stage 3 Question 2
    const bindRuleCheck = (id, key) => {
      document.getElementById(id)?.addEventListener("change", (e) => {
        this.bridge[key] = e.target.checked;
        this._compilePrompt();
      });
    };
    bindRuleCheck("tok-magenta-bg", "tokMagentaBg");
    bindRuleCheck("tok-zero-aa", "tokZeroAA");
    bindRuleCheck("tok-bold-outline", "tokBoldOutline");
    bindRuleCheck("tok-flat-light", "tokFlatLight");

    document.getElementById("btn-copy-prompt").addEventListener("click", () => {
      const box = document.getElementById("compiled-prompt-output");
      navigator.clipboard?.writeText(box.value);
      const btn = document.getElementById("btn-copy-prompt");
      btn.textContent = "✓ Copied";
      setTimeout(() => {
        btn.textContent = "📋 Copy";
      }, 1400);
    });

    // Stage 3 Option B: Synthesize Single Base Sprite from User's Stage 1–3 Choices
    document.getElementById("btn-synth-from-mannequin").addEventListener("click", () => {
      this.detectedCharactersHighRes = [];
      this.selectedDetectedCharIndex = 0;
      this._renderDetectedCharSelectorBar();
      this.loadSyntheticDemoKnight(false);
      this._setViewportLayoutMode("split");
      this.leftBufferMode = "mannequin";
      document.getElementById("select-left-buffer-mode").value = "mannequin";
      this._refreshViewportBuffers();
    });

    // Stage 3 Quick Button: Load the user's uploaded Nano Banana Female Paladin (1024x571)
    document.getElementById("btn-load-nano-paladin")?.addEventListener("click", () => {
      this.loadUploadedNanoBananaPaladin();
    });

    // Stage 3 Option A: Drag & Drop / File Upload Ingestion (Auto-Isolates Base Character!)
    const dropzone = document.getElementById("ai-image-dropzone");
    const fileInput = document.getElementById("input-upload-ai-image");

    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) this._ingestUploadedImageFile(file, false);
    });
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) this._ingestUploadedImageFile(file, false);
    });

    // Option C: Local API Mode
    const denoiseSlider = document.getElementById("slider-api-denoise");
    denoiseSlider.addEventListener("input", (e) => {
      this.bridge.apiDenoise = Number(e.target.value);
      document.getElementById("val-api-denoise").textContent = this.bridge.apiDenoise.toFixed(2);
    });

    document.getElementById("btn-trigger-local-api").addEventListener("click", () => {
      this._executeLocalApiBridge();
    });
  }

  _getSelectedStripPoses() {
    const checks = document.querySelectorAll("#strip-pose-checkboxes input[type='checkbox']:checked");
    const list = Array.from(checks).map((c) => c.value);
    return list.length > 0 ? list : ["walk1", "walk2", "walk3", "walk4"];
  }

  /**
   * Dynamically compile:
   * 1) Stage 3 SINGLE BASE CHARACTER Prompt (natural visual language for Nano Banana / Gemini / SD,
   *    strictly enforcing 1 solo character in a 1:1 square frame so it never prematurely creates a sprite sheet).
   * 2) Stage 5 MULTI-POSE ANIMATION STRIP Prompt (for animating the locked Base Character in Stage 5).
   */
  _compilePrompt() {
    const { nativeW, nativeH, upscaleFactor, perspective, paletteKey, paletteHex } = this.bible;
    const aiW = nativeW * upscaleFactor;
    const aiH = nativeH * upscaleFactor;

    // 1. Stage 1 Technical Bible Factors (Natural AI-friendly visual terms, zero confusing internal math)
    const perspectiveNames = {
      iso: "isometric 30-degree three-quarter camera angle",
      topdown: "3/4 top-down RPG camera angle",
      side: "2D side-profile platformer view"
    };
    const perspToken = perspectiveNames[perspective] || "isometric camera angle";
    const palName = BUILTIN_PALETTES[paletteKey]?.name?.split(" (")[0] || `${paletteHex.length}-Color Custom Palette`;
    const gridStyleDesc =
      nativeW <= 48
        ? `chunky ${nativeW}x${nativeH} retro pixel art density`
        : nativeW <= 64
        ? `crisp ${nativeW}x${nativeH} 16-bit pixel art density`
        : `detailed ${nativeW}x${nativeH} 32-bit tactics pixel art density`;
    const stage1Tokens = `${gridStyleDesc}, ${perspToken}, ${palName} color palette (${paletteHex.length} distinct colors)`;

    // 2. Stage 2 Mannequin Pose & Proportion Factors (Single Base Character Pose)
    const facingNames = {
      SE: "facing front-right (SE isometric)",
      SW: "facing front-left (SW isometric)",
      NE: "facing back-right (NE isometric)",
      NW: "facing back-left (NW isometric)",
      S: "facing directly forward (south)",
      N: "facing away (north back view)",
      E: "facing right in profile",
      W: "facing left in profile"
    };
    const facingToken = facingNames[this.mannequin.facing] || `facing ${this.mannequin.facing}`;
    const propDesc =
      this.mannequin.headRatio >= 1.4
        ? "compact chibi tactical proportions"
        : this.mannequin.headRatio <= 1.0
        ? "tall heroic proportions"
        : "balanced tactical RPG proportions";

    const poseObj = POSE_PRESETS[this.mannequin.posePreset] || POSE_PRESETS.idle;
    const poseNameClean = poseObj.name.split(" (")[0];
    const stage2Tokens = `${facingToken}, ${propDesc}, standing in a ${poseNameClean} pose`;

    // 3. Stage 3 User Character & Technical Post-Process Tokens
    const subjectParts = [];
    if (this.bridge.charClass.trim()) {
      subjectParts.push(this.bridge.charClass.trim());
    } else {
      subjectParts.push("[Select or type Character Class in Step 1]");
    }
    if (this.bridge.armor.trim()) {
      subjectParts.push(`wearing ${this.bridge.armor.trim()}`);
    }
    if (this.mannequin.showWeapon && this.bridge.weapon.trim()) {
      subjectParts.push(`wielding ${this.bridge.weapon.trim()}`);
    } else if (!this.mannequin.showWeapon) {
      subjectParts.push("unarmed");
    }
    if (this.bridge.material.trim()) {
      subjectParts.push(this.bridge.material.trim());
    }

    const techRuleParts = [
      "1:1 square aspect ratio",
      "single full-body character centered in frame with margin around head and feet"
    ];
    if (this.bridge.tokMagentaBg) {
      techRuleParts.push("plain solid flat #FF00FF magenta background");
    }
    if (this.bridge.tokZeroAA) {
      techRuleParts.push("sharp hard-edged pixel clusters, zero anti-aliasing, no soft gradients");
    }
    if (this.bridge.tokBoldOutline) {
      techRuleParts.push("clean dark 1px outer silhouette outline");
    }
    if (this.bridge.tokFlatLight) {
      techRuleParts.push("flat cel-shaded pixel lighting, no cast floor shadow");
    }

    const compiledSingleBase = [
      `Single solo pixel art character sprite (1 character only, do NOT draw multiple characters or a sprite sheet) of ${subjectParts.join(", ")}`,
      stage1Tokens,
      stage2Tokens,
      techRuleParts.join(", ")
    ].join(", ");

    const outBox = document.getElementById("compiled-prompt-output");
    if (outBox) outBox.value = compiledSingleBase;

    // Render visual breakdown box in Stage 3 Question 2 so user sees every stage's contribution
    const breakdownBox = document.getElementById("prompt-factors-box");
    if (breakdownBox) {
      breakdownBox.innerHTML = `
        <div class="pf-row">
          <span class="pf-stage-tag">STAGE 1</span>
          <span class="pf-text"><strong>${nativeW}×${nativeH}</strong> grid (${aiW}×${aiH} canvas) • <strong>${perspToken}</strong> • <strong>${palName}</strong></span>
        </div>
        <div class="pf-row">
          <span class="pf-stage-tag s2">STAGE 2</span>
          <span class="pf-text"><strong>Solo Base Character</strong> • <strong>${facingToken}</strong> • <strong>${propDesc}</strong> • <strong>${poseNameClean}</strong></span>
        </div>
        <div class="pf-row">
          <span class="pf-stage-tag s3">STAGE 3</span>
          <span class="pf-text"><strong>${subjectParts.join(", ")}</strong> • 1:1 Single Character (No Sprite Sheet)</span>
        </div>
      `;
    }

    // Also update the Stage 5 Action Breakdown & AI Animation Prompt (used AFTER the Base Character is locked in Stage 4)
    const actionObj =
      ANIMATION_ACTION_LIBRARY[this.timeline.actionKey] || ANIMATION_ACTION_LIBRARY.walk;
    const customMotion = (this.timeline.customActionDesc || "").trim();
    const actionTitle = customMotion ? `${actionObj.name} (${customMotion})` : actionObj.name;

    const isCustomAction = this.timeline.actionKey === "custom";
    const customDescs =
      isCustomAction && this.customStripFrames && this.customStripFrames.length > 0
        ? this.customStripFrames.map(
            (f, i) =>
              `Frame ${i + 1} (${f.name ? f.name.split(" (")[0] : "Custom Pose"}): head ${f.headTilt}°, torso ${f.torsoLean}°, front knee ${f.frontKneeBend}°, back knee ${f.backKneeBend}°, weapon ${f.weaponAngle}°`
          )
        : actionObj.frameDescriptions;

    const actionBreakdownBox = document.getElementById("anim-action-frames-breakdown");
    if (actionBreakdownBox) {
      actionBreakdownBox.innerHTML = customDescs
        .map(
          (desc, idx) => `
        <div class="pf-row">
          <span class="pf-stage-tag s2">FRAME ${idx + 1}</span>
          <span class="pf-text">${desc.replace(/^Frame \d+\s*(\([^)]+\))?:?\s*/, "")}</span>
        </div>`
        )
        .join("");
    }

    const stage5Out = document.getElementById("stage5-anim-prompt-output");
    if (stage5Out) {
      const mode = this.timeline.aiPromptMode || "strip";
      const charSubject =
        this.bridge.charClass.trim() || this.bridge.armor.trim()
          ? subjectParts.join(", ")
          : "the exact character shown in the attached reference sprite";

      if (mode === "strip") {
        const frameLines = customDescs.map((d, i) => `[${i + 1}] ${d}`).join(" ");
        stage5Out.value = [
          `Using the attached character reference sheet as exact visual identity (keep identical face, hair, armor, weapon, colors, and ${perspToken}), generate a ${customDescs.length}-frame horizontal pixel art animation strip for "${actionTitle}" of ${charSubject}`,
          `Draw ${customDescs.length} distinct side-by-side keyframe poses from left to right with wide empty #FF00FF magenta gaps between each character (do NOT draw identical standing clones):`,
          frameLines,
          `${gridStyleDesc}, ${facingToken}, all characters standing on the exact same horizontal ground line, plain solid flat #FF00FF magenta background, sharp pixel clusters, zero anti-aliasing, no floor shadow`
        ].join(" ");
      } else {
        const frameIdx = Math.max(
          0,
          Math.min(customDescs.length - 1, Number(mode.replace("frame", "")) - 1)
        );
        const singlePoseDesc = customDescs[frameIdx];
        stage5Out.value = [
          `Using the attached Base Character sprite as exact identity reference (keep identical face, hair, armor, weapon, and colors), generate 1 single solo pixel art keyframe sprite of ${charSubject} performing ${actionTitle} — specifically ${singlePoseDesc}`,
          `1:1 square aspect ratio, single full-body character centered in frame, ${gridStyleDesc}, ${perspToken}, ${facingToken}, plain solid flat #FF00FF magenta background, sharp pixel clusters, zero anti-aliasing, no floor shadow`
        ].join(", ");
      }
    }

    return compiledSingleBase;
  }

  /**
   * Smart Image Ingestion:
   * Uses detectAndNormalizeCharacters() so that whether the user uploads a 1:1 single sprite,
   * a 16:9 widescreen image, or a multi-character strip (like Nano Banana's 1024x571 4-Paladin output),
   * it automatically isolates each character and normalizes its aspect ratio to match nativeW:nativeH
   * without squashing or slicing through characters!
   */
  _ingestUploadedImageFile(file, jumpDirectlyToStage5Strip = false) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        const rawData = ctx.getImageData(0, 0, img.width, img.height);
        this._processRawUploadedImageData(
          rawData,
          `Uploaded (${img.width}×${img.height})`,
          jumpDirectlyToStage5Strip
        );
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  _processRawUploadedImageData(rawData, originLabel, batchAllToStage5 = false) {
    this.rawUploadedOriginalData = rawData;

    // Auto-detect distinct character segments & normalize each to nativeW:nativeH aspect ratio!
    const detected = detectAndNormalizeCharacters(
      rawData,
      this.bible.nativeW,
      this.bible.nativeH
    );

    this.detectedCharactersHighRes = detected.characterFramesHighRes;
    this.selectedDetectedCharIndex = 0;

    // Stage 4 ALWAYS cleans 1 isolated Base Character at a time (never a squashed multi-character strip)
    this.rawAiImageData = this.detectedCharactersHighRes[0];
    this.isStripLoaded = false;
    this.stripFrameCount = 1;

    const count = this.detectedCharactersHighRes.length;
    this.bridge.sourceOriginLabel =
      count > 1
        ? `${originLabel} → Isolated Base #1/${count}`
        : `${originLabel} → Aspect Normalized`;

    // Auto-sample top-left background color so JPEG magenta (#FE00FE) keys cleanly
    this.cleanup.useTopLeftSample = true;
    const topLeftCheck = document.getElementById("check-chroma-topleft");
    if (topLeftCheck) topLeftCheck.checked = true;

    this._renderDetectedCharSelectorBar();
    this._runStage4Pipeline();
    this._markAllQuestionsAnswered(3);
    this.completedStages.add(3);

    if (batchAllToStage5 && count > 1) {
      this._cleanAndSendAllDetectedCharactersToTimeline();
      this.completedStages.add(4);
      this.switchStage(5);
    } else {
      this.switchStage(4);
    }
  }

  /**
   * Loads the user's uploaded Nano Banana Female Paladin (1024x571) from assets/nano_banana_paladin.jpg,
   * sets matching Stage 1–3 Female Paladin settings, isolates Character #1 as the Master Base Sprite
   * in Stage 4, and makes all 4 detected paladin poses available for Stage 5!
   */
  loadUploadedNanoBananaPaladin() {
    const img = new Image();
    img.onload = () => {
      // Populate the user's Female Paladin prompt fields
      this.bridge.charClass = "Female paladin knight";
      this.bridge.armor = "steel plate cuirass, royal blue cape";
      this.bridge.weapon = "sword and shield";
      this.bridge.material = "crisp 32-bit PS1 tactics sprite style";
      document.getElementById("prompt-class").value = this.bridge.charClass;
      document.getElementById("prompt-armor").value = this.bridge.armor;
      document.getElementById("prompt-weapon").value = this.bridge.weapon;
      document.getElementById("prompt-material").value = this.bridge.material;
      this._compilePrompt();

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const ctx = tempCanvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      const rawData = ctx.getImageData(0, 0, img.width, img.height);

      this._processRawUploadedImageData(
        rawData,
        `Nano Banana Paladin (${img.width}×${img.height})`,
        false
      );
    };
    img.src = "assets/nano_banana_paladin.jpg";
  }

  _renderDetectedCharSelectorBar() {
    const bar = document.getElementById("detected-char-selector-bar");
    const btnContainer = document.getElementById("detected-char-buttons");
    const titleEl = document.getElementById("detected-char-banner-title");
    const descEl = document.getElementById("detected-char-banner-desc");
    const stage5Desc = document.getElementById("stage5-detected-strip-desc");

    const count = this.detectedCharactersHighRes.length;
    if (stage5Desc) {
      stage5Desc.textContent =
        count > 1
          ? `Your uploaded image contains ${count} isolated characters. Click below to batch-clean all ${count} frames through your Stage 4 settings and load them into the Timeline:`
          : "Upload a multi-character image or strip to batch-clean all detected poses into the timeline:";
    }

    if (!bar || !btnContainer) return;

    if (count <= 1) {
      bar.style.display = "none";
      return;
    }

    bar.style.display = "block";
    const origW = this.rawUploadedOriginalData?.width || 1024;
    const origH = this.rawUploadedOriginalData?.height || 571;
    titleEl.textContent = `🔍 Auto-Isolated ${count} Characters from ${origW}×${origH} Image`;
    descEl.innerHTML = `Stage 4 needs <strong>1 Base Character</strong> first. We isolated all ${count} characters and normalized each to your <code>${this.bible.nativeW}×${this.bible.nativeH}</code> aspect ratio. Pick your Base Sprite:`;

    btnContainer.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${i === this.selectedDetectedCharIndex ? "btn-primary" : "btn-secondary"} btn-xs flex-1`;
      btn.textContent = `Char #${i + 1}`;
      btn.addEventListener("click", () => {
        this.selectedDetectedCharIndex = i;
        this.rawAiImageData = this.detectedCharactersHighRes[i];
        this.isStripLoaded = false;
        this.stripFrameCount = 1;
        this.bridge.sourceOriginLabel = `Isolated Base #${i + 1}/${count}`;
        this._renderDetectedCharSelectorBar();
        this._runStage4Pipeline();
      });
      btnContainer.appendChild(btn);
    }
  }

  _cleanAndSendAllDetectedCharactersToTimeline() {
    if (!this.detectedCharactersHighRes || this.detectedCharactersHighRes.length === 0) {
      if (this.pipelineResult?.finalData) {
        this.timeline.frames = [this.pipelineResult.finalData];
        this.timeline.selectedFrameIndex = 0;
        this._refreshTimelineDock();
      }
      return;
    }

    const cleanedFrames = this.detectedCharactersHighRes.map((charHighRes) => {
      const res = runCleanupPipeline(
        charHighRes,
        {
          targetW: this.bible.nativeW,
          targetH: this.bible.nativeH,
          ...this.cleanup
        },
        this.bible.paletteHex
      );
      return res.finalData;
    });

    const grounded = alignFrameBaselines(cleanedFrames, {
      targetBaselineY: this.timeline.baselineY,
      alignHorizontalCenter: this.timeline.alignComX
    });

    this.timeline.frames = grounded.alignedFrames;
    this.timeline.selectedFrameIndex = 0;
    const logEl = document.getElementById("baseline-telemetry-log");
    if (logEl) {
      logEl.textContent = `✓ Batch-cleaned & grounded all ${cleanedFrames.length} isolated characters from uploaded image.`;
    }
    this._refreshTimelineDock();
    this._refreshViewportBuffers();
  }

  async _executeLocalApiBridge() {
    const statusEl = document.getElementById("api-status-readout");
    const url = document.getElementById("input-api-url").value.trim();
    const prompt = this._compilePrompt();

    if (!this.mannequinUpscaledData) {
      this._updateMannequinBuffers();
    }

    const base64Guide = this._imageDataToDataURL(this.mannequinUpscaledData);
    statusEl.textContent = `POSTing conditioning guide (${this.mannequinUpscaledData.width}×${this.mannequinUpscaledData.height}) to ${url}...`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          negative_prompt: "sprite sheet, multiple characters, turnaround, blurry, anti-aliasing, soft gradient, drop shadow, 3d render, photo, watermark",
          init_images: [base64Guide],
          denoising_strength: this.bridge.apiDenoise,
          width: this.mannequinUpscaledData.width,
          height: this.mannequinUpscaledData.height,
          steps: 24,
          cfg_scale: 7.0
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const b64Img = data.images?.[0] || data.image;
      if (b64Img) {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          c.getContext("2d").drawImage(img, 0, 0);
          const rawData = c.getContext("2d").getImageData(0, 0, img.width, img.height);
          this._processRawUploadedImageData(rawData, "Local API Output", false);
          statusEl.textContent = "✓ Received AI generation response!";
        };
        img.src = b64Img.startsWith("data:") ? b64Img : `data:image/png;base64,${b64Img}`;
      } else {
        statusEl.textContent = "⚠️ Response received, but no 'images[0]' base64 field found.";
      }
    } catch (err) {
      statusEl.textContent = `ℹ️ Local server unreachable (${err.message}). Synthesizing solo Base Character from your Stage 1–3 choices instead.`;
      this.loadSyntheticDemoKnight(false);
    }
  }

  // ===========================================================================
  // STAGE 4: DETERMINISTIC PIXEL CLEANUP ENGINE
  // ===========================================================================
  _bindStage4Controls() {
    const chromaColor = document.getElementById("input-chroma-color");
    const chromaHex = document.getElementById("input-chroma-hex");

    chromaColor.addEventListener("input", (e) => {
      const hex = e.target.value.toUpperCase();
      chromaHex.value = hex;
      this.cleanup.chromaKeyHex = hex;
      this._runStage4Pipeline();
    });

    chromaHex.addEventListener("change", (e) => {
      const { r, g, b } = hexToRgb(e.target.value);
      const hex = rgbToHex(r, g, b);
      chromaHex.value = hex;
      chromaColor.value = hex;
      this.cleanup.chromaKeyHex = hex;
      this._runStage4Pipeline();
    });

    document.getElementById("btn-eyedropper-key").addEventListener("click", async (e) => {
      // 1. If browser supports native EyeDropper API (Chrome/Edge/Opera), use screen magnifying loupe
      if (window.EyeDropper) {
        try {
          const eyeDropper = new window.EyeDropper();
          const result = await eyeDropper.open();
          if (result && result.sRGBHex) {
            const hex = result.sRGBHex.toUpperCase();
            this.cleanup.chromaKeyHex = hex;
            this.cleanup.useTopLeftSample = false;
            chromaHex.value = hex;
            chromaColor.value = hex;
            document.getElementById("check-chroma-topleft").checked = false;
            this._runStage4Pipeline();
            return;
          }
        } catch (err) {
          if (err.name === "AbortError" || err.message?.includes("abort")) return;
        }
      }

      // 2. In-canvas fallback toggle
      const next = !this.viewport.eyedropperActive;
      this.viewport.setEyedropper(next);
      e.currentTarget.classList.toggle("active", next);
    });

    document.getElementById("check-chroma-contiguous")?.addEventListener("change", (e) => {
      this.cleanup.contiguousFill = e.target.checked;
      this._runStage4Pipeline();
    });

    document.getElementById("check-chroma-topleft").addEventListener("change", (e) => {
      this.cleanup.useTopLeftSample = e.target.checked;
      this._runStage4Pipeline();
    });

    document.getElementById("slider-chroma-tolerance").addEventListener("input", (e) => {
      this.cleanup.chromaTolerance = Number(e.target.value);
      document.getElementById("val-chroma-tolerance").textContent = String(this.cleanup.chromaTolerance);
      this._runStage4Pipeline();
    });

    document.getElementById("slider-despill-strength")?.addEventListener("input", (e) => {
      this.cleanup.despillStrength = Number(e.target.value);
      document.getElementById("val-despill-strength").textContent = `${this.cleanup.despillStrength}%`;
      this._runStage4Pipeline();
    });

    document.getElementById("seg-edge-shave")?.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#seg-edge-shave button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.cleanup.edgeHaloShave = Number(btn.dataset.shave);
        document.getElementById("val-edge-shave").textContent = `${this.cleanup.edgeHaloShave}px`;
        this._runStage4Pipeline();
      });
    });

    document.getElementById("select-downscale-mode").addEventListener("change", (e) => {
      this.cleanup.downscaleMode = e.target.value;
      this._runStage4Pipeline();
    });

    document.getElementById("check-enable-quantize").addEventListener("change", (e) => {
      this.cleanup.enableQuantize = e.target.checked;
      this._runStage4Pipeline();
    });

    // Stage 4 Question 3: Suggested Image Palette Controls
    document.getElementById("select-suggested-pal-count")?.addEventListener("change", (e) => {
      this.suggestedPalCount = Number(e.target.value) || 16;
      this._updateStage4PaletteSuggestion();
    });

    document.getElementById("btn-apply-suggested-palette")?.addEventListener("click", (e) => {
      if (!this.suggestedImagePaletteHex || this.suggestedImagePaletteHex.length === 0) {
        this._updateStage4PaletteSuggestion();
      }
      if (this.suggestedImagePaletteHex.length >= 2) {
        this.bible.paletteHex = [...this.suggestedImagePaletteHex];
        this.bible.paletteKey = "extracted_image";
        this.cleanup.enableQuantize = true;
        document.getElementById("check-enable-quantize").checked = true;
        e.currentTarget.closest(".wizard-question-card")?.classList.add("answered");
        this._saveBibleToStorage();
        this._renderPaletteSwatches();
        this._compilePrompt();
        this._runStage4Pipeline();
      }
    });

    document.getElementById("btn-merge-suggested-palette")?.addEventListener("click", () => {
      if (!this.suggestedImagePaletteHex || this.suggestedImagePaletteHex.length === 0) {
        this._updateStage4PaletteSuggestion();
      }
      let added = 0;
      for (const hex of this.suggestedImagePaletteHex) {
        if (!this.bible.paletteHex.includes(hex)) {
          this.bible.paletteHex.push(hex);
          added++;
        }
      }
      if (added > 0) {
        this.bible.paletteKey = "custom_merged";
        this._saveBibleToStorage();
        this._renderPaletteSwatches();
        this._compilePrompt();
        this._runStage4Pipeline();
      }
    });

    document.getElementById("btn-revert-stage1-palette")?.addEventListener("click", () => {
      const presetKey = document.getElementById("select-palette-preset")?.value || "fantasy16";
      if (BUILTIN_PALETTES[presetKey]) {
        this.bible.paletteKey = presetKey;
        this.bible.paletteHex = [...BUILTIN_PALETTES[presetKey].colors];
        this._saveBibleToStorage();
        this._renderPaletteSwatches();
        this._compilePrompt();
        this._runStage4Pipeline();
      }
    });

    document.getElementById("check-strip-orphans").addEventListener("change", (e) => {
      this.cleanup.stripOrphans = e.target.checked;
      this._runStage4Pipeline();
    });

    document.getElementById("check-fill-pinholes").addEventListener("change", (e) => {
      this.cleanup.fillPinholes = e.target.checked;
      this._runStage4Pipeline();
    });

    document.getElementById("select-outline-mode").addEventListener("change", (e) => {
      this.cleanup.outlineMode = e.target.value;
      this._runStage4Pipeline();
    });

    const outColor = document.getElementById("input-outline-color");
    const outHex = document.getElementById("input-outline-hex");
    outColor.addEventListener("input", (e) => {
      const hex = e.target.value.toUpperCase();
      outHex.value = hex;
      this.cleanup.solidOutlineHex = hex;
      this._runStage4Pipeline();
    });
    outHex.addEventListener("change", (e) => {
      const { r, g, b } = hexToRgb(e.target.value);
      const hex = rgbToHex(r, g, b);
      outHex.value = hex;
      outColor.value = hex;
      this.cleanup.solidOutlineHex = hex;
      this._runStage4Pipeline();
    });

    document.getElementById("btn-send-to-timeline").addEventListener("click", () => {
      if (!this.pipelineResult?.finalData) return;
      if (this.detectedCharactersHighRes.length > 1) {
        // Clean all detected characters using the locked Stage 4 rules so Stage 5 has the full set ready
        this._cleanAndSendAllDetectedCharactersToTimeline();
      } else if (this.isStripLoaded && this.stripFrameCount > 1) {
        const sliced = sliceHorizontalStrip(this.pipelineResult.finalData, this.stripFrameCount);
        this.timeline.frames = sliced;
        this.timeline.selectedFrameIndex = 0;
      } else {
        // Lock the single Base Character and generate a 4-frame Paper-Doll idle loop to start Stage 5
        this._runPaperDollModularSlicer();
      }
      this._markAllQuestionsAnswered(4);
      this.completedStages.add(4);
      this._compilePrompt();
      this._refreshTimelineDock();
      this.switchStage(5);
    });
  }

  _runStage4Pipeline() {
    if (!this.rawAiImageData) return;

    // If we have rawUploadedOriginalData and native resolution changed in Stage 1, re-normalize character aspect ratio!
    if (
      this.rawUploadedOriginalData &&
      this.detectedCharactersHighRes.length > 0 &&
      !this.isStripLoaded
    ) {
      const expectedRatio = this.bible.nativeW / this.bible.nativeH;
      const curRatio = this.rawAiImageData.width / Math.max(1, this.rawAiImageData.height);
      if (Math.abs(expectedRatio - curRatio) > 0.02) {
        const reDetected = detectAndNormalizeCharacters(
          this.rawUploadedOriginalData,
          this.bible.nativeW,
          this.bible.nativeH
        );
        this.detectedCharactersHighRes = reDetected.characterFramesHighRes;
        this.selectedDetectedCharIndex = Math.min(
          this.selectedDetectedCharIndex,
          this.detectedCharactersHighRes.length - 1
        );
        this.rawAiImageData = this.detectedCharactersHighRes[this.selectedDetectedCharIndex];
      }
    }

    const targetW = this.bible.nativeW * (this.isStripLoaded ? this.stripFrameCount : 1);
    const targetH = this.bible.nativeH;

    this.pipelineResult = runCleanupPipeline(
      this.rawAiImageData,
      {
        targetW,
        targetH,
        ...this.cleanup
      },
      this.bible.paletteHex
    );

    if (this.cleanup.useTopLeftSample && this.pipelineResult.keyRgb) {
      const sampledHex = rgbToHex(
        this.pipelineResult.keyRgb.r,
        this.pipelineResult.keyRgb.g,
        this.pipelineResult.keyRgb.b
      );
      this.cleanup.chromaKeyHex = sampledHex;
      document.getElementById("input-chroma-color").value = sampledHex;
      document.getElementById("input-chroma-hex").value = sampledHex;
    }

    this._updateStage4PaletteSuggestion();
    this._refreshViewportBuffers();
    this._updateWizardSummaryBadges();
  }

  /**
   * Extracts a suggested N-color palette from the current sprite's chroma-keyed,
   * center-sampled pixels (before quantization) and renders both the Suggested
   * Image Palette and Active Quantization Palette in Stage 4 Question 3.
   */
  _updateStage4PaletteSuggestion() {
    const sugGrid = document.getElementById("stage4-suggested-palette-grid");
    const actGrid = document.getElementById("stage4-active-palette-grid");
    const statusEl = document.getElementById("stage4-active-palette-status");
    const applyBtn = document.getElementById("btn-apply-suggested-palette");

    const sourceBuffer = this.pipelineResult?.downscaledData || this.pipelineResult?.keyedData;
    if (sourceBuffer) {
      this.suggestedImagePaletteHex = extractDominantSpritePalette(
        sourceBuffer,
        this.suggestedPalCount || 16,
        this.cleanup.chromaKeyHex
      );
    }

    if (sugGrid) {
      sugGrid.innerHTML = "";
      this.suggestedImagePaletteHex.forEach((hex, idx) => {
        const swatch = document.createElement("div");
        swatch.className = "palette-swatch-item";
        swatch.style.backgroundColor = hex;
        swatch.title = `Suggested Image Swatch #${idx + 1}: ${hex} (Click to add to active palette)`;
        swatch.addEventListener("click", () => {
          if (!this.bible.paletteHex.includes(hex)) {
            this.bible.paletteHex.push(hex);
            this._saveBibleToStorage();
            this._renderPaletteSwatches();
            this._runStage4Pipeline();
          }
        });
        sugGrid.appendChild(swatch);
      });
    }

    if (actGrid) {
      actGrid.innerHTML = "";
      this.bible.paletteHex.forEach((hex, idx) => {
        const swatch = document.createElement("div");
        swatch.className = "palette-swatch-item";
        swatch.style.backgroundColor = hex;
        swatch.title = `Active Swatch #${idx + 1}: ${hex}`;
        actGrid.appendChild(swatch);
      });
    }

    if (statusEl) {
      const sourceLabel =
        this.bible.paletteKey === "extracted_image"
          ? "Image-Matched Palette"
          : this.bible.paletteKey === "custom_merged"
          ? "Merged Custom Palette"
          : BUILTIN_PALETTES[this.bible.paletteKey]?.name?.split(" (")[0] || "Stage 1 Master Palette";
      statusEl.textContent = `Active: ${sourceLabel} (${this.bible.paletteHex.length} Colors)`;
    }

    if (applyBtn) {
      const isAlreadyApplied = this.bible.paletteKey === "extracted_image";
      applyBtn.textContent = isAlreadyApplied
        ? `✓ Using Image Palette (${this.suggestedImagePaletteHex.length} Colors)`
        : `✨ Use Image Palette (Retain Look)`;
    }
  }

  _refreshViewportBuffers() {
    if (this.activeStage === 1) {
      const blankPreview = this._buildStage1BlankCanvasPreview();
      document.getElementById("right-pane-title").textContent = "STAGE 1 TARGET GRID PREVIEW";
      document.getElementById("right-pane-dims").textContent = `${blankPreview.width}×${blankPreview.height}`;
      this.viewport.setRightImage(blankPreview, null);
      if (this.mannequinUpscaledData) {
        this.viewport.setLeftImage(this.mannequinUpscaledData);
      }
      return;
    }

    if (this.activeStage === 2) {
      if (this.mannequinUpscaledData) {
        document.getElementById("left-pane-title").textContent = "COLOR-ID MANNEQUIN RIG";
        document.getElementById("left-pane-dims").textContent =
          `${this.mannequinUpscaledData.width}×${this.mannequinUpscaledData.height}`;
        this.viewport.setLeftImage(this.mannequinUpscaledData);
      }
      if (this.cannyEdgeData) {
        document.getElementById("right-pane-title").textContent = "SOBEL CANNY EDGE GUIDE";
        document.getElementById("right-pane-dims").textContent =
          `${this.cannyEdgeData.width}×${this.cannyEdgeData.height}`;
        this.viewport.setRightImage(this.cannyEdgeData, null);
      }
      return;
    }

    if (this.activeStage === 3) {
      if (this.mannequinUpscaledData) {
        document.getElementById("left-pane-title").textContent = "STAGE 2 CONDITIONING GUIDE";
        document.getElementById("left-pane-dims").textContent =
          `${this.mannequinUpscaledData.width}×${this.mannequinUpscaledData.height}`;
        this.viewport.setLeftImage(this.mannequinUpscaledData);
      }
      if (this.rawAiImageData) {
        document.getElementById("right-pane-title").textContent = "ISOLATED BASE CHARACTER (#FF00FF)";
        document.getElementById("right-pane-dims").textContent =
          `${this.rawAiImageData.width}×${this.rawAiImageData.height}`;
        this.viewport.setRightImage(this.rawAiImageData, null);
      }
      return;
    }

    let leftData = this.rawAiImageData;
    let leftLabel =
      this.detectedCharactersHighRes.length > 1
        ? `ISOLATED BASE CHAR #${this.selectedDetectedCharIndex + 1}/${this.detectedCharactersHighRes.length}`
        : "RAW HIGH-RES BASE INPUT (#FF00FF)";

    if ((this.activeStage === 5 || this.activeStage === 6) && this.timeline.compositeAiGuideSheet) {
      leftData = this.timeline.compositeAiGuideSheet;
      leftLabel = `AI IDENTITY + 4-POSE REFERENCE SHEET (${this.timeline.actionKey.toUpperCase()})`;
    } else if (this.leftBufferMode === "mannequin" && this.mannequinUpscaledData) {
      leftData = this.mannequinUpscaledData;
      leftLabel = "COLOR-ID MANNEQUIN";
    } else if (this.leftBufferMode === "canny" && this.cannyEdgeData) {
      leftData = this.cannyEdgeData;
      leftLabel = "SOBEL CANNY EDGE";
    } else if (this.leftBufferMode === "keyed" && this.pipelineResult?.keyedData) {
      leftData = this.pipelineResult.keyedData;
      leftLabel = "CHROMA-KEYED BINARY ALPHA";
    }

    if (leftData) {
      document.getElementById("left-pane-title").textContent = leftLabel;
      document.getElementById("left-pane-dims").textContent = `${leftData.width}×${leftData.height}`;
      this.viewport.setLeftImage(leftData);
    }

    const rightData =
      (this.activeStage === 5 || this.activeStage === 6) &&
      this.timeline.frames[this.timeline.selectedFrameIndex]
        ? this.timeline.frames[this.timeline.selectedFrameIndex]
        : this.pipelineResult?.finalData;

    if (rightData) {
      document.getElementById("right-pane-title").textContent =
        this.activeStage === 5 || this.activeStage === 6
          ? "ACTIVE TIMELINE FRAME"
          : "CLEANED NATIVE BASE SPRITE";
      document.getElementById("right-pane-dims").textContent = `${rightData.width}×${rightData.height}`;

      const prevIdx =
        this.timeline.frames.length > 0
          ? (this.timeline.selectedFrameIndex - 1 + this.timeline.frames.length) %
            this.timeline.frames.length
          : -1;
      const onionFrame = prevIdx >= 0 ? this.timeline.frames[prevIdx] : null;
      this.viewport.setRightImage(rightData, onionFrame);
    }
  }

  // ===========================================================================
  // STAGE 5: STATIC SPRITE -> FULL AI & PROCEDURAL ANIMATION STUDIO
  // ===========================================================================
  _bindStage5Controls() {
    // Question 5.1: Animation Action Preset Selector
    document.getElementById("select-anim-action-preset")?.addEventListener("change", (e) => {
      const key = e.target.value;
      const action = ANIMATION_ACTION_LIBRARY[key] || ANIMATION_ACTION_LIBRARY.walk;
      this.timeline.actionKey = key;
      this.timeline.fps = action.defaultFps;
      this.timeline.animTag = action.tag;

      if (key === "custom") {
        const body = document.getElementById("custom-strip-sequencer-body");
        const toggleBtn = document.getElementById("btn-toggle-strip-builder");
        if (body) body.style.display = "block";
        if (toggleBtn) toggleBtn.textContent = "🛠️ Close Sequencer";
        this._renderCustomStripTrack();
        this._syncCustomFrameSlidersFromActiveFrame();
      }

      const fpsSlider = document.getElementById("slider-anim-fps");
      if (fpsSlider) fpsSlider.value = String(action.defaultFps);
      const fpsVal = document.getElementById("val-anim-fps");
      if (fpsVal) fpsVal.textContent = `${action.defaultFps} FPS`;

      const tagInput = document.getElementById("input-anim-tag");
      if (tagInput) tagInput.value = action.tag;
      const clipLbl = document.getElementById("lbl-current-clip-tag");
      if (clipLbl) clipLbl.textContent = action.tag;

      this._startAnimationLoop();
      this._compilePrompt();
      this._runPaperDollModularSlicer();
    });

    document.getElementById("input-custom-action-desc")?.addEventListener("input", (e) => {
      this.timeline.customActionDesc = e.target.value;
      this._compilePrompt();
    });

    // Custom Strip Sequencer Toggle & Frame Controls
    document.getElementById("btn-toggle-strip-builder")?.addEventListener("click", () => {
      const body = document.getElementById("custom-strip-sequencer-body");
      const btn = document.getElementById("btn-toggle-strip-builder");
      if (!body) return;
      const isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "block";
      if (btn) btn.textContent = isOpen ? "🛠️ Open Sequencer" : "🛠️ Close Sequencer";
      if (!isOpen) {
        this._renderCustomStripTrack();
        this._syncCustomFrameSlidersFromActiveFrame();
      }
    });

    document.getElementById("btn-add-strip-frame")?.addEventListener("click", () => {
      if (this.customStripFrames.length >= 8) return;
      const last = this.customStripFrames[this.customStripFrames.length - 1] || POSE_PRESETS.idle;
      this.customStripFrames.push({ ...last, name: `Custom Frame #${this.customStripFrames.length + 1}` });
      this.customStripActiveIndex = this.customStripFrames.length - 1;
      this._renderCustomStripTrack();
      this._syncCustomFrameSlidersFromActiveFrame();
      if (this.timeline.actionKey === "custom") {
        this._compilePrompt();
        this._runPaperDollModularSlicer();
      }
    });

    document.getElementById("btn-dup-strip-frame")?.addEventListener("click", () => {
      if (this.customStripFrames.length >= 8) return;
      const cur = this.customStripFrames[this.customStripActiveIndex] || POSE_PRESETS.idle;
      this.customStripFrames.splice(this.customStripActiveIndex + 1, 0, { ...cur });
      this.customStripActiveIndex++;
      this._renderCustomStripTrack();
      this._syncCustomFrameSlidersFromActiveFrame();
      if (this.timeline.actionKey === "custom") {
        this._compilePrompt();
        this._runPaperDollModularSlicer();
      }
    });

    document.getElementById("btn-del-strip-frame")?.addEventListener("click", () => {
      if (this.customStripFrames.length <= 2) return;
      this.customStripFrames.splice(this.customStripActiveIndex, 1);
      this.customStripActiveIndex = Math.max(0, Math.min(this.customStripActiveIndex, this.customStripFrames.length - 1));
      this._renderCustomStripTrack();
      this._syncCustomFrameSlidersFromActiveFrame();
      if (this.timeline.actionKey === "custom") {
        this._compilePrompt();
        this._runPaperDollModularSlicer();
      }
    });

    document.getElementById("select-frame-preset-picker")?.addEventListener("change", (e) => {
      const key = e.target.value;
      if (!key) return;
      const preset = POSE_PRESETS[key] || this.customPoses[key];
      if (preset) {
        this.customStripFrames[this.customStripActiveIndex] = { ...preset };
        this._renderCustomStripTrack();
        this._syncCustomFrameSlidersFromActiveFrame();
        if (this.timeline.actionKey === "custom") {
          this._compilePrompt();
          this._runPaperDollModularSlicer();
        }
      }
    });

    // Sculpting Sliders for Custom Frame
    const cframeSliderIds = [
      "slider-cframe-head", "slider-cframe-torso",
      "slider-cframe-farm", "slider-cframe-felbow",
      "slider-cframe-barm", "slider-cframe-belbow",
      "slider-cframe-fleg", "slider-cframe-fknee",
      "slider-cframe-bleg", "slider-cframe-bknee",
      "slider-cframe-weapon", "slider-cframe-bob"
    ];
    cframeSliderIds.forEach((id) => {
      document.getElementById(id)?.addEventListener("input", () => {
        this._syncActiveFrameFromSliders();
      });
    });

    document.getElementById("btn-save-custom-frame-preset")?.addEventListener("click", () => {
      const nameInput = document.getElementById("input-save-custom-frame-name");
      const name = (nameInput?.value || "").trim() || `Sculpted Pose #${Object.keys(this.customPoses).length + 1}`;
      const id = "custom_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const curPose = this.customStripFrames[this.customStripActiveIndex];
      if (curPose) {
        this._saveCustomPose(id, { ...curPose, name });
        if (nameInput) nameInput.value = "";
        const titleEl = document.getElementById("custom-frame-sculpt-title");
        if (titleEl) titleEl.textContent = `✓ Saved as "${name}"!`;
        setTimeout(() => {
          this._syncCustomFrameSlidersFromActiveFrame();
        }, 2000);
      }
    });

    document.getElementById("btn-apply-custom-strip-timeline")?.addEventListener("click", () => {
      this.timeline.actionKey = "custom";
      const sel = document.getElementById("select-anim-action-preset");
      if (sel) sel.value = "custom";
      this._compilePrompt();
      this._runPaperDollModularSlicer();
    });

    document.getElementById("btn-synth-custom-sprite-animation")?.addEventListener("click", () => {
      this._synthesizeCustomSpriteAnimation();
    });

    // Question 5.1: Pose Guide Rig Style Selector (Mannequin vs. Paper-Doll Cutout)
    document.getElementById("select-pose-guide-mode")?.addEventListener("change", (e) => {
      this.timeline.poseGuideMode = e.target.value;
      const btn = document.getElementById("btn-paper-doll-animate");
      if (btn) {
        btn.textContent =
          e.target.value === "paperdoll"
            ? "🎭 Articulate Static Sprite (Cutout Rig)"
            : "✨ Generate 4-Frame Mannequin Pose Strip";
      }
      this._runPaperDollModularSlicer();
    });

    // Question 5.2: AI Animation Prompt Mode (Full Strip vs. Single Keyframe 1..4)
    document.getElementById("select-ai-anim-prompt-mode")?.addEventListener("change", (e) => {
      this.timeline.aiPromptMode = e.target.value;
      this._compilePrompt();
      this._updateWizardSummaryBadges();
    });

    // Download Composite AI Identity + 4-Pose Reference Sheet (.PNG)
    document.getElementById("btn-dl-ai-composite-guide")?.addEventListener("click", () => {
      if (!this.timeline.compositeAiGuideSheet) {
        this._runPaperDollModularSlicer();
      }
      if (this.timeline.compositeAiGuideSheet) {
        this._downloadImageDataAsPng(
          this.timeline.compositeAiGuideSheet,
          `pixelforge_ai_reference_${this.timeline.actionKey}_sheet.png`
        );
      }
    });

    // Stage 5 Option B: Batch-clean all detected characters from an uploaded multi-character image
    document.getElementById("btn-clean-all-detected-frames")?.addEventListener("click", () => {
      if (this.detectedCharactersHighRes.length > 0) {
        this._cleanAndSendAllDetectedCharactersToTimeline();
      } else {
        this.loadUploadedNanoBananaPaladin();
        setTimeout(() => {
          this._cleanAndSendAllDetectedCharactersToTimeline();
          this.switchStage(5);
        }, 250);
      }
    });

    document.getElementById("btn-download-base-ref")?.addEventListener("click", () => {
      const baseData = this.pipelineResult?.finalData;
      if (!baseData) return;
      const upscaledRef = upscaleNearestNeighbor(baseData, Math.max(4, Math.floor(512 / baseData.width)));
      this._downloadImageDataAsPng(
        upscaledRef,
        `pixelforge_locked_base_character_${upscaledRef.width}x${upscaledRef.height}.png`
      );
    });

    document.getElementById("btn-preview-strip-guide")?.addEventListener("click", () => {
      const action = ANIMATION_ACTION_LIBRARY[this.timeline.actionKey] || ANIMATION_ACTION_LIBRARY.walk;
      const selectedPoses = action.mannequinPoses || ["walk1", "walk2", "walk3", "walk4"];
      const stripNative = buildMultiPoseMannequinStrip(
        this.bible.nativeW,
        this.bible.nativeH,
        this.mannequin,
        selectedPoses
      );
      const stripUpscaled = upscaleNearestNeighbor(stripNative, 4);
      this._downloadImageDataAsPng(
        stripUpscaled,
        `pixelforge_mannequin_${this.timeline.actionKey}_strip_${stripUpscaled.width}x${stripUpscaled.height}.png`
      );
    });

    document.getElementById("btn-copy-stage5-prompt")?.addEventListener("click", () => {
      const box = document.getElementById("stage5-anim-prompt-output");
      if (box) navigator.clipboard?.writeText(box.value);
      const btn = document.getElementById("btn-copy-stage5-prompt");
      if (btn) {
        btn.textContent = "✓ Copied";
        setTimeout(() => {
          btn.textContent = "📋 Copy Prompt";
        }, 1400);
      }
    });

    // Upload AI Multi-Character Strip in Stage 5
    document.getElementById("input-upload-stage5-strip")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) this._ingestUploadedImageFile(file, true);
    });

    // Append a Single AI Keyframe Image in Stage 5 (for users generating keyframes 1 by 1)
    document.getElementById("input-upload-single-keyframe")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = img.width;
          tempCanvas.height = img.height;
          const ctx = tempCanvas.getContext("2d");
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0);
          const rawData = ctx.getImageData(0, 0, img.width, img.height);

          const detected = detectAndNormalizeCharacters(
            rawData,
            this.bible.nativeW,
            this.bible.nativeH
          );
          const cleanedKeyframes = detected.characterFramesHighRes.map((charHighRes) => {
            const res = runCleanupPipeline(
              charHighRes,
              {
                targetW: this.bible.nativeW,
                targetH: this.bible.nativeH,
                ...this.cleanup
              },
              this.bible.paletteHex
            );
            return res.finalData;
          });
          const grounded = alignFrameBaselines(cleanedKeyframes, {
            targetBaselineY: this.timeline.baselineY,
            alignHorizontalCenter: this.timeline.alignComX
          });
          this.timeline.frames.push(...grounded.alignedFrames);
          this.timeline.selectedFrameIndex = this.timeline.frames.length - 1;
          this._refreshTimelineDock();
          this._refreshViewportBuffers();
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });

    document.getElementById("btn-generate-synth-strip")?.addEventListener("click", () => {
      this.loadSyntheticDemoStrip(true);
    });

    document.getElementById("btn-slice-current-strip")?.addEventListener("click", () => {
      if (!this.pipelineResult?.finalData) return;
      const count = Number(document.getElementById("input-slice-count").value) || 4;
      const frames = sliceHorizontalStrip(this.pipelineResult.finalData, count);
      this.timeline.frames = frames;
      this.timeline.selectedFrameIndex = 0;
      this._refreshTimelineDock();
    });

    document.getElementById("btn-paper-doll-animate")?.addEventListener("click", () => {
      this._runPaperDollModularSlicer();
    });
  }

  // ===========================================================================
  // STAGE 6: TIMELINE GROUNDING & MASTER SPRITE SHEET EXPORTER
  // ===========================================================================
  _bindStage6Controls() {
    // Question 6.1: Ground Foot-Baseline & Per-Frame Nudge
    document.getElementById("slider-baseline-y")?.addEventListener("input", (e) => {
      this.timeline.baselineY = Number(e.target.value);
      this.viewport.baselineY = this.timeline.baselineY;
      const valEl = document.getElementById("val-baseline-y");
      if (valEl) valEl.textContent = `${this.timeline.baselineY} px`;
      this.viewport.applyTransforms();
      this._updatePackedSheetPreview();
      this._updateWizardSummaryBadges();
    });

    document.getElementById("check-align-com-x")?.addEventListener("change", (e) => {
      this.timeline.alignComX = e.target.checked;
    });

    const groundAllHandler = () => {
      if (this.timeline.frames.length === 0) return;
      const result = alignFrameBaselines(this.timeline.frames, {
        targetBaselineY: this.timeline.baselineY,
        alignHorizontalCenter: this.timeline.alignComX
      });
      this.timeline.frames = result.alignedFrames;

      const summary = result.telemetry
        .map((t) => `F${t.frameIndex + 1}: dY=${t.appliedDy >= 0 ? "+" : ""}${t.appliedDy}px → Y=${t.newBaselineY}`)
        .join(" | ");
      const logEl = document.getElementById("baseline-telemetry-log");
      if (logEl) logEl.textContent = `✓ Grounded: ${summary}`;

      this._refreshTimelineDock();
      this._refreshViewportBuffers();
      this._updatePackedSheetPreview();
    };

    document.getElementById("btn-align-baselines")?.addEventListener("click", groundAllHandler);
    document.getElementById("btn-quick-ground-dock")?.addEventListener("click", groundAllHandler);

    // 1px Per-Frame Nudge Controls in Question 6.1
    const nudgeActiveFrame = (dx, dy) => {
      const idx = this.timeline.selectedFrameIndex;
      const cur = this.timeline.frames[idx];
      if (!cur) return;
      this.timeline.frames[idx] = translateImageData(cur, dx, dy);
      this._refreshTimelineDock();
      this._refreshViewportBuffers();
      this._updatePackedSheetPreview();
    };
    document.getElementById("btn-nudge-left")?.addEventListener("click", () => nudgeActiveFrame(-1, 0));
    document.getElementById("btn-nudge-right")?.addEventListener("click", () => nudgeActiveFrame(1, 0));
    document.getElementById("btn-nudge-up")?.addEventListener("click", () => nudgeActiveFrame(0, -1));
    document.getElementById("btn-nudge-down")?.addEventListener("click", () => nudgeActiveFrame(0, 1));

    // Question 6.2: Multi-Action Clip Library & Master Export
    document.getElementById("btn-save-clip-to-library")?.addEventListener("click", () => {
      if (this.timeline.frames.length === 0) return;
      const tag = (this.timeline.animTag || this.timeline.actionKey || "clip").trim();
      const clonedFrames = this.timeline.frames.map(
        (f) => new ImageData(new Uint8ClampedArray(f.data), f.width, f.height)
      );
      const existingIdx = this.timeline.savedClips.findIndex((c) => c.tag === tag);
      if (existingIdx >= 0) {
        this.timeline.savedClips[existingIdx] = { tag, frames: clonedFrames, fps: this.timeline.fps };
      } else {
        this.timeline.savedClips.push({ tag, frames: clonedFrames, fps: this.timeline.fps });
      }
      this._renderSavedClipsSummary();
      this._updatePackedSheetPreview();
      this._updateWizardSummaryBadges();
    });

    document.getElementById("btn-clear-clip-library")?.addEventListener("click", () => {
      this.timeline.savedClips = [];
      this._renderSavedClipsSummary();
      this._updatePackedSheetPreview();
      this._updateWizardSummaryBadges();
    });

    const updateSheetConfig = () => {
      this.timeline.sheetCols = Math.max(1, Number(document.getElementById("input-sheet-cols")?.value) || 4);
      this.timeline.sheetPad = Math.max(0, Number(document.getElementById("input-sheet-pad")?.value) || 0);
      this.timeline.animTag = document.getElementById("input-anim-tag")?.value.trim() || "walk";
      const clipLbl = document.getElementById("lbl-current-clip-tag");
      if (clipLbl) clipLbl.textContent = this.timeline.animTag;
      this._updatePackedSheetPreview();
      this._updateWizardSummaryBadges();
    };

    document.getElementById("input-sheet-cols")?.addEventListener("input", updateSheetConfig);
    document.getElementById("input-sheet-pad")?.addEventListener("input", updateSheetConfig);
    document.getElementById("input-anim-tag")?.addEventListener("input", updateSheetConfig);

    const downloadSheetPng = () => {
      if (!this.packedSheetResult?.sheetImageData) return;
      this.completedStages.add(6);
      this._markAllQuestionsAnswered(6);
      this._downloadImageDataAsPng(
        this.packedSheetResult.sheetImageData,
        `${this.timeline.animTag}_spritesheet.png`
      );
    };

    document.getElementById("btn-export-sheet-png")?.addEventListener("click", downloadSheetPng);
    document.getElementById("btn-dock-download-sheet")?.addEventListener("click", downloadSheetPng);

    document.getElementById("btn-export-atlas-json")?.addEventListener("click", () => {
      const jsonText = document.getElementById("atlas-json-preview")?.value || "";
      this.completedStages.add(6);
      this._markAllQuestionsAnswered(6);
      this._downloadTextFile(`${this.timeline.animTag}_atlas.json`, jsonText, "application/json");
    });

    // Timeline Dock Playback & Frame Manager Controls
    document.getElementById("btn-anim-play")?.addEventListener("click", (e) => {
      this.timeline.isPlaying = !this.timeline.isPlaying;
      e.currentTarget.textContent = this.timeline.isPlaying ? "⏸ Pause" : "▶ Play";
    });

    document.getElementById("select-anim-loop")?.addEventListener("change", (e) => {
      this.timeline.loopMode = e.target.value;
      this._updatePackedSheetPreview();
    });

    document.getElementById("slider-anim-fps")?.addEventListener("input", (e) => {
      this.timeline.fps = Number(e.target.value);
      const valEl = document.getElementById("val-anim-fps");
      if (valEl) valEl.textContent = `${this.timeline.fps} FPS`;
      this._startAnimationLoop();
      this._updatePackedSheetPreview();
    });

    document.getElementById("check-onion-skin")?.addEventListener("change", (e) => {
      this.timeline.onionSkin = e.target.checked;
      this.viewport.onionSkinEnabled = this.timeline.onionSkin;
      this._refreshViewportBuffers();
    });

    document.getElementById("btn-add-current-frame")?.addEventListener("click", () => {
      if (!this.pipelineResult?.finalData) return;
      if (!this.isStripLoaded) {
        this.timeline.frames.push(this.pipelineResult.finalData);
      } else {
        const sliced = sliceHorizontalStrip(this.pipelineResult.finalData, this.stripFrameCount);
        this.timeline.frames.push(...sliced);
      }
      this.timeline.selectedFrameIndex = this.timeline.frames.length - 1;
      this._refreshTimelineDock();
      this._updatePackedSheetPreview();
    });

    document.getElementById("btn-duplicate-frame")?.addEventListener("click", () => {
      const cur = this.timeline.frames[this.timeline.selectedFrameIndex];
      if (!cur) return;
      const copy = new ImageData(new Uint8ClampedArray(cur.data), cur.width, cur.height);
      this.timeline.frames.splice(this.timeline.selectedFrameIndex + 1, 0, copy);
      this.timeline.selectedFrameIndex++;
      this._refreshTimelineDock();
      this._updatePackedSheetPreview();
    });

    document.getElementById("btn-delete-frame")?.addEventListener("click", () => {
      if (this.timeline.frames.length <= 1) return;
      this.timeline.frames.splice(this.timeline.selectedFrameIndex, 1);
      this.timeline.selectedFrameIndex = Math.max(
        0,
        Math.min(this.timeline.frames.length - 1, this.timeline.selectedFrameIndex)
      );
      this._refreshTimelineDock();
      this._updatePackedSheetPreview();
    });
  }

  _renderSavedClipsSummary() {
    const box = document.getElementById("saved-clips-summary");
    if (!box) return;
    if (!this.timeline.savedClips || this.timeline.savedClips.length === 0) {
      box.textContent = "No multi-clips saved yet — exporting current timeline strip.";
      return;
    }
    const totalFrames = this.timeline.savedClips.reduce((acc, c) => acc + c.frames.length, 0);
    const listStr = this.timeline.savedClips.map((c) => `${c.tag} (${c.frames.length}f)`).join(" • ");
    box.innerHTML = `<strong>Saved Master Sheet (${totalFrames} total frames):</strong> ${listStr}`;
  }

  /**
   * Generates the 4-frame animation pose guide strip and Composite AI Reference Sheet.
   * By default, renders the clean, 2-segment articulated Color-ID Mannequin poses (with
   * knee bends, elbow bends, directional armor, and ground alignment) so AI generators
   * have an unambiguous pose conditioning target without broken floating raster pixels.
   */
  _runPaperDollModularSlicer() {
    let baseSprite = this.pipelineResult?.finalData;
    if (!baseSprite) return;
    if (this.isStripLoaded && this.stripFrameCount > 1) {
      baseSprite = sliceHorizontalStrip(baseSprite, this.stripFrameCount)[0];
    }

    const actionKey = this.timeline.actionKey || "walk";
    const action = ANIMATION_ACTION_LIBRARY[actionKey] || ANIMATION_ACTION_LIBRARY.walk;
    const poseKeys =
      actionKey === "custom" && this.customStripFrames && this.customStripFrames.length > 0
        ? this.customStripFrames
        : action.mannequinPoses || ["walk1", "walk2", "walk3", "walk4"];
    const mode = this.timeline.poseGuideMode || "mannequin";

    let targetFrames = [];

    if (mode === "paperdoll") {
      // Experimental raster sprite modular slicer
      const maskData = renderMannequinImageData(
        baseSprite.width,
        baseSprite.height,
        this.mannequin
      );
      const { frames } = generateArticulatedActionFrames(
        baseSprite,
        maskData,
        actionKey
      );
      const grounded = alignFrameBaselines(frames, {
        targetBaselineY: this.timeline.baselineY,
        alignHorizontalCenter: this.timeline.alignComX
      });
      targetFrames = grounded.alignedFrames;
    } else {
      // Clean Articulated Color-ID Mannequin keyframes (with knee/elbow kinematics)
      targetFrames = poseKeys.map((poseKey) => {
        const preset =
          typeof poseKey === "object" && poseKey !== null
            ? poseKey
            : POSE_PRESETS[poseKey] || POSE_PRESETS.idle;
        return renderMannequinImageData(baseSprite.width, baseSprite.height, {
          ...this.mannequin,
          ...preset,
          transparentBg: true
        });
      });
    }

    this.timeline.frames = targetFrames;
    this.timeline.selectedFrameIndex = 0;

    // Build Composite AI Identity (Slot 0) + Pose Guide (Slots 1..N) for Left Canvas & AI Download
    const scaleFactor = Math.max(2, Math.min(6, Math.floor(256 / Math.max(1, baseSprite.height))));
    this.timeline.compositeAiGuideSheet = buildCompositeAiAnimationReferenceSheet(
      baseSprite,
      targetFrames,
      scaleFactor
    );

    const logEl = document.getElementById("baseline-telemetry-log");
    if (logEl) {
      logEl.textContent =
        mode === "paperdoll"
          ? `✓ Sliced & articulated "${action.name}" (${targetFrames.length} frames) alongside Base Character.`
          : `✓ Generated ${targetFrames.length} Articulated Mannequin Poses for "${action.name}" alongside Base Character.`;
    }
    this._refreshTimelineDock();
    this._refreshViewportBuffers();
  }

  // ===========================================================================
  // CUSTOM MANNEQUIN STRIP SEQUENCER & SAMPLE SPRITE ANIMATION GENERATOR
  // ===========================================================================
  _renderCustomStripTrack() {
    const track = document.getElementById("custom-strip-track");
    if (!track) return;
    track.innerHTML = "";
    document.getElementById("custom-strip-frame-count").textContent = String(this.customStripFrames.length);

    this.customStripFrames.forEach((framePose, idx) => {
      const card = document.createElement("div");
      card.className = `custom-strip-card${idx === this.customStripActiveIndex ? " active" : ""}`;

      const title = document.createElement("div");
      title.className = "custom-strip-card-title";
      title.textContent = `#${idx + 1}: ${framePose.name ? framePose.name.split(" (")[0] : "Pose"}`;
      card.appendChild(title);

      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;

      const imgData = renderMannequinImageData(64, 64, {
        ...this.mannequin,
        ...framePose,
        transparentBg: false
      });
      ctx.putImageData(imgData, 0, 0);
      card.appendChild(canvas);

      // Mini select for frame pose preset
      const sel = document.createElement("select");
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "Preset...";
      sel.appendChild(emptyOpt);

      Object.entries(POSE_PRESETS).forEach(([k, p]) => {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = p.name ? p.name.split(" (")[0] : k;
        sel.appendChild(opt);
      });
      Object.entries(this.customPoses || {}).forEach(([k, p]) => {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = `⭐ ${p.name ? p.name.split(" (")[0] : k}`;
        sel.appendChild(opt);
      });

      sel.addEventListener("click", (e) => e.stopPropagation());
      sel.addEventListener("change", (e) => {
        const key = e.target.value;
        if (!key) return;
        const preset = POSE_PRESETS[key] || this.customPoses[key];
        if (preset) {
          this.customStripFrames[idx] = { ...preset };
          this.customStripActiveIndex = idx;
          this._renderCustomStripTrack();
          this._syncCustomFrameSlidersFromActiveFrame();
          if (this.timeline.actionKey === "custom") {
            this._compilePrompt();
            this._runPaperDollModularSlicer();
          }
        }
      });
      card.appendChild(sel);

      card.addEventListener("click", () => {
        this.customStripActiveIndex = idx;
        this._renderCustomStripTrack();
        this._syncCustomFrameSlidersFromActiveFrame();
      });

      track.appendChild(card);
    });
  }

  _syncCustomFrameSlidersFromActiveFrame() {
    const framePose = this.customStripFrames[this.customStripActiveIndex];
    if (!framePose) return;

    const titleEl = document.getElementById("custom-frame-sculpt-title");
    if (titleEl) {
      titleEl.textContent = `Sculpt Pose for Frame #${this.customStripActiveIndex + 1} (${framePose.name ? framePose.name.split(" (")[0] : "Custom"})`;
    }

    const setS = (sId, vId, val, unit = "°") => {
      const s = document.getElementById(sId);
      const v = document.getElementById(vId);
      if (s) s.value = String(val ?? 0);
      if (v) v.textContent = `${val ?? 0}${unit}`;
    };

    setS("slider-cframe-head", "val-cframe-head", framePose.headTilt);
    setS("slider-cframe-torso", "val-cframe-torso", framePose.torsoLean);
    setS("slider-cframe-farm", "val-cframe-farm", framePose.frontArmAngle);
    setS("slider-cframe-felbow", "val-cframe-felbow", framePose.frontElbowBend ?? 55);
    setS("slider-cframe-barm", "val-cframe-barm", framePose.backArmAngle);
    setS("slider-cframe-belbow", "val-cframe-belbow", framePose.backElbowBend ?? 45);
    setS("slider-cframe-fleg", "val-cframe-fleg", framePose.frontLegAngle);
    setS("slider-cframe-fknee", "val-cframe-fknee", framePose.frontKneeBend ?? 12);
    setS("slider-cframe-bleg", "val-cframe-bleg", framePose.backLegAngle);
    setS("slider-cframe-bknee", "val-cframe-bknee", framePose.backKneeBend ?? 16);
    setS("slider-cframe-weapon", "val-cframe-weapon", framePose.weaponAngle);
    setS("slider-cframe-bob", "val-cframe-bob", framePose.bobOffset || 0, " px");
  }

  _syncActiveFrameFromSliders() {
    const framePose = this.customStripFrames[this.customStripActiveIndex];
    if (!framePose) return;

    const getS = (sId, vId, unit = "°") => {
      const s = document.getElementById(sId);
      const val = Number(s?.value || 0);
      const v = document.getElementById(vId);
      if (v) v.textContent = `${val}${unit}`;
      return val;
    };

    framePose.headTilt = getS("slider-cframe-head", "val-cframe-head");
    framePose.torsoLean = getS("slider-cframe-torso", "val-cframe-torso");
    framePose.frontArmAngle = getS("slider-cframe-farm", "val-cframe-farm");
    framePose.frontElbowBend = getS("slider-cframe-felbow", "val-cframe-felbow");
    framePose.backArmAngle = getS("slider-cframe-barm", "val-cframe-barm");
    framePose.backElbowBend = getS("slider-cframe-belbow", "val-cframe-belbow");
    framePose.frontLegAngle = getS("slider-cframe-fleg", "val-cframe-fleg");
    framePose.frontKneeBend = getS("slider-cframe-fknee", "val-cframe-fknee");
    framePose.backLegAngle = getS("slider-cframe-bleg", "val-cframe-bleg");
    framePose.backKneeBend = getS("slider-cframe-bknee", "val-cframe-bknee");
    framePose.weaponAngle = getS("slider-cframe-weapon", "val-cframe-weapon");
    framePose.bobOffset = getS("slider-cframe-bob", "val-cframe-bob", " px");

    // Live update thumbnail of active frame card
    const track = document.getElementById("custom-strip-track");
    const activeCard = track?.children[this.customStripActiveIndex];
    if (activeCard) {
      const canvas = activeCard.querySelector("canvas");
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        const img = renderMannequinImageData(64, 64, {
          ...this.mannequin,
          ...framePose,
          transparentBg: false
        });
        ctx.putImageData(img, 0, 0);
      }
    }

    if (this.timeline.actionKey === "custom") {
      this._runPaperDollModularSlicer();
    }
  }

  _synthesizeCustomSpriteAnimation() {
    if (!this.customStripFrames || this.customStripFrames.length === 0) return;

    this.isStripLoaded = true;
    this.stripFrameCount = this.customStripFrames.length;
    this.bridge.sourceOriginLabel = `Custom ${this.stripFrameCount}-Frame Synth Strip`;
    document.getElementById("input-slice-count").value = String(this.stripFrameCount);

    this.rawAiImageData = generateSyntheticAIStrip(
      this.bible.nativeW,
      this.bible.nativeH,
      this.bible.upscaleFactor,
      {
        ...this.mannequin,
        ...this.bridge,
        paletteHex: this.bible.paletteHex
      },
      this.customStripFrames
    );

    this._runStage4Pipeline();

    if (this.pipelineResult?.finalData) {
      const rawFrames = sliceHorizontalStrip(this.pipelineResult.finalData, this.stripFrameCount);
      const aligned = alignFrameBaselines(rawFrames, {
        targetBaselineY: this.timeline.baselineY,
        alignHorizontalCenter: this.timeline.alignComX
      });
      this.timeline.frames = aligned.alignedFrames;
      this.timeline.selectedFrameIndex = 0;
      this.timeline.actionKey = "custom";
      this.timeline.animTag = "custom";

      const scaleFactor = Math.max(2, Math.min(6, Math.floor(256 / Math.max(1, aligned.alignedFrames[0].height))));
      this.timeline.compositeAiGuideSheet = buildCompositeAiAnimationReferenceSheet(
        aligned.alignedFrames[0],
        aligned.alignedFrames,
        scaleFactor
      );

      const logEl = document.getElementById("baseline-telemetry-log");
      if (logEl) {
        logEl.textContent = `✓ Synthesized & cleaned ${this.stripFrameCount}-frame pixel art sample sprite animation from your custom mannequin poses!`;
      }
      this._refreshTimelineDock();
      this._refreshViewportBuffers();
      this._updateWizardSummaryBadges();
    }
  }

  // ===========================================================================
  // SYNTHETIC GENERATORS (USING ALL STAGE 1, STAGE 2, AND STAGE 3 CHOICES)
  // ===========================================================================
  loadSyntheticDemoKnight(alsoPopulatePaperDollTimeline = false) {
    this.isStripLoaded = false;
    this.stripFrameCount = 1;
    this.bridge.sourceOriginLabel = "Synthesized from Choices";
    this._updateMannequinBuffers();

    this.rawAiImageData = generateSyntheticAIKnight(
      this.bible.nativeW,
      this.bible.nativeH,
      this.bible.upscaleFactor,
      {
        ...this.mannequin,
        ...this.bridge,
        paletteHex: this.bible.paletteHex
      }
    );

    this._runStage4Pipeline();

    if (alsoPopulatePaperDollTimeline) {
      this._runPaperDollModularSlicer();
    }
    this._updateWizardSummaryBadges();
  }

  loadSyntheticDemoStrip(sliceImmediately = true) {
    const poseKeys = this._getSelectedStripPoses();
    this.isStripLoaded = true;
    this.stripFrameCount = poseKeys.length;
    this.bridge.sourceOriginLabel = `${poseKeys.length}-Frame Strip`;
    document.getElementById("input-slice-count").value = String(poseKeys.length);

    this.rawAiImageData = generateSyntheticAIStrip(
      this.bible.nativeW,
      this.bible.nativeH,
      this.bible.upscaleFactor,
      {
        ...this.mannequin,
        ...this.bridge,
        paletteHex: this.bible.paletteHex
      },
      poseKeys
    );

    const stripMannequinNative = buildMultiPoseMannequinStrip(
      this.bible.nativeW,
      this.bible.nativeH,
      this.mannequin,
      poseKeys
    );
    const effectiveFactor = Math.max(
      1,
      Math.min(this.bible.upscaleFactor, Math.floor(512 / Math.max(this.bible.nativeW, this.bible.nativeH)))
    );
    this.mannequinUpscaledData = upscaleNearestNeighbor(stripMannequinNative, effectiveFactor);
    this.cannyEdgeData = generateSobelEdgeMap(this.mannequinUpscaledData, 40);

    this._runStage4Pipeline();

    if (sliceImmediately && this.pipelineResult?.finalData) {
      const rawFrames = sliceHorizontalStrip(this.pipelineResult.finalData, poseKeys.length);
      const aligned = alignFrameBaselines(rawFrames, {
        targetBaselineY: this.timeline.baselineY,
        alignHorizontalCenter: this.timeline.alignComX
      });
      this.timeline.frames = aligned.alignedFrames;
      this.timeline.selectedFrameIndex = 0;
      this._refreshTimelineDock();
    }
    this._updateWizardSummaryBadges();
  }

  // ===========================================================================
  // TIMELINE RENDERING, PLAYBACK LOOP & PACKED SHEET PREVIEW
  // ===========================================================================
  _refreshTimelineDock() {
    const container = document.getElementById("timeline-frames-container");
    container.innerHTML = "";
    document.getElementById("timeline-frame-count").textContent = String(this.timeline.frames.length);

    this.timeline.frames.forEach((frameData, idx) => {
      const card = document.createElement("div");
      card.className = `timeline-frame-card${idx === this.timeline.selectedFrameIndex ? " active" : ""}`;

      const thumb = document.createElement("canvas");
      thumb.width = frameData.width;
      thumb.height = frameData.height;
      thumb.className = "checkerboard-bg";
      const ctx = thumb.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.putImageData(frameData, 0, 0);

      const metrics = analyzeFrameMetrics(frameData);
      const meta = document.createElement("div");
      meta.className = "frame-card-meta";
      meta.innerHTML = `<span>#${idx + 1}</span><span>Y:${metrics.maxY}</span>`;

      card.appendChild(thumb);
      card.appendChild(meta);

      card.addEventListener("click", () => {
        this.timeline.selectedFrameIndex = idx;
        this._refreshTimelineDock();
        this._drawAnimPreviewFrame(idx);
        this._refreshViewportBuffers();
      });

      container.appendChild(card);
    });

    this._drawAnimPreviewFrame(this.timeline.selectedFrameIndex);
    this._updatePackedSheetPreview();
    this._updateWizardSummaryBadges();
  }

  _startAnimationLoop() {
    if (this.animTimerId) {
      clearInterval(this.animTimerId);
    }
    const intervalMs = Math.round(1000 / Math.max(1, this.timeline.fps));
    this.animTimerId = setInterval(() => {
      if (!this.timeline.isPlaying || this.timeline.frames.length <= 1) return;

      const count = this.timeline.frames.length;
      if (this.timeline.loopMode === "pingpong") {
        let next = this.timeline.selectedFrameIndex + this.timeline.playDirection;
        if (next >= count) {
          this.timeline.playDirection = -1;
          next = Math.max(0, count - 2);
        } else if (next < 0) {
          this.timeline.playDirection = 1;
          next = Math.min(count - 1, 1);
        }
        this.timeline.selectedFrameIndex = next;
      } else {
        this.timeline.selectedFrameIndex = (this.timeline.selectedFrameIndex + 1) % count;
      }

      const cards = document.querySelectorAll(".timeline-frame-card");
      cards.forEach((c, idx) => c.classList.toggle("active", idx === this.timeline.selectedFrameIndex));

      this._drawAnimPreviewFrame(this.timeline.selectedFrameIndex);
      if (this.activeStage === 5 || this.activeStage === 6) {
        this._refreshViewportBuffers();
      }
    }, intervalMs);
  }

  _drawAnimPreviewFrame(frameIdx) {
    const frame = this.timeline.frames[frameIdx];
    if (!frame) return;

    const previewCanvas = document.getElementById("canvas-anim-preview");
    previewCanvas.width = frame.width;
    previewCanvas.height = frame.height;
    const ctx = previewCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, frame.width, frame.height);

    if (this.timeline.onionSkin && this.timeline.frames.length > 1) {
      const prevIdx = (frameIdx - 1 + this.timeline.frames.length) % this.timeline.frames.length;
      const prevFrame = this.timeline.frames[prevIdx];
      if (prevFrame) {
        const tmp = document.createElement("canvas");
        tmp.width = prevFrame.width;
        tmp.height = prevFrame.height;
        tmp.getContext("2d").putImageData(prevFrame, 0, 0);
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.drawImage(tmp, 0, 0);
        ctx.restore();
      }
    }

    const fg = document.createElement("canvas");
    fg.width = frame.width;
    fg.height = frame.height;
    fg.getContext("2d").putImageData(frame, 0, 0);
    ctx.drawImage(fg, 0, 0);
  }

  _updatePackedSheetPreview() {
    const hasSavedClips = Array.isArray(this.timeline.savedClips) && this.timeline.savedClips.length > 0;
    if (this.timeline.frames.length === 0 && !hasSavedClips) return;

    let framesToPack = this.timeline.frames;
    let customFrameTags = null;

    if (hasSavedClips) {
      framesToPack = [];
      customFrameTags = [];
      let cursor = 0;
      this.timeline.savedClips.forEach((clip) => {
        const count = clip.frames.length;
        if (count > 0) {
          framesToPack.push(...clip.frames);
          customFrameTags.push({
            name: clip.tag || clip.key,
            from: cursor,
            to: cursor + count - 1,
            direction: clip.loopMode || "forward",
            fps: clip.fps || this.timeline.fps
          });
          cursor += count;
        }
      });
    }

    this.packedSheetResult = packSpriteSheet(
      framesToPack,
      this.timeline.sheetCols,
      this.timeline.sheetPad,
      this.timeline.baselineY
    );

    const { sheetImageData, sheetWidth, sheetHeight } = this.packedSheetResult;
    document.getElementById("packed-sheet-dims").textContent = `${sheetWidth}×${sheetHeight}`;

    const sheetCanvas = document.getElementById("canvas-sheet-preview");
    sheetCanvas.width = sheetWidth;
    sheetCanvas.height = sheetHeight;
    const ctx = sheetCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.putImageData(sheetImageData, 0, 0);

    const atlasJson = generateSpriteSheetAtlasJson(this.packedSheetResult, {
      imageFilename: hasSavedClips ? `master_character_spritesheet.png` : `${this.timeline.animTag}_spritesheet.png`,
      fps: this.timeline.fps,
      loopMode: this.timeline.loopMode,
      tagName: this.timeline.animTag,
      perspective: this.bible.perspective,
      frameTags: customFrameTags
    });
    document.getElementById("atlas-json-preview").value = atlasJson;
  }

  // ===========================================================================
  // EXPORT HELPERS
  // ===========================================================================
  _imageDataToDataURL(imageData) {
    const c = document.createElement("canvas");
    c.width = imageData.width;
    c.height = imageData.height;
    c.getContext("2d").putImageData(imageData, 0, 0);
    return c.toDataURL("image/png");
  }

  _downloadImageDataAsPng(imageData, filename) {
    const dataUrl = this._imageDataToDataURL(imageData);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  _downloadTextFile(filename, text, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.pixelForgeApp = new PixelForgeApp();
});


})();
