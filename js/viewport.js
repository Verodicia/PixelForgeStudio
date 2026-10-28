/**
 * PixelForge Studio — Interactive Dual-Canvas Viewport Controller
 * Supports synchronized mouse-wheel zoom, middle-click / drag pan,
 * 1px native pixel grid overlay, perspective alignment guides (Isometric 2:1, 3/4 RPG, 2D Side-Scroller),
 * onion skinning, foot-baseline overlay, and chroma-key eyedropper sampling.
 */

import { rgbToHex } from "./palettes.js";

export class DualViewportController {
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
