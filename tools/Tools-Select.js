// tools/Tools-Select.js
import { pxToMm, toWorldPointer } from "./ToolUtils.js";

const fabric = globalThis.fabric;

const HOVER_COLOUR = "#ff2bd6";
const HANDLE_COLOUR = "#ff2bd6";
const AXIS_SNAP_TOL_DEG = 7;

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function normaliseAngleRad(a) {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
}

function angleDiffRad(a, b) {
  const d = normaliseAngleRad(a - b);
  return Math.abs(d);
}

function isLine(obj) {
  if (!obj) return false;
  if (obj.type !== "line") return false;

  if (typeof obj.objectType === "string" && obj.objectType !== "line") return false;

  if (obj.isPaper === true) return false;
  if (obj.isPaperShadow === true) return false;
  if (obj.isSheetGuide === true) return false;
  if (obj.isInnerA4Frame === true) return false;
  if (obj.isSheetLabel === true) return false;
  if (obj.isGrid === true) return false;
  if (obj.isGridLine === true) return false;
  if (obj.isPaperGrid === true) return false;
  if (obj.isKeyReference === true) return false;
  if (obj.isReferenceDashedLine === true) return false;

  return true;
}

function isEndpointHandle(obj) {
  return obj && obj.isEndpointMarker === true;
}

function setLineHover(line, on) {
  if (!line) return;

  if (on) {
    if (line.__prevStrokeHover == null) line.__prevStrokeHover = line.stroke;
    line.set({ stroke: HOVER_COLOUR });
    line.dirty = true;
    return;
  }

  if (line.__prevStrokeHover != null) {
    line.set({ stroke: line.__prevStrokeHover });
    line.__prevStrokeHover = null;
    line.dirty = true;
  }
}

function setLineSelected(line, on) {
  if (!line) return;

  if (on) {
    if (line.__prevStrokeSelected == null) line.__prevStrokeSelected = line.stroke;
    line.set({ stroke: HOVER_COLOUR });
    line.dirty = true;
    return;
  }

  if (line.__prevStrokeSelected != null) {
    line.set({ stroke: line.__prevStrokeSelected });
    line.__prevStrokeSelected = null;
    line.dirty = true;
  }
}

function getLineWorldEndpointsByMatrix(line) {
  const lp = line.calcLinePoints();
  const m = line.calcTransformMatrix();

  const p1 = fabric.util.transformPoint(new fabric.Point(lp.x1, lp.y1), m);
  const p2 = fabric.util.transformPoint(new fabric.Point(lp.x2, lp.y2), m);

  return {
    a: { x: p1.x, y: p1.y },
    b: { x: p2.x, y: p2.y }
  };
}

function ensureLineCentredNormalisedKeepingWorldEnds(line) {
  if (!line) return;

  if (line.__cadCentredNormalised === true) return;

  const ep = getLineWorldEndpointsByMatrix(line);

  const cx = (ep.a.x + ep.b.x) / 2;
  const cy = (ep.a.y + ep.b.y) / 2;

  line.set({
    originX: "center",
    originY: "center",
    left: cx,
    top: cy,
    x1: ep.a.x - cx,
    y1: ep.a.y - cy,
    x2: ep.b.x - cx,
    y2: ep.b.y - cy,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    skewX: 0,
    skewY: 0,
    flipX: false,
    flipY: false,
    strokeUniform: true
  });

  if (typeof line._setWidthHeight === "function") {
    line._setWidthHeight();
  }

  line.setCoords();
  line.dirty = true;

  line.__cadCentredNormalised = true;
}

function getLineWorldEndpoints(line) {
  return getLineWorldEndpointsByMatrix(line);
}

function updateLineFromHandles(line, handleA, handleB) {
  if (!line || !handleA || !handleB) return;

  const a = handleA.getCenterPoint();
  const b = handleB.getCenterPoint();

  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;

  line.set({
    originX: "center",
    originY: "center",
    left: cx,
    top: cy,
    x1: a.x - cx,
    y1: a.y - cy,
    x2: b.x - cx,
    y2: b.y - cy,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    skewX: 0,
    skewY: 0,
    flipX: false,
    flipY: false,
    strokeUniform: true
  });

  if (typeof line._setWidthHeight === "function") {
    line._setWidthHeight();
  }

  line.setCoords();
  line.dirty = true;
}

function makeEndpointHandle(x, y, which, line) {
  const c = new fabric.Circle({
    left: x,
    top: y,
    originX: "center",
    originY: "center",

    radius: 5,
    fill: "rgba(255,43,214,0.22)",
    stroke: HANDLE_COLOUR,
    strokeWidth: 2,

    selectable: false,
    evented: true,
    objectCaching: false,
    hasControls: false,
    hasBorders: false,

    // Fabric defaults selectable-object cursor to "move"; force a light cross.
    hoverCursor: "crosshair",
    moveCursor: "crosshair"
  });

  c.isEndpointMarker = true;
  c.endpointWhich = which;
  c.parentLine = line;

  c.lockScalingX = true;
  c.lockScalingY = true;
  c.lockRotation = true;

  return c;
}

