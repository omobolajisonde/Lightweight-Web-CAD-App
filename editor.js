// editor.js
import { CONFIG, STYLES, applyStyleToObject } from "./config.js";
import { initEvents } from "./events.js";
import { initSheetLayout } from "./sheetLayout.js";
import { drawGrid } from "./grid.js";
import { getZoomMagnitude as getZoomMag } from "./viewMath.js";
import { SnappingEngine } from "./snapping.js";
import { KeyReferenceManager } from "./gridlines.js";
import { rotateViewClockwiseAnimated } from "./rotation.js";

import { createTools } from "./toolsIndex.js";

const fabric = globalThis.fabric;

function setToolbarActiveTool(toolId) {
  const ids = ["select", "line", "polyline", "circle", "arc", "filledRegion"];
  ids.forEach((id) => {
    const b = document.getElementById(`btn-${id}`);
    if (!b) return;
    if (id === toolId) b.classList.add("active");
    else b.classList.remove("active");
  });
}

export class Editor {
  constructor(canvasId = "c") {
    this.CONFIG = CONFIG;
    this.STYLES = STYLES;

    this.canvasId = canvasId;

    this.canvas = new fabric.Canvas(canvasId, {
      backgroundColor: "#444",
      selection: false,
      preserveObjectStacking: true,
      renderOnAddRemove: false
    });

    // ✅ Global default cursor: crosshair from app start
    this.canvas.defaultCursor = "crosshair";
    this.canvas.hoverCursor = "crosshair";
    this.canvas.moveCursor = "crosshair";
    this.canvas.setCursor("crosshair");

    this.canvas.subTargetCheck = true;
    this.canvas.targetFindTolerance = 8;
    this.canvas.perPixelTargetFind = true;
    this.canvas.skipOffscreen = false;

    this.paperEdgePad = this.mmToPx(6);

    this.A3_L = { w: 420, h: 297 };
    this.A4_L = { w: 297, h: 210 };

    this.currentScale = 100;
    this.isWireframe = true;

    this.showGrid = true;
    this.showKeyRefs = true;

    this.activeToolId = "select";
    this.activeStyleType = "detail_line";
    this.activeViewId = "plan";

    // ---------------------------------------------
    // ✅ Plan Levels state
    // ---------------------------------------------
    this.planLevels = {
      primary: "L0",
      overlay: null,
      levels: ["L0", "L1", "L2", "L3", "L4"]
    };

    this.sheetGuides = [];
    this.sheetGrids = [];
    this.sheetLabels = [];
    this.sheets = {};

    this.tools = {};
    this.snapper = null;
    this.keyRefs = null;

    this._hasInit = false;

    // ✅ Rotation-safe zoom readout
    this.currentZoom = 1;

    this.isSpaceDown = false;

    // View rotation (camera) in degrees.
    this.viewRotationDeg = 0;
    this.viewRotationDegNorm = 0;

    // Guards
    this.__isNormalizingSelection = false;

    this.resizeToWindow();
    window.addEventListener("resize", () => {
      this.resizeToWindow();
      this.scheduleFit();
    });

    this.initWhenReady();
  }

  initWhenReady() {
    if (this._hasInit) return;

    const wrapper = document.getElementById("canvas-wrapper");
    const w = wrapper ? wrapper.clientWidth : 0;
    const h = wrapper ? wrapper.clientHeight : 0;

    if (!fabric) {
      console.error("Fabric.js did not load");
      return;
    }

    if (!wrapper || !w || !h || w < 50 || h < 50) {
      requestAnimationFrame(() => this.initWhenReady());
      return;
    }

    this.resizeToWindow();
    this.init();
  }

  scheduleFit() {
    requestAnimationFrame(() => {
      this.fitToSheets(this.activeViewId || "plan");
      requestAnimationFrame(() => {
        this.fitToSheets(this.activeViewId || "plan");
      });
    });
  }

  init() {
    if (this._hasInit) return;
    this._hasInit = true;

    initSheetLayout(this);

    this.snapper = new SnappingEngine(this);

    // single source of truth for tools
    this.tools = createTools(this);

    this.keyRefs = new KeyReferenceManager(this);

    // keep grid handles synchronised
    this.canvas.on("object:moving", (opt) => {
      const t = opt && opt.target ? opt.target : null;
      if (!t) return;

      if (this.keyRefs && typeof this.keyRefs.onObjectMoving === "function") {
        this.keyRefs.onObjectMoving(t);
      }
    });

    this.drawGrid();
    this.setKeyReferencesEnabled(true);

    initEvents(this);

    // ✅ show only active view linework (now plan-level aware)
    this.applyViewFilter(this.activeViewId);
    this.fitToSheets("plan");
    this.scheduleFit();

    this.setMode("select");
    this.canvas.requestRenderAll();
  }

