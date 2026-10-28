/**
 * PixelForge Studio — Guided 5-Stage Creation Wizard Controller
 * Walks the user one question at a time through Stages 1–5.
 * Every choice made in Stage 1 (Resolution, Camera, Upscale, Palette),
 * Stage 2 (Facing, Proportions, Pose, Weapon Anchor), and
 * Stage 3 (Character Class, Armor, Weapon, Era, Technical Rules)
 * is dynamically woven into the Compiled Prompt and Procedural Synthesizer.
 */

import {
  BUILTIN_PALETTES,
  hexToRgb,
  rgbToHex,
  parsePaletteFileText,
  formatPaletteExport,
  extractDominantSpritePalette
} from "./palettes.js";

import {
  POSE_PRESETS,
  renderMannequinImageData,
  upscaleNearestNeighbor,
  generateSobelEdgeMap,
  buildMultiPoseMannequinStrip
} from "./mannequin.js";

import {
  generateSyntheticAIKnight,
  generateSyntheticAIStrip
} from "./synthDemo.js";

import { runCleanupPipeline } from "./cleanupEngine.js";

import {
  sliceHorizontalStrip,
  analyzeFrameMetrics,
  translateImageData,
  alignFrameBaselines,
  generatePaperDollIdleFrames,
  packSpriteSheet,
  generateSpriteSheetAtlasJson,
  detectAndNormalizeCharacters,
  ANIMATION_ACTION_LIBRARY,
  generateArticulatedActionFrames,
  buildCompositeAiAnimationReferenceSheet
} from "./animationEngine.js";

import { DualViewportController } from "./viewport.js";

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
