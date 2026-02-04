// tools/Tools-Line.js
import { applyStyleToObject } from "../config.js";
import { toWorldPointer, snapWorldPointerWithTarget, pxToMm, shouldAngleSnap } from "./ToolUtils.js";

const fabric = globalThis.fabric;

function applyAngleConstraint(editor, originWorld, pointerWorld, stepDeg = 45, shiftKey = false) {
  const snapper = editor?.snapper;

  if (snapper && typeof snapper.applyAngleSnap === "function") {
    // Pass shiftKey so snapper can respect its mode: off/shift/always
    return snapper.applyAngleSnap(originWorld, pointerWorld, { enabled: true, stepDeg, shiftKey });
  }

  const dx = pointerWorld.x - originWorld.x;
  const dy = pointerWorld.y - originWorld.y;
  const len = Math.hypot(dx, dy);
  if (!isFinite(len) || len < 1e-6) return pointerWorld;

  const ang = Math.atan2(dy, dx);
  const stepRad = (stepDeg * Math.PI) / 180;
  const snappedAng = Math.round(ang / stepRad) * stepRad;

  return {
    x: originWorld.x + Math.cos(snappedAng) * len,
    y: originWorld.y + Math.sin(snappedAng) * len
  };
}

function worldToScreen(canvas, pt) {
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const p = fabric.util.transformPoint(new fabric.Point(pt.x, pt.y), vpt);
  return { x: p.x, y: p.y };
}

function distPx(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Automatic horizontal/vertical snap tolerance (degrees)
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
  return Math.abs(normaliseAngleRad(a - b));
}

function axisSnapFromOrigin(originWorld, pointerWorld, tolDeg = AXIS_SNAP_TOL_DEG) {
  const dx = pointerWorld.x - originWorld.x;
  const dy = pointerWorld.y - originWorld.y;
  const len = Math.hypot(dx, dy);
  if (!isFinite(len) || len < 1e-6) return { snapped: false, point: pointerWorld };

  const cur = Math.atan2(dy, dx);
  const candidates = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  const tol = degToRad(tolDeg);

  let best = null;
  let bestDiff = tol;
  for (const a of candidates) {
    const diff = angleDiffRad(cur, a);
    if (diff <= bestDiff) {
      bestDiff = diff;
      best = a;
    }
  }
  if (best == null) return { snapped: false, point: pointerWorld };

  return {
    snapped: true,
    point: {
      x: originWorld.x + Math.cos(best) * len,
      y: originWorld.y + Math.sin(best) * len
    }
  };
}

export class LineTool {
  constructor(editor) {
    this.editor = editor;
    this.canvas = editor.canvas;

    this.startPt = null;
    this.previewLine = null;
    this.lengthLabel = null;
  }

  onActivate() {
    this.canvas.selection = false;
    this.canvas.setCursor("crosshair");
  }

  onDeactivate() {
    this.cancel();
  }

  cancel() {
    this.startPt = null;

    if (this.previewLine) {
      try { this.canvas.remove(this.previewLine); } catch (err) {}
    }
    this.previewLine = null;

    if (this.lengthLabel) {
      try { this.canvas.remove(this.lengthLabel); } catch (err) {}
    }
    this.lengthLabel = null;

    try { this.editor?.snapper?.clearReferenceLine?.(); } catch (err) {}

    this.canvas.requestRenderAll();
  }

  updateLengthLabel(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distPxVal = Math.hypot(dx, dy);
    const distMM = pxToMm(this.editor, distPxVal);

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
  }

  commitLine(endPt) {
    if (!this.startPt) return;

    const a = { x: this.startPt.x, y: this.startPt.y };
    const b = { x: endPt.x, y: endPt.y };

    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const line = new fabric.Line([-dx / 2, -dy / 2, dx / 2, dy / 2], {
      left: mid.x,
      top: mid.y,
      originX: "center",
      originY: "center",

      selectable: true,
      evented: true,
      objectCaching: false,
      strokeUniform: true,
      hasControls: false,
      hasBorders: false,
      lockRotation: true,

      lockMovementX: false,
      lockMovementY: false
    });

    line.objectType = "line";
    line.sheetId = this.editor.activeViewId;
    // Phase 2: Plan levels tagging (plan view only)
    if (this.editor.activeViewId === "plan") {
      const pl = typeof this.editor.getPlanLevelsState === "function" ? this.editor.getPlanLevelsState() : (this.editor.planLevels || {});
      line.levelId = pl && pl.primary ? pl.primary : "L0";
      line.levelRole = "primary";
    }
    line.__styleKey = this.editor.activeStyleType;
    line.styleKey = this.editor.activeStyleType;

    applyStyleToObject(line, this.editor.activeStyleType, this.editor.currentScale, this.editor.isWireframe);

    if (this.previewLine) { try { this.canvas.remove(this.previewLine); } catch (err) {} }
    this.previewLine = null;

    if (this.lengthLabel) { try { this.canvas.remove(this.lengthLabel); } catch (err) {} }
    this.lengthLabel = null;

    this.canvas.add(line);

    try {
      line.setCoords();
      line.setPositionByOrigin(line.getCenterPoint(), "center", "center");
      line.setCoords();
    } catch (err) {}

    this.canvas.discardActiveObject();
    this.startPt = null;
    this.canvas.requestRenderAll();
  }