  resizeToWindow() {
    const wrapper = document.getElementById("canvas-wrapper");

    const fallbackW = Math.max(300, window.innerWidth - 240);
    const fallbackH = Math.max(300, window.innerHeight);

    const w = wrapper && wrapper.clientWidth ? wrapper.clientWidth : fallbackW;
    const h = wrapper && wrapper.clientHeight ? wrapper.clientHeight : fallbackH;

    this.canvas.setWidth(w);
    this.canvas.setHeight(h);

    try {
      this.canvas.calcOffset();
    } catch (err) {}

    this.canvas.requestRenderAll();
  }

  mmToPx(mm) {
    return mm * this.CONFIG.DPI_RATIO;
  }

  pxToMm(px) {
    return px / this.CONFIG.DPI_RATIO;
  }

  getZoomMagnitude() {
    return getZoomMag(this.canvas);
  }

  refreshCurrentZoom() {
    const z = this.getZoomMagnitude();
    this.currentZoom = isFinite(z) && z > 0 ? z : 1;
    return this.currentZoom;
  }

  drawGrid() {
    drawGrid(this);
  }

  rotateView() {
    rotateViewClockwiseAnimated(this);
  }

  applyCameraRotationImmediate(deg, opts = {}) {
    const canvas = this.canvas;
    if (!canvas) return;

    const pivot = this.sheets?.plan?.centre ? this.sheets.plan.centre : { x: 0, y: 0 };

    const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];

    const pivotScreen = fabric.util.transformPoint(new fabric.Point(pivot.x, pivot.y), vpt);

    const theta = (deg * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    const T1 = [1, 0, 0, 1, pivotScreen.x, pivotScreen.y];
    const R = [cos, sin, -sin, cos, 0, 0];
    const T2 = [1, 0, 0, 1, -pivotScreen.x, -pivotScreen.y];

    const TR = fabric.util.multiplyTransformMatrices(T1, R);
    const TRT = fabric.util.multiplyTransformMatrices(TR, T2);

    const next = fabric.util.multiplyTransformMatrices(TRT, vpt);

    canvas.setViewportTransform(next);

    if (opts && opts.skipRebuild) return;

    this.refreshCurrentZoom();

    if (this.showGrid) this.drawGrid();
    if (this.keyRefs && typeof this.keyRefs.reorderLayers === "function") {
      this.keyRefs.reorderLayers();
    }

    canvas.requestRenderAll();
  }

  normalizeLineInWorld(line) {
    if (!line) return;

    try {
      const lp = typeof line.calcLinePoints === "function" ? line.calcLinePoints() : null;
      const m = typeof line.calcTransformMatrix === "function" ? line.calcTransformMatrix() : null;
      if (!lp || !m) return;

      const p1 = fabric.util.transformPoint(new fabric.Point(lp.x1, lp.y1), m);
      const p2 = fabric.util.transformPoint(new fabric.Point(lp.x2, lp.y2), m);

      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;

      const x1 = p1.x - cx;
      const y1 = p1.y - cy;
      const x2 = p2.x - cx;
      const y2 = p2.y - cy;

      line.set({
        originX: "center",
        originY: "center",
        left: cx,
        top: cy,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        flipX: false,
        flipY: false,
        x1,
        y1,
        x2,
        y2,
        strokeUniform: true,
        objectCaching: false
      });

      line.setCoords();
      line.dirty = true;
    } catch (err) {}
  }

  normalizeOriginToCenter(obj) {
    if (!obj) return;

    try {
      const center = obj.getCenterPoint ? obj.getCenterPoint() : null;
      if (!center) return;

      if (obj.originX === "center" && obj.originY === "center") return;

      obj.set({ originX: "center", originY: "center" });
      if (typeof obj.setPositionByOrigin === "function") {
        obj.setPositionByOrigin(center, "center", "center");
      } else {
        obj.set({ left: center.x, top: center.y });
      }

      obj.objectCaching = false;
      obj.setCoords();
      obj.dirty = true;
    } catch (err) {}
  }

