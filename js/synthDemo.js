/**
 * PixelForge Studio — Procedural Synthetic AI Sprite Generator
 * Dynamically generates a high-res noisy/blurry AI-style sprite on a chroma-key background
 * that reflects the user's Stage 1 (Resolution, Upscale, Palette), Stage 2 (Proportions,
 * Facing, Pose, Weapon toggle), and Stage 3 (Character Class, Armor, Weapon description).
 */

import { POSE_PRESETS } from "./mannequin.js";
import { hexToRgb } from "./palettes.js";

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
export function synthesizeRawAIFromNative(nativeData, upscaleFactor = 16, seed = 1337) {
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
export function generateSyntheticAIKnight(nativeW = 64, nativeH = 64, upscaleFactor = 16, params = {}) {
  const effectiveFactor = Math.max(1, Math.min(upscaleFactor, Math.floor(1024 / Math.max(nativeW, nativeH))));
  const nativeKnight = renderBaseKnightNative(nativeW, nativeH, params);
  return synthesizeRawAIFromNative(nativeKnight, effectiveFactor, 42);
}

/**
 * Generate multi-frame horizontal strip matching user's Stage 1/2/3 choices
 */
export function generateSyntheticAIStrip(
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