function axisSnapPointFromFixed(fixedPt, rawPt) {
  const dx = rawPt.x - fixedPt.x;
  const dy = rawPt.y - fixedPt.y;

  const len = Math.hypot(dx, dy);
  if (!isFinite(len) || len < 0.00001) return { snapped: false, point: rawPt };

  const curAngle = Math.atan2(dy, dx);
  const candidates = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  let best = null;
  let bestDiff = degToRad(AXIS_SNAP_TOL_DEG);

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    const diff = angleDiffRad(curAngle, a);
    if (diff <= bestDiff) {
      bestDiff = diff;
      best = a;
    }
  }

  if (best == null) return { snapped: false, point: rawPt };

  return {
    snapped: true,
    point: {
      x: fixedPt.x + len * Math.cos(best),
      y: fixedPt.y + len * Math.sin(best)
    }
  };
}

export class SelectTool {
  constructor(editor) {
    this.editor = editor;
    this.canvas = editor.canvas;

    this.selectedLine = null;

    this.handleA = null;
    this.handleB = null;

    this.lengthLabel = null;

    this._onMouseOver = null;
    this._onMouseOut = null;
    this._onMouseDown = null;
    this._onMouseMove = null;
    this._onMouseUp = null;

    this._onSelectionCleared = null;

    // ✅ manual dragging (NO Fabric transform)
    this.draggingHandle = null;
    this.draggingOtherHandle = null;
  }

  onActivate() {
    this.canvas.selection = false;

    // Force light cross cursor
    this.canvas.defaultCursor = "crosshair";
    this.canvas.hoverCursor = "crosshair";
    this.canvas.moveCursor = "crosshair";
    this.canvas.setCursor("crosshair");

    this.canvas.targetFindTolerance = 10;

    this._onMouseOver = (opt) => {
      const t = opt && opt.target ? opt.target : null;
      if (!t) return;
      if (isEndpointHandle(t)) return;

      if (isLine(t)) {
        if (t !== this.selectedLine) setLineHover(t, true);
        this.canvas.requestRenderAll();
      }
    };

    this._onMouseOut = (opt) => {
      const t = opt && opt.target ? opt.target : null;
      if (!t) return;
      if (isEndpointHandle(t)) return;

      if (isLine(t)) {
        if (t !== this.selectedLine) setLineHover(t, false);
        this.canvas.requestRenderAll();
      }
    };

    this._onMouseDown = (opt) => {
      const t = opt && opt.target ? opt.target : null;

      // click on empty space
      if (!t) {
        this.clearLineSelection();
        this.canvas.requestRenderAll();
        return;
      }

      // ✅ clicked an endpoint handle => start manual drag
      if (isEndpointHandle(t)) {
        if (!this.selectedLine || !this.handleA || !this.handleB) return;

        this.draggingHandle = t;
        this.draggingOtherHandle = t === this.handleA ? this.handleB : this.handleA;

        // avoid Fabric selection side effects
        try { this.canvas.discardActiveObject(); } catch (e) {}
        return;
      }

      // clicked a line => select it
      if (isLine(t)) {
        this.selectLine(t);
        this.canvas.requestRenderAll();
        return;
      }

      // clicked something else => clear
      this.clearLineSelection();
      this.canvas.requestRenderAll();
    };

    this._onMouseMove = (opt) => {
      if (!this.draggingHandle || !this.draggingOtherHandle) return;
      if (!this.selectedLine || !this.handleA || !this.handleB) return;

      const world = toWorldPointer(this.editor, opt);
      if (!world) return;

      const raw = { x: world.x, y: world.y };
      const fixed = this.draggingOtherHandle.getCenterPoint();

      let snappedPt = raw;
      let usedPointSnap = false;

      // point snapping
      if (this.editor.snapper) {
        const res = this.editor.snapper.applySnapToPointer(raw);
        if (res && res.snapped && res.point) {
          if (!res.target || res.target.isEndpointMarker !== true) {
            snappedPt = res.point;
            usedPointSnap = true;
          }
        }
      }

      // axis snap fallback
      if (!usedPointSnap) {
        const axisRes = axisSnapPointFromFixed(fixed, raw);
        snappedPt = axisRes.point;
      }

      // move the handle
      this.draggingHandle.set({ left: snappedPt.x, top: snappedPt.y });
      this.draggingHandle.setCoords();

      // update line from handles (world-space stable)
      updateLineFromHandles(this.selectedLine, this.handleA, this.handleB);
      setLineSelected(this.selectedLine, true);

      this.updateLengthLabelFromHandles(this.handleA, this.handleB);

      this.handleA.bringToFront();
      this.handleB.bringToFront();
      if (this.lengthLabel) this.lengthLabel.bringToFront();

      this.canvas.requestRenderAll();
    };

    this._onMouseUp = () => {
      this.draggingHandle = null;
      this.draggingOtherHandle = null;
    };

    this._onSelectionCleared = () => {
      this.clearLineSelection();
      this.canvas.requestRenderAll();
    };

    this.canvas.on("mouse:over", this._onMouseOver);
    this.canvas.on("mouse:out", this._onMouseOut);
    this.canvas.on("mouse:down", this._onMouseDown);
    this.canvas.on("mouse:move", this._onMouseMove);
    this.canvas.on("mouse:up", this._onMouseUp);
    this.canvas.on("selection:cleared", this._onSelectionCleared);
  }