  fixSelectionJump() {
    if (this.__isNormalizingSelection) return;

    const canvas = this.canvas;
    if (!canvas) return;

    const active = canvas.getActiveObject();
    if (!active) return;

    this.__isNormalizingSelection = true;

    try {
      const normalizeOne = (obj) => {
        if (!obj) return;
        if (this.isGuideObject(obj)) return;
        if (obj.isToolPreview === true) return;
        if (obj.isEndpointMarker === true) return;

        if (obj.type === "line" || obj.constructor?.name === "Line") {
          this.normalizeLineInWorld(obj);
          return;
        }

        this.normalizeOriginToCenter(obj);
      };

      if (active.type === "activeSelection" && typeof active.getObjects === "function") {
        active.getObjects().forEach(normalizeOne);
        try {
          active.setCoords();
        } catch (err) {}
        canvas.requestRenderAll();
        return;
      }

      normalizeOne(active);
      canvas.requestRenderAll();
    } finally {
      this.__isNormalizingSelection = false;
    }
  }

  setMode(toolId) {
    const next = this.tools && this.tools[toolId] ? this.tools[toolId] : null;
    if (!next) return;
    if (toolId === this.activeToolId) return;

    const prevId = this.activeToolId;
    const prev = this.tools && this.tools[prevId] ? this.tools[prevId] : null;

    if (prev && typeof prev.onDeactivate === "function") {
      prev.onDeactivate();
    }

    this.activeToolId = toolId;

    if (next && typeof next.onActivate === "function") {
      next.onActivate();
    }

    setToolbarActiveTool(toolId);

    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  setActiveView(viewId) {
    if (!viewId || !this.sheets || !this.sheets[viewId]) return;

    const currentTool =
      this.tools && this.tools[this.activeToolId] ? this.tools[this.activeToolId] : null;
    if (currentTool && typeof currentTool.cancel === "function") {
      currentTool.cancel();
    }

    this.activeViewId = viewId;

    const readout = document.getElementById("active-view-readout");
    if (readout) {
      const nice = String(viewId).charAt(0).toUpperCase() + String(viewId).slice(1);
      readout.innerHTML = `Active view is ${nice}<br />Tip click a paper sheet to activate it`;
    }

    this.applyViewFilter(viewId);
  }

  // ---------------------------------------------
  // Plan Levels helpers
  // ---------------------------------------------
  getPlanLevelsState() {
    const pl = this.planLevels || {};
    return {
      primary: typeof pl.primary === "string" && pl.primary ? pl.primary : "L0",
      overlay: typeof pl.overlay === "string" && pl.overlay ? pl.overlay : null,
      levels: Array.isArray(pl.levels) && pl.levels.length ? pl.levels.slice() : ["L0"]
    };
  }

  setPlanLevelsList(levelIds) {
    if (!Array.isArray(levelIds) || !levelIds.length) return;
    const cleaned = levelIds
      .map((v) => String(v || "").trim())
      .filter((v) => v.length);
    if (!cleaned.length) return;

    const pl = this.getPlanLevelsState();
    pl.levels = cleaned;

    if (!cleaned.includes(pl.primary)) pl.primary = cleaned[0];
    if (pl.overlay && !cleaned.includes(pl.overlay)) pl.overlay = null;

    this.planLevels = pl;

    // Phase 3: reflect immediately if currently in plan view
    if (this.activeViewId === "plan") this.applyViewFilter("plan");
  }

  setPrimaryPlanLevel(levelId) {
    const id = String(levelId || "").trim();
    if (!id) return;

    const pl = this.getPlanLevelsState();
    if (!pl.levels.includes(id)) pl.levels.push(id);
    pl.primary = id;

    if (pl.overlay === id) pl.overlay = null;

    this.planLevels = pl;

    // Phase 3: reflect immediately if currently in plan view
    if (this.activeViewId === "plan") this.applyViewFilter("plan");
  }

  setOverlayPlanLevel(levelIdOrNull) {
    const raw = levelIdOrNull == null ? null : String(levelIdOrNull).trim();
    const id = raw && raw.length ? raw : null;

    const pl = this.getPlanLevelsState();

    if (!id) {
      pl.overlay = null;
      this.planLevels = pl;
      if (this.activeViewId === "plan") this.applyViewFilter("plan");
      return;
    }

    if (!pl.levels.includes(id)) pl.levels.push(id);

    pl.overlay = id === pl.primary ? null : id;

    this.planLevels = pl;

    // Phase 3: reflect immediately if currently in plan view
    if (this.activeViewId === "plan") this.applyViewFilter("plan");
  }

  isGuideObject(obj) {
    if (!obj) return true;

    return (
      obj.isPaper === true ||
      obj.isPaperShadow === true ||
      obj.isGridLine === true ||
      obj.isPaperGrid === true ||
      obj.isSheetGuide === true ||
      obj.isSheetLabel === true ||
      obj.isInnerA4Frame === true ||
      obj.isKeyReference === true ||
      obj.isKeyReferenceHandle === true ||
      obj.isReferenceDashedLine === true ||
      obj.isToolPreview === true ||
      obj.isEndpointMarker === true
    );
  }

  inferSheetIdForObject(obj) {
    if (!obj || !this.sheets) return null;

    if (obj.isEndpointMarker === true && obj.parentLine && obj.parentLine.sheetId) {
      return obj.parentLine.sheetId;
    }

    let cx = null;
    let cy = null;

    try {
      if (typeof obj.getCenterPoint === "function") {
        const p = obj.getCenterPoint();
        cx = p.x;
        cy = p.y;
      } else if (typeof obj.left === "number" && typeof obj.top === "number") {
        cx = obj.left;
        cy = obj.top;
      } else {
        const r = obj.getBoundingRect(false, true);
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
      }
    } catch (err) {
      if (typeof obj.left === "number" && typeof obj.top === "number") {
        cx = obj.left;
        cy = obj.top;
      }
    }

    if (cx == null || cy == null) return null;

    const ids = Object.keys(this.sheets);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const inner = this.sheets[id]?.innerA4;
      if (!inner) continue;

      if (cx >= inner.left && cx <= inner.right && cy >= inner.top && cy <= inner.bottom) {
        return id;
      }
    }

    return null;
  }