  /**
   * Correct CAD priority:
   * 1) If angle snapping is active, use the constrained point (unless point snap is clearly intended)
   * 2) Auto H/V snap always available (tight tolerance)
   * 3) End/mid snaps can override constraints if the cursor is actually near them
   */
  _computeEndPoint(rawWorld, doAngleSnap, opt) {
    const e = opt && opt.e ? opt.e : null;
    const shiftKey = !!(e && e.shiftKey);

    // direct snap attempt
    const direct = snapWorldPointerWithTarget(this.editor, rawWorld);
    const directPt = direct.snapped ? direct.point : rawWorld;

    // Auto H/V snap (only meaningful once start is set)
    let axisPt = directPt;
    let axisSnapped = false;
    if (this.startPt) {
      const axisRes = axisSnapFromOrigin(this.startPt, rawWorld, AXIS_SNAP_TOL_DEG);
      axisSnapped = axisRes.snapped;
      axisPt = axisRes.point;
    }

    // Angle snap attempt (if active)
    if (this.startPt && doAngleSnap) {
      const constrained = applyAngleConstraint(this.editor, this.startPt, rawWorld, 45, shiftKey);
      const constrainedSnap = snapWorldPointerWithTarget(this.editor, constrained);
      const constrainedPt = constrainedSnap.snapped ? constrainedSnap.point : constrained;

      // If direct did NOT snap to something real (end/mid/etc), always prefer angle constraint
      if (!direct.snapped) return constrainedPt;

      // If direct DID snap, choose whichever is closer to cursor (feels natural)
      const rawS = worldToScreen(this.canvas, rawWorld);
      const dDirect = distPx(worldToScreen(this.canvas, directPt), rawS);
      const dConstr = distPx(worldToScreen(this.canvas, constrainedPt), rawS);
      return dDirect <= dConstr ? directPt : constrainedPt;
    }

    // No angle snap: apply auto H/V only if it actually snapped AND direct didn't snap to a point
    if (this.startPt && axisSnapped && !direct.snapped) return axisPt;

    return directPt;
  }

  onMouseDown(opt) {
    const world = toWorldPointer(this.editor, opt);
    if (!world) return;

    if (!this.startPt) {
      const snapRes = snapWorldPointerWithTarget(this.editor, world);
      const start = snapRes.snapped ? snapRes.point : world;

      this.startPt = start;

      try { this.editor?.snapper?.setReferenceLine?.(start, start); } catch (err) {}

      if (this.previewLine) {
        try { this.canvas.remove(this.previewLine); } catch (err) {}
      }

      this.previewLine = new fabric.Line([0, 0, 0, 0], {
        left: start.x,
        top: start.y,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        objectCaching: false,
        strokeUniform: true,
        hasControls: false,
        hasBorders: false,
        perPixelTargetFind: false
      });

      this.previewLine.isToolPreview = true;
      this.previewLine.objectType = "line-preview";
      this.previewLine.__styleKey = this.editor.activeStyleType;
      this.previewLine.styleKey = this.editor.activeStyleType;

      applyStyleToObject(this.previewLine, this.editor.activeStyleType, this.editor.currentScale, this.editor.isWireframe);

      this.canvas.add(this.previewLine);
      this.previewLine.bringToFront();

      this.canvas.requestRenderAll();
      return;
    }

    const doAngle = shouldAngleSnap(this.editor, opt);
    const endPt = this._computeEndPoint(world, doAngle, opt);
    this.commitLine(endPt);
  }

  onMouseMove(opt) {
    if (!this.startPt || !this.previewLine) return;

    const world = toWorldPointer(this.editor, opt);
    if (!world) return;

    const doAngle = shouldAngleSnap(this.editor, opt);
    const endPt = this._computeEndPoint(world, doAngle, opt);

    try { this.editor?.snapper?.setReferenceLine?.(this.startPt, endPt); } catch (err) {}

    this.previewLine.set({
      x1: this.startPt.x,
      y1: this.startPt.y,
      x2: endPt.x,
      y2: endPt.y
    });

    this.previewLine.dirty = true;
    this.updateLengthLabel(this.startPt, endPt);
    this.canvas.requestRenderAll();
  }

  onKeyDown(e) {
    if (e && e.key === "Escape") this.cancel();
  }
}