  onDeactivate() {
    if (this._onMouseOver) this.canvas.off("mouse:over", this._onMouseOver);
    if (this._onMouseOut) this.canvas.off("mouse:out", this._onMouseOut);
    if (this._onMouseDown) this.canvas.off("mouse:down", this._onMouseDown);
    if (this._onMouseMove) this.canvas.off("mouse:move", this._onMouseMove);
    if (this._onMouseUp) this.canvas.off("mouse:up", this._onMouseUp);
    if (this._onSelectionCleared) this.canvas.off("selection:cleared", this._onSelectionCleared);

    this._onMouseOver = null;
    this._onMouseOut = null;
    this._onMouseDown = null;
    this._onMouseMove = null;
    this._onMouseUp = null;
    this._onSelectionCleared = null;

    this.draggingHandle = null;
    this.draggingOtherHandle = null;

    this.clearLineSelection();
  }

  clearLineSelection() {
    if (this.selectedLine) {
      setLineSelected(this.selectedLine, false);
      setLineHover(this.selectedLine, false);
    }

    this.selectedLine = null;

    if (this.handleA) {
      try { this.canvas.remove(this.handleA); } catch (err) {}
    }
    this.handleA = null;

    if (this.handleB) {
      try { this.canvas.remove(this.handleB); } catch (err) {}
    }
    this.handleB = null;

    if (this.lengthLabel) {
      try { this.canvas.remove(this.lengthLabel); } catch (err) {}
    }
    this.lengthLabel = null;

    try { this.canvas.discardActiveObject(); } catch (e) {}
    this.canvas.requestRenderAll();
  }

  selectLine(line) {
    if (!line) return;

    if (this.selectedLine && this.selectedLine !== line) {
      this.clearLineSelection();
    }

    this.selectedLine = line;
    

    line.set({
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      hoverCursor: "crosshair",
      moveCursor: "crosshair"
    });

    setLineHover(line, false);
    setLineSelected(line, true);

    if (this.handleA) {
      try { this.canvas.remove(this.handleA); } catch (err) {}
      this.handleA = null;
    }
    if (this.handleB) {
      try { this.canvas.remove(this.handleB); } catch (err) {}
      this.handleB = null;
    }

    const ep = getLineWorldEndpoints(line);

    this.handleA = makeEndpointHandle(ep.a.x, ep.a.y, "a", line);
    this.handleB = makeEndpointHandle(ep.b.x, ep.b.y, "b", line);

    this.canvas.add(this.handleA);
    this.canvas.add(this.handleB);

    this.handleA.bringToFront();
    this.handleB.bringToFront();

    this.updateLengthLabelFromHandles(this.handleA, this.handleB);

    this.canvas.requestRenderAll();
  }

  updateLengthLabelFromHandles(handleA, handleB) {
    if (!handleA || !handleB) return;

    const a = handleA.getCenterPoint();
    const b = handleB.getCenterPoint();

    const distPx = Math.hypot(b.x - a.x, b.y - a.y);
    const distMM = pxToMm(this.editor, distPx);

    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const text = `${distMM.toFixed(1)} mm`;

    if (!this.lengthLabel) {
      this.lengthLabel = new fabric.Text(text, {
        left: mid.x,
        top: mid.y,
        originX: "center",
        originY: "center",
        fontSize: 14,
        fontFamily: "Segoe UI, Arial, sans-serif",
        fill: "#111",
        backgroundColor: "rgba(255,255,255,0.85)",
        selectable: false,
        evented: false,
        objectCaching: false
      });

      this.lengthLabel.isToolPreview = true;
      this.canvas.add(this.lengthLabel);
      this.lengthLabel.bringToFront();
      return;
    }

    this.lengthLabel.set({ text, left: mid.x, top: mid.y });
    this.lengthLabel.dirty = true;
    this.lengthLabel.bringToFront();
  }

  onMouseDown() {}
  onMouseMove() {}

  onKeyDown(e) {
    if (e && e.key === "Escape") {
      this.clearLineSelection();
    }
  }
}
