/**
 * PixelForge Studio — Master Color Palettes & Perceptual Color Math (CIELAB)
 */

export const BUILTIN_PALETTES = {
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
export function hexToRgb(hex) {
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
export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v) => clamp(v).toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert sRGB [0..255] to CIE L*a*b* (D65 illuminant)
 * Used for perceptual palette quantization and selective outlining.
 */
export function rgbToLab(r, g, b) {
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
export function deltaE(lab1, lab2) {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Precompute RGB + CIELAB lookup table for a hex palette array
 */
export function buildPaletteLookup(hexArray) {
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
export function parsePaletteFileText(text) {
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
export function formatPaletteExport(hexArray, format = "hex") {
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
export function extractDominantSpritePalette(imageData, targetCount = 16, keyHex = null) {
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
