// tools/Tools-FilledRegion.js
import { applyStyleToObject } from "../config.js";
import { toWorldPointer, snapWorldPointer, removeToolPreviews, shouldAngleSnap } from "./ToolUtils.js";

const fabric = globalThis.fabric;

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function angleFrom(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
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

function applyAngleConstraint(editor, originWorld, pointerWorld, stepDeg = 45) {
  const snapper = editor?.snapper;
  if (snapper && typeof snapper.applyAngleSnap === "function") {
    return snapper.applyAngleSnap(originWorld, pointerWorld, { enabled: true, stepDeg });
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

export class FilledRegionTool {
  constructor(editor) {
    this.editor = editor;
    this.canvas = editor.canvas;

    this.points = [];
    this.preview = null;

    // If holding angle snap, accept snapping to a close-by snapped point
    // only if it doesn’t “fight” the constraint too much.
    this._angleSnapAcceptTolDeg = 4;
  }

  onActivate() {
    this.canvas.selection = false;
    this.canvas.setCursor("crosshair");
  }

  onDeactivate() {
    this.cancel();
  }

  cancel() {
    this.points = [];

    if (this.preview) {
      try {
        this.canvas.remove(this.preview);
      } catch (err) {}
      this.preview = null;
    }

    removeToolPreviews(this.editor);

    // Clear snap reference line so other tools don't inherit it
    try {
      this.editor?.snapper?.clearReferenceLine?.();
    } catch (err) {}

    this.canvas.requestRenderAll();
  }

  rebuildPreview(lastCandidate = null) {
    if (this.preview) {
      try {
        this.canvas.remove(this.preview);
      } catch (err) {}
      this.preview = null;
    }

    const pts = lastCandidate ? this.points.concat([lastCandidate]) : this.points.slice();
    if (pts.length < 2) return;

    const poly = new fabric.Polyline(pts, {
      selectable: false,
      evented: false,
      objectCaching: false,
      strokeUniform: true,

      hasControls: false,
      hasBorders: false,
      fill: "rgba(0,0,0,0)"
    });

    poly.isToolPreview = true;
    poly.objectType = "filledregion-preview";
    poly.__styleKey = this.editor.activeStyleType;
    poly.styleKey = this.editor.activeStyleType;

    applyStyleToObject(poly, this.editor.activeStyleType, this.editor.currentScale, this.editor.isWireframe);

    this.preview = poly;
    this.canvas.add(poly);
    poly.bringToFront();
  }

  commitRegion() {
    if (this.points.length < 3) {
      this.cancel();
      return;
    }

    const poly = new fabric.Polygon(this.points, {
      selectable: true,
      evented: true,
      objectCaching: false,
      strokeUniform: true,

      hasControls: false,
      hasBorders: false,

      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true
    });

    poly.objectType = "filledregion";
    poly.sheetId = this.editor.activeViewId;
    // Phase 2: Plan levels tagging (plan view only)
    if (this.editor.activeViewId === "plan") {
      const pl = typeof this.editor.getPlanLevelsState === "function" ? this.editor.getPlanLevelsState() : (this.editor.planLevels || {});
      poly.levelId = pl && pl.primary ? pl.primary : "L0";
      poly.levelRole = "primary";
    }
    poly.__styleKey = this.editor.activeStyleType;
    poly.styleKey = this.editor.activeStyleType;

    applyStyleToObject(poly, this.editor.activeStyleType, this.editor.currentScale, this.editor.isWireframe);

    this.cancel();

    this.canvas.add(poly);
    poly.bringToFront();

    this.canvas.requestRenderAll();
  }

  _computeCandidate(world, doAngleSnap) {
    let candidate = { x: world.x, y: world.y };

    if (doAngleSnap && this.points.length >= 1) {
      const last = this.points[this.points.length - 1];
      const constrained = applyAngleConstraint(this.editor, last, candidate, 45);
      const snapped = snapWorldPointer(this.editor, constrained);

      const aCon = angleFrom(last, constrained);
      const aSnp = angleFrom(last, snapped);

      const tol = degToRad(this._angleSnapAcceptTolDeg);
      return angleDiffRad(aCon, aSnp) <= tol ? snapped : constrained;
    }

    return snapWorldPointer(this.editor, candidate);
  }

  handlePointerDown(opt) {
    const world = toWorldPointer(this.editor, opt);
    if (!world) return;

    const doAngle = shouldAngleSnap(this.editor, opt);
    const candidate = this._computeCandidate(world, doAngle);

    this.points.push(candidate);
    this.rebuildPreview(candidate);

    this.canvas.requestRenderAll();
  }

  handlePointerMove(opt) {
    if (this.points.length < 1) return;

    const world = toWorldPointer(this.editor, opt);
    if (!world) return;

    const doAngle = shouldAngleSnap(this.editor, opt);
    const candidate = this._computeCandidate(world, doAngle);

    // Update preview with candidate appended
    this.rebuildPreview(candidate);

    // Reference line last fixed -> candidate
    const last = this.points[this.points.length - 1];
    try {
      this.editor?.snapper?.setReferenceLine?.(last, candidate);
    } catch (err) {}

    this.canvas.requestRenderAll();
  }

  onMouseDown(opt) {
    this.handlePointerDown(opt);
  }

  onMouseMove(opt) {
    this.handlePointerMove(opt);
  }

  onKeyDown(e) {
    if (!e) return;

    if (e.key === "Escape") {
      this.cancel();
      return;
    }

    // Enter commits
    if (e.key === "Enter") {
      this.commitRegion();
      return;
    }

    // Backspace removes last point
    if (e.key === "Backspace") {
      e.preventDefault();
      if (this.points.length > 0) this.points.pop();
      this.rebuildPreview();
      this.canvas.requestRenderAll();
    }
  }
}
