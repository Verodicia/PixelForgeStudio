/**
 * PixelForge Studio — Stage 2: Base Mannequin & Pose Blockout Generator
 * Renders a crisp, zero-AA Color-ID parametric mannequin onto native resolution ImageData,
 * supports Nearest-Neighbor upscaling to target AI resolution, Sobel Edge/Canny Map generation,
 * and multi-frame horizontal conditioning strip stitching.
 */

import { hexToRgb } from "./palettes.js";

export const MANNEQUIN_COLORS = {
  HEAD: "#FF5555",       // Red
  TORSO: "#55FF55",      // Green
  FRONT_ARM: "#5555FF",  // Blue
  BACK_ARM: "#FFFF55",   // Yellow
  FRONT_LEG: "#FF55FF",  // Magenta-Pink
  BACK_LEG: "#55FFFF",   // Cyan
  WEAPON: "#FFFFFF",     // White
  BG: "#000000"          // Black conditioning background
};

export const POSE_PRESETS = {
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
export function renderMannequinImageData(width, height, params = {}) {
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
export function upscaleNearestNeighbor(srcImageData, factor) {
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
export function generateSobelEdgeMap(srcImageData, threshold = 40) {
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
export function buildMultiPoseMannequinStrip(nativeW, nativeH, baseParams, poseKeys) {
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