  ensureObjectSheetId(obj) {
    if (!obj || this.isGuideObject(obj)) return null;

    if (typeof obj.sheetId === "string" && obj.sheetId.length) return obj.sheetId;

    const inferred = this.inferSheetIdForObject(obj);
    if (!inferred) return null;

    obj.sheetId = inferred;
    return inferred;
  }

  // ---------------------------------------------
  // ✅ Phase 3: Plan-level aware view filtering
  // ---------------------------------------------
  applyViewFilter(viewId = this.activeViewId || "plan") {
    const canvas = this.canvas;
    if (!canvas) return;

    const objs = canvas.getObjects() || [];
    const active = canvas.getActiveObject();

    // Plan-level filtering is only applied when plan is active.
    const planState = viewId === "plan" ? this.getPlanLevelsState() : null;
    const primaryId = planState ? planState.primary : null;
    const overlayId = planState ? planState.overlay : null;

    objs.forEach((obj) => {
      if (!obj) return;

      if (this.isGuideObject(obj)) {
        obj.visible = true;
        return;
      }

      const sid =
        typeof obj.sheetId === "string" && obj.sheetId
          ? obj.sheetId
          : this.inferSheetIdForObject(obj);

      // Base rule: if object belongs to a sheet, show only if it matches active view.
      const baseShow = !sid ? true : sid === viewId;

      if (!baseShow) {
        obj.visible = false;
        obj.evented = false;
        obj.selectable = false;
        obj.opacity = 1;
        try { obj.setCoords(); } catch (err) {}
        return;
      }

      // Non-plan views: keep existing behavior.
      if (viewId !== "plan") {
        obj.visible = true;
        obj.evented = true;
        obj.selectable = true;
        obj.opacity = 1;
        return;
      }

      // Plan view: apply level logic ONLY to plan objects.
      // If sid is null (global objects), treat as normal (visible, editable).
      if (sid !== "plan") {
        obj.visible = true;
        obj.evented = true;
        obj.selectable = true;
        obj.opacity = 1;
        return;
      }

      // Legacy plan objects without a levelId behave like primary.
      const lvl = typeof obj.levelId === "string" && obj.levelId ? obj.levelId : null;

      const isPrimary = !lvl || lvl === primaryId;
      const isOverlay = !!overlayId && lvl === overlayId;

      if (isPrimary) {
        obj.visible = true;
        obj.opacity = 1;
        obj.evented = true;
        obj.selectable = true;
      
        // Phase 5: primary is NOT a special snap-only reference
        obj.isOverlayReference = false;
      
        return;
      }
      
      if (isOverlay) {
        obj.visible = true;
        obj.opacity = 0.5;
      
        // Read-only overlay (cannot be selected/edited)
        obj.evented = false;
        obj.selectable = false;
      
        // Phase 5: BUT it should still be snappable
        obj.isOverlayReference = true;
      
        return;
      }
      

      // Any other plan level: hidden
      obj.visible = false;
      obj.opacity = 1;
      obj.evented = false;
      obj.selectable = false;
      try { obj.setCoords(); } catch (err) {}
    });

    if (active && active.visible === false) {
      canvas.discardActiveObject();
    }

    canvas.requestRenderAll();
  }

