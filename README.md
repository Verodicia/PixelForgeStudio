# PixelForge Studio ⚔️🎨

An advanced, browser-native 6-stage pixel art sprite conditioning, cleanup, and animation workbench. PixelForge Studio bridges generative AI (Nano Banana / Gemini / ChatGPT / ComfyUI) with classical game-engine pixel art constraints (SNES Tactics Ogre, PS1 Final Fantasy Tactics, GBA Fire Emblem).

---

## 🚀 Features

- **Stage 1 • Technical Bible**:
  - Enforce native pixel grid resolution (e.g. 128×128, 64×64, 32×32) and AI upscale factor (4×–8×).
  - Lock camera perspective (Isometric 30° 2:1, 3/4 Top-Down, 2D Side).
  - Constrain colors to authentic retro palettes (16-Bit Master, Endesga 32, Pico-8, GameBoy, or user image extraction).

- **Stage 2 • Composition & Pose**:
  - Interactive articulated Color-ID mannequin with biomechanical joint controls (head tilt, torso lean, shoulders, elbows, hips, knees, weapon angle).
  - Built-in library of 36+ isometric tactical poses (walk cycles, combat strikes, lunges, dashes, hurt, jump).
  - Real-time generation of Canny Edge / Mannequin conditioning guides for ControlNet & IP-Adapter.

- **Stage 3 • AI Prompt & Ingestion Bridge**:
  - Auto-compiles strict, prompt-engineered directives incorporating native grid, camera angle, sub-pixel cluster constraints, and hex swatches.
  - Multi-character auto-detection and normalization: isolates individual characters from 16:9 widescreen or multi-character strips (like Nano Banana).

- **Stage 4 • Pixel Cleanup & Base Character Lock**:
  - Euclidean RGB / CIELAB chroma-keying with despill correction and edge halo shaving.
  - Inner-50% pixel cluster mode downscaler to eliminate AI mixels.
  - Color snapping to locked palette swatches or extracted image clusters.
  - Clean orphan pixel suppression and SELOUT / solid outline generation.

- **Stage 5 • Mannequin Customizer & Pose Studio**:
  - Multi-frame strip sequencer (up to 8 frames) with per-frame sculpting sliders.
  - Custom pose preset library with local persistence (`💾 Save Pose`).
  - Reference Sheet Generator: packages Slot 0 (Base Character) with Slots 1..N (Articulated Mannequin frames) for AI consistency.
  - One-click synthetic animation generator.

- **Stage 6 • Timeline Grounding & Master Exporter**:
  - Unified foot-baseline grounder: snaps lowest opaque pixels to a fixed horizontal baseline Y and centers horizontal COM.
  - 1px directional per-frame nudge adjustments (← ↑ ↓ →).
  - Multi-action clip library (save clips for `idle`, `walk`, `attack`, etc.).
  - Master Sprite Sheet packer (PNG) and JSON Atlas exporter (Godot, Phaser, Aseprite).

---

## 🛠️ Quick Start

No build tools or external dependencies required! PixelForge Studio runs directly in any modern browser:

```bash
# Clone the repository
git clone https://github.com/Verodicia/PixelForgeStudio.git
cd PixelForgeStudio

# Serve locally
python3 -m http.server 8080

# Open in your browser
open http://localhost:8080
```

---

## 📁 Repository Structure

```
PixelForgeStudio/
├── index.html              # Core single-page studio application
├── css/
│   └── style.css           # Modern dark-mode IDE styling & responsive layouts
├── js/
│   ├── app.js              # Wizard state machine, stages 1–6 controller, events
│   ├── bundle.js           # Single-file bundled distribution
│   ├── mannequin.js        # Articulated 2-segment skeletal mannequin renderer
│   ├── animationEngine.js  # Baseline grounding, strip slicing, sprite sheet packer
│   ├── cleanupEngine.js    # Chroma-key, mixel downscaler, palette quantizer, outline
│   ├── palettes.js         # Authentic retro game palettes & CIELAB distance math
│   ├── synthDemo.js        # Built-in synthetic demo sprites & animation generator
│   └── viewport.js         # Dual-canvas pan/zoom viewport controller
└── assets/                 # Sample reference images & assets
```

---

## 📜 License

MIT License. Free for personal and commercial game development.
