// tools/Tools-Circle.js
import { applyStyleToObject } from "../config.js";
import { toWorldPointer, snapWorldPointerWithTarget, removeToolPreviews, shouldAngleSnap } from "./ToolUtils.js";

const fabric = globalThis.fabric;

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

function worldToScreen(canvas, pt) {
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const p = fabric.util.transformPoint(new fabric.Point(pt.x, pt.y), vpt);
  return { x: p.x, y: p.y };
}

function distPx(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class CircleTool {
  constructor(editor) {
    this.editor = editor;
    this.canvas = editor.canvas;

    this.centre = null;
    this.previewCircle = null;
  }

  onActivate() {
    this.canvas.selection = false;
    this.canvas.setCursor("crosshair");
  }

  onDeactivate() {
    this.cancel();
  }

  cancel() {
    this.centre = null;

    if (this.previewCircle) {
      try {
        this.canvas.remove(this.previewCircle);
      } catch (err) {}
    }
    this.previewCircle = null;

    removeToolPreviews(this.editor);

    // Clear snap reference line so other tools don't inherit it
    try {
      this.editor?.snapper?.clearReferenceLine?.();
    } catch (err) {}

    this.canvas.requestRenderAll();
  }

  /**
   * Premium rule:
   * - snap direct first
   * - if angle snap is active, also try constrained snap + snap
   * - choose whichever is closer to cursor (screen space)
   */
  _getRadiusPoint(rawWorld, doAngleSnap) {
    // direct snap
    const direct = snapWorldPointerWithTarget(this.editor, rawWorld);
    const directPt = direct.snapped ? direct.point : rawWorld;

    if (!this.centre || !doAngleSnap) return directPt;

    // constrained snap
    const constrained = applyAngleConstraint(this.editor, this.centre, rawWorld, 45);
    const constrainedSnap = snapWorldPointerWithTarget(this.editor, constrained);
    const constrainedPt = constrainedSnap.snapped ? constrainedSnap.point : constrained;

    const rawS = worldToScreen(this.canvas, rawWorld);
    const d1 = distPx(worldToScreen(this.canvas, directPt), rawS);
    const d2 = distPx(worldToScreen(this.canvas, constrainedPt), rawS);

    return d2 < d1 ? constrainedPt : directPt;
  }

  onMouseDown(opt) {
    const world = toWorldPointer(this.editor, opt);
    if (!world) return;

    if (!this.centre) {
      const snapRes = snapWorldPointerWithTarget(this.editor, world);
      const snappedCentre = snapRes.snapped ? snapRes.point : world;

      this.centre = snappedCentre;

      // Reference line start for stability (center -> center initially)
      try {
        this.editor?.snapper?.setReferenceLine?.(snappedCentre, snappedCentre);
      } catch (err) {}

      if (this.previewCircle) {
        try {
          this.canvas.remove(this.previewCircle);
        } catch (err) {}
      }

      this.previewCircle = new fabric.Circle({
        left: snappedCentre.x,
        top: snappedCentre.y,
        originX: "center",
        originY: "center",
        radius: 1,
        fill: "transparent",
        selectable: false,
        evented: false,
        objectCaching: false,
        strokeUniform: true,

        hasControls: false,
        hasBorders: false
      });

      this.previewCircle.isToolPreview = true;
      this.previewCircle.objectType = "circle-preview";
      this.previewCircle.__styleKey = this.editor.activeStyleType;
      this.previewCircle.styleKey = this.editor.activeStyleType;

      applyStyleToObject(this.previewCircle, this.editor.activeStyleType, this.editor.currentScale, this.editor.isWireframe);

      this.canvas.add(this.previewCircle);
      this.previewCircle.bringToFront();
      this.canvas.requestRenderAll();
      return;
    }

    const doAngle = shouldAngleSnap(this.editor, opt);
    const radiusPt = this._getRadiusPoint(world, doAngle);

    const dx = radiusPt.x - this.centre.x;
    const dy = radiusPt.y - this.centre.y;
    const r = Math.max(1, Math.hypot(dx, dy));

    const circle = new fabric.Circle({
      left: this.centre.x,
      top: this.centre.y,
      originX: "center",
      originY: "center",
      radius: r,
      fill: "transparent",
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

    circle.objectType = "circle";
    circle.sheetId = this.editor.activeViewId;
    // Phase 2: Plan levels tagging (plan view only)
    if (this.editor.activeViewId === "plan") {
      const pl = typeof this.editor.getPlanLevelsState === "function" ? this.editor.getPlanLevelsState() : (this.editor.planLevels || {});
      circle.levelId = pl && pl.primary ? pl.primary : "L0";
      circle.levelRole = "primary";
    }
    circle.__styleKey = this.editor.activeStyleType;
    circle.styleKey = this.editor.activeStyleType;

    applyStyleToObject(circle, this.editor.activeStyleType, this.editor.currentScale, this.editor.isWireframe);

    if (this.previewCircle) {
      try {
        this.canvas.remove(this.previewCircle);
      } catch (err) {}
    }
    this.previewCircle = null;

    // Clear reference line after commit
    try {
      this.editor?.snapper?.clearReferenceLine?.();
    } catch (err) {}

    this.canvas.add(circle);
    this.canvas.discardActiveObject();

    this.centre = null;
    this.canvas.requestRenderAll();
  }

  onMouseMove(opt) {
    if (!this.centre || !this.previewCircle) return;

    const world = toWorldPointer(this.editor, opt);
    if (!world) return;

    const doAngle = shouldAngleSnap(this.editor, opt);
    const radiusPt = this._getRadiusPoint(world, doAngle);

    // Keep reference line updated (center -> radiusPt)
    try {
      this.editor?.snapper?.setReferenceLine?.(this.centre, radiusPt);
    } catch (err) {}

    const dx = radiusPt.x - this.centre.x;
    const dy = radiusPt.y - this.centre.y;
    const r = Math.max(1, Math.hypot(dx, dy));

    this.previewCircle.set({ radius: r });
    this.previewCircle.dirty = true;

    this.canvas.requestRenderAll();
  }

  onKeyDown(e) {
    if (e && e.key === "Escape") this.cancel();
  }
}
