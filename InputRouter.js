// InputRouter.js
const fabric = globalThis.fabric;

function getActiveTool(editor) {
  if (!editor || !editor.tools) return null;
  const id = editor.activeToolId || "select";
  return editor.tools[id] || null;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function getCanvasScreenPointer(editor, ev) {
  const canvas = editor.canvas;
  if (!canvas || !ev) return null;

  // Fabric-normalized pointer (handles retina + CSS scaling + offsets)
  if (typeof canvas.getPointer === "function") {
    const p = canvas.getPointer(ev, true); // viewport/screen canvas coords (ignores viewportTransform)
    return { x: p.x, y: p.y };
  }

  // Fallback
  const rect = canvas.upperCanvasEl.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function screenToWorld(editor, ev) {
  const canvas = editor.canvas;
  const p = getCanvasScreenPointer(editor, ev);
  if (!p) return { x: 0, y: 0 };

  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const inv = fabric.util.invertTransform(vpt);
  const worldPt = fabric.util.transformPoint(new fabric.Point(p.x, p.y), inv);

  return { x: worldPt.x, y: worldPt.y };
}

function setViewportTransform(editor, vpt) {
  editor.canvas.setViewportTransform(vpt);
  editor.refreshCurrentZoom();

  if (editor.showGrid) editor.drawGrid();

  if (editor.keyRefs && typeof editor.keyRefs.reorderLayers === "function") {
    editor.keyRefs.reorderLayers();
  }

  editor.canvas.requestRenderAll();
}

function isRightButton(e) {
  return e && typeof e.button === "number" && e.button === 2;
}

function stopContextMenu(e) {
  if (!e) return;
  e.preventDefault();
  e.stopPropagation();
}

function pickSheetIdFromPointer(opt) {
  if (!opt) return null;

  const candidates = [];
  if (opt.target) candidates.push(opt.target);
  if (Array.isArray(opt.subTargets) && opt.subTargets.length) candidates.push(...opt.subTargets);

  for (let i = 0; i < candidates.length; i++) {
    const t = candidates[i];
    if (!t) continue;

    const sid = typeof t.sheetId === "string" ? t.sheetId : null;
    if (!sid) continue;

    // Only treat sheet furniture as activators
    if (
      t.isPaper === true ||
      t.isPaperShadow === true ||
      t.isSheetGuide === true ||
      t.isSheetLabel === true ||
      t.isInnerA4Frame === true
    ) {
      return sid;
    }
  }

  return null;
}

function restoreToolCursor(editor) {
  const canvas = editor.canvas;

  // ✅ Always crosshair (even in Select mode)
  canvas.defaultCursor = "crosshair";
  canvas.hoverCursor = "crosshair";
  canvas.moveCursor = "crosshair";
  canvas.setCursor("crosshair");
}

// Rotation-safe zoom magnitude from a viewportTransform.
// Under rotation, vpt[0] is cosθ*zoom, so use hypot(a,b).
function getZoomFromVpt(vpt) {
  const a = vpt && vpt.length ? vpt[0] : 1;
  const b = vpt && vpt.length ? vpt[1] : 0;
  const z = Math.hypot(a, b);
  return isFinite(z) && z > 0 ? z : 1;
}

export class InputRouter {
  constructor(editor) {
    this.editor = editor;
    this.canvas = editor.canvas;

    this._bound = false;
    this._wheelLock = false;

    this._lastPointer = { x: 0, y: 0 };

    this._panning = {
      active: false,
      lastClientX: 0,
      lastClientY: 0
    };
  }

  attach() {
    if (this._bound) return;
    this._bound = true;

    this.canvas.on("mouse:down", (opt) => this.onMouseDown(opt));
    this.canvas.on("mouse:move", (opt) => this.onMouseMove(opt));
    this.canvas.on("mouse:up", (opt) => this.onMouseUp(opt));
    this.canvas.on("mouse:wheel", (opt) => this.onMouseWheel(opt));
    this.canvas.on("mouse:dblclick", () => this.onDoubleClick());

    this.canvas.on("selection:created", (opt) => this.onSelectionCreated(opt));
    this.canvas.on("selection:updated", (opt) => this.onSelectionUpdated(opt));
    this.canvas.on("selection:cleared", (opt) => this.onSelectionCleared(opt));

    this.canvas.on("object:added", (opt) => this.onObjectAdded(opt));

    const el = this.canvas.upperCanvasEl;
    if (el) el.addEventListener("contextmenu", (e) => stopContextMenu(e));
  }

  onObjectAdded(opt) {
    const tool = getActiveTool(this.editor);
    if (tool && typeof tool.onObjectAdded === "function") tool.onObjectAdded(opt);
  }

  onSelectionCreated(opt) {
    const tool = getActiveTool(this.editor);
    if (tool && typeof tool.onSelectionCreated === "function") tool.onSelectionCreated(opt);
  }

  onSelectionUpdated(opt) {
    const tool = getActiveTool(this.editor);
    if (tool && typeof tool.onSelectionUpdated === "function") tool.onSelectionUpdated(opt);
  }

  onSelectionCleared(opt) {
    const tool = getActiveTool(this.editor);
    if (tool && typeof tool.onSelectionCleared === "function") tool.onSelectionCleared(opt);
  }

  onDoubleClick() {
    const tool = getActiveTool(this.editor);

    if (tool && typeof tool.handleDoubleClick === "function") {
      tool.handleDoubleClick();
      return;
    }

    if (tool && typeof tool.onDoubleClick === "function") tool.onDoubleClick();
  }

  beginPan(e) {
    this._panning.active = true;
    this._panning.lastClientX = e.clientX;
    this._panning.lastClientY = e.clientY;

    this.canvas.defaultCursor = "grab";
    this.canvas.hoverCursor = "grab";
    this.canvas.moveCursor = "grab";
    this.canvas.setCursor("grab");
  }

  updatePan(e) {
    if (!this._panning.active) return;

    const dx = e.clientX - this._panning.lastClientX;
    const dy = e.clientY - this._panning.lastClientY;

    this._panning.lastClientX = e.clientX;
    this._panning.lastClientY = e.clientY;

    // Panning is a screen-space translation, so we can just adjust e,f (vpt[4],vpt[5])
    const vpt = this.canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    vpt[4] += dx;
    vpt[5] += dy;

    setViewportTransform(this.editor, vpt);
  }

  endPan() {
    if (!this._panning.active) return;

    this._panning.active = false;

    // Restore correct cursor for the active tool
    restoreToolCursor(this.editor);
  }

  onMouseDown(opt) {
    const e = opt && opt.e ? opt.e : null;
    if (!e) return;

    // Right click commits filled region if tool supports it
    if (isRightButton(e)) {
      const tool = getActiveTool(this.editor);
      if (tool && typeof tool.commitRegion === "function") {
        stopContextMenu(e);
        tool.commitRegion();
        return;
      }
    }

    // Spacebar pan takes precedence
    if (this.editor.isSpaceDown) {
      this.beginPan(e);
      return;
    }

    // View-aware sheet activation (do NOT swallow)
    const sid = pickSheetIdFromPointer(opt);
    if (sid && sid !== this.editor.activeViewId) {
      this.editor.setActiveView(sid);
    }

    const tool = getActiveTool(this.editor);

    // IMPORTANT: avoid double-firing if a tool implements both
    if (tool && typeof tool.handlePointerDown === "function") {
      tool.handlePointerDown(opt);
      return;
    }

    if (tool && typeof tool.onMouseDown === "function") {
      tool.onMouseDown(opt);
    }
  }

  onMouseMove(opt) {
    const e = opt && opt.e ? opt.e : null;
    if (!e) return;

    this._lastPointer = { x: e.clientX, y: e.clientY };

    if (this._panning.active) {
      this.updatePan(e);
      return;
    }

    const tool = getActiveTool(this.editor);

    if (tool && typeof tool.handlePointerMove === "function") {
      tool.handlePointerMove(opt);
      return;
    }

    if (tool && typeof tool.onMouseMove === "function") {
      tool.onMouseMove(opt);
    }
  }

  onMouseUp(opt) {
    const e = opt && opt.e ? opt.e : null;

    if (this._panning.active) {
      this.endPan();
      return;
    }

    const tool = getActiveTool(this.editor);
    if (tool && typeof tool.onMouseUp === "function") tool.onMouseUp(opt);
  }

  onMouseWheel(opt) {
    const e = opt && opt.e ? opt.e : null;
    if (!e) return;

    e.preventDefault();
    e.stopPropagation();

    if (this._wheelLock) return;
    this._wheelLock = true;
    requestAnimationFrame(() => (this._wheelLock = false));

    const canvas = this.canvas;

    // Rotation-safe oldZoom
    const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    const oldZoom = getZoomFromVpt(vpt);

    const zoomFactor = Math.pow(0.999, e.deltaY);
    let newZoom = oldZoom * zoomFactor;
    newZoom = clamp(newZoom, 0.08, 40);

    // We cannot rely on Fabric's zoomToPoint under rotated VPT because Fabric uses vpt[0] as zoom.
    // Instead: do our own anchored zoom using matrix math that is rotation-safe.
    //
    // Goal: keep the world point under the mouse fixed on screen.
    const sp = getCanvasScreenPointer(this.editor, e);
    if (!sp) return;

    // World point under cursor BEFORE zoom
    const worldBefore = screenToWorld(this.editor, e);

    // Scale the camera about the cursor in screen space:
    // V' = T(p) * S(s) * T(-p) * V
    const s = newZoom / oldZoom;

    const T1 = [1, 0, 0, 1, sp.x, sp.y];
    const S = [s, 0, 0, s, 0, 0];
    const T2 = [1, 0, 0, 1, -sp.x, -sp.y];

    const TS = fabric.util.multiplyTransformMatrices(T1, S);
    const TST = fabric.util.multiplyTransformMatrices(TS, T2);

    const nextVpt = fabric.util.multiplyTransformMatrices(TST, vpt);

    // (Optional safety) Re-anchor explicitly by correcting translation so worldBefore maps to sp.
    // This prevents tiny drift accumulation across many wheel events.
    const mapped = fabric.util.transformPoint(
      new fabric.Point(worldBefore.x, worldBefore.y),
      nextVpt
    );
    nextVpt[4] += sp.x - mapped.x;
    nextVpt[5] += sp.y - mapped.y;

    setViewportTransform(this.editor, nextVpt);
  }
}