  objectIsNonStylable(obj) {
    if (!obj) return true;

    if (obj.isPaper === true) return true;
    if (obj.isPaperShadow === true) return true;
    if (obj.isSheetGuide === true) return true;
    if (obj.isInnerA4Frame === true) return true;
    if (obj.isSheetLabel === true) return true;

    if (obj.isGrid === true) return true;
    if (obj.isGridLine === true) return true;
    if (obj.isPaperGrid === true) return true;

    if (obj.isKeyReference === true) return true;
    if (obj.isKeyReferenceHandle === true) return true;
    if (obj.isReferenceDashedLine === true) return true;

    if (obj.isToolPreview === true) return true;
    if (obj.isEndpointMarker === true) return true;

    return false;
  }

  updateSelectionStyles() {
    const active = this.canvas.getActiveObject();
    if (!active) return;

    const applyTo = (obj) => {
      if (!obj) return;
      if (this.objectIsNonStylable(obj)) return;

      obj.__styleKey = this.activeStyleType;

      applyStyleToObject(obj, this.activeStyleType, this.currentScale, this.isWireframe);

      obj.objectCaching = false;
      obj.dirty = true;
    };

    if (active.type === "activeSelection") {
      active.getObjects().forEach(applyTo);
    } else {
      applyTo(active);
    }

    this.canvas.requestRenderAll();
  }

  setKeyReferencesEnabled(enabled) {
    this.showKeyRefs = !!enabled;

    if (!this.keyRefs) return;

    if (typeof this.keyRefs.setEnabled === "function") {
      this.keyRefs.setEnabled(this.showKeyRefs);
      return;
    }

    if (typeof this.keyRefs.renderAll === "function") {
      this.keyRefs.renderAll();
    }

    this.canvas.requestRenderAll();
  }

  fitToSheets(viewId = "plan") {
    const sheet = this.sheets[viewId];
    if (!sheet) return;

    const canvas = this.canvas;
    if (!canvas.getWidth() || !canvas.getHeight()) return;

    const rot = typeof this.viewRotationDeg === "number" ? this.viewRotationDeg : 0;

    const pad = this.mmToPx(30);
    const w = sheet.wPx + this.paperEdgePad * 2 + pad;
    const h = sheet.hPx + this.paperEdgePad * 2 + pad;

    const scaleX = canvas.getWidth() / w;
    const scaleY = canvas.getHeight() / h;
    const zoom = Math.min(scaleX, scaleY);

    if (!isFinite(zoom) || zoom <= 0) return;

    const cx = sheet.centre.x;
    const cy = sheet.centre.y;

    const vpt = [zoom, 0, 0, zoom, 0, 0];
    vpt[4] = canvas.getWidth() / 2 - cx * zoom;
    vpt[5] = canvas.getHeight() / 2 - cy * zoom;

    canvas.setViewportTransform(vpt);

    if (rot) {
      this.applyCameraRotationImmediate(rot, { skipRebuild: true });
    }

    this.refreshCurrentZoom();

    if (this.showGrid) this.drawGrid();
    if (this.keyRefs && typeof this.keyRefs.reorderLayers === "function") {
      this.keyRefs.reorderLayers();
    }

    canvas.requestRenderAll();
  }

  refreshViewMode() {
    this.canvas.getObjects().forEach((obj) => {
      if (!obj) return;

      const key = obj.__styleKey || obj.styleKey;
      if (!key) return;

      if (this.objectIsNonStylable(obj)) return;

      applyStyleToObject(obj, key, this.currentScale, this.isWireframe);
      obj.objectCaching = false;
      obj.dirty = true;
    });

    this.canvas.requestRenderAll();
  }
}
