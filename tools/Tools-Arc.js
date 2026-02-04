// tools/Tools-Arc.js
import { applyStyleToObject } from "../config.js";
import { toWorldPointer, snapWorldPointer, removeToolPreviews, shouldAngleSnap } from "./ToolUtils.js";

const fabric = globalThis.fabric;

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function clamp01(t) {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

function angleFrom(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

function arcPathFrom(center, radius, startAngle, endAngle) {
  const sx = center.x + Math.cos(startAngle) * radius;
  const sy = center.y + Math.sin(startAngle) * radius;
  const ex = center.x + Math.cos(endAngle) * radius;
  const ey = center.y + Math.sin(endAngle) * radius;

  const delta = normaliseAngleRad(endAngle - startAngle);
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;

  return `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${ex} ${ey}`;
}

export class ArcTool {
  constructor(editor) {
    this.editor = editor;
    this.canvas = editor.canvas;

    this.centre = null;
    this.radius = null;
    this.startAngle = null;

    this.preview = null;

    // If user is holding angle snap, we accept snapping to a close-by snapped point
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
    this.centre = null;
    this.radius = null;
    this.startAngle = null;

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

  createPreview(pathD) {
    if (this.preview) {
      try {
        this.canvas.remove(this.preview);
      } catch (err) {}
      this.preview = null;
    }

    const p = new fabric.Path(pathD, {
      selectable: false,
      evented: false,
      objectCaching: false,
      strokeUniform: true,
      fill: "rgba(0,0,0,0)"
    });

    p.isToolPreview = true;
    p.objectType = "arc-preview";
    p.__styleKey = this.editor.activeStyleType;
    p.styleKey = this.editor.activeStyleType;

    applyStyleToObject(p, this.editor.activeStyleType, this.editor.currentScale, this.editor.isWireframe);

    this.preview = p;
    this.canvas.add(this.preview);
    this.preview.bringToFront();
  }

  commitArc(pathD) {
    const p = new fabric.Path(pathD, {
      selectable: true,
      evented: true,
      objectCaching: false,
      strokeUniform: true,
      fill: "rgba(0,0,0,0)",

      hasControls: false,
      hasBorders: false,

      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true
    });

    p.objectType = "arc";
    p.sheetId = this.editor.activeViewId;
    // Phase 2: Plan levels tagging (plan view only)
    if (this.editor.activeViewId === "plan") {
      const pl = typeof this.editor.getPlanLevelsState === "function" ? this.editor.getPlanLevelsState() : (this.editor.planLevels || {});
      p.levelId = pl && pl.primary ? pl.primary : "L0";
      p.levelRole = "primary";
    }
    p.__styleKey = this.editor.activeStyleType;
    p.styleKey = this.editor.activeStyleType;

    applyStyleToObject(p, this.editor.activeStyleType, this.editor.currentScale, this.editor.isWireframe);

    if (this.preview) {
      try {
        this.canvas.remove(this.preview);
      } catch (err) {}
      this.preview = null;
    }

    // Clear reference line after finishing
    try {
      this.editor?.snapper?.clearReferenceLine?.();
    } catch (err) {}

    this.canvas.add(p);
    p.bringToFront();

    this.centre = null;
    this.radius = null;
    this.startAngle = null;

    this.canvas.requestRenderAll();
  }

  /**
   * Premium rule:
   * - Snap to geometry FIRST (so endpoints/midpoints win)
   * - If angle snap is requested, apply it as a constraint/fallback (not fighting snapping)
   */
  _snapWithOptionalAngle(center, rawWorld, doAngleSnap) {
    // Always try direct snap first
    const snappedDirect = snapWorldPointer(this.editor, rawWorld);

    if (!doAngleSnap) return snappedDirect;

    // Also compute constrained point
    const constrained = applyAngleConstraint(this.editor, center, rawWorld, 45);

    // Snap constrained too (sometimes the constrained position is closer to a snap target)
    const snappedConstrained = snapWorldPointer(this.editor, constrained);

    const aCon = angleFrom(center, constrained);
    const aSnp = angleFrom(center, snappedConstrained);
    const tol = degToRad(this._angleSnapAcceptTolDeg);

    // If snapped constrained doesn't drift too far from constraint, accept it; otherwise use pure constrained.
    return angleDiffRad(aCon, aSnp) <= tol ? snappedConstrained : constrained;
  }

  onMouseDown(opt) {
    const world = toWorldPointer(this.editor, opt);
    if (!world) return;

    // step 1: choose center
    if (!this.centre) {
      const c = snapWorldPointer(this.editor, world);
      this.centre = c;

      try {
        this.editor?.snapper?.setReferenceLine?.(c, c);
      } catch (err) {}

      this.canvas.requestRenderAll();
      return;
    }

    // step 2: choose radius
    if (this.radius == null) {
      const doAngle = shouldAngleSnap(this.editor, opt);
      const pt = this._snapWithOptionalAngle(this.centre, world, doAngle);

      this.radius = Math.max(1, distance(this.centre, pt));
      this.startAngle = angleFrom(this.centre, pt);

      try {
        this.editor?.snapper?.setReferenceLine?.(this.centre, pt);
      } catch (err) {}

      // Show initial preview (very small arc)
      const tiny = this.startAngle + degToRad(1);
      const d = arcPathFrom(this.centre, this.radius, this.startAngle, tiny);
      this.createPreview(d);

      this.canvas.requestRenderAll();
      return;
    }

    // step 3: choose end angle and commit
    const doAngle = shouldAngleSnap(this.editor, opt);
    const pt = this._snapWithOptionalAngle(this.centre, world, doAngle);

    const endAngle = angleFrom(this.centre, pt);
    const pathD = arcPathFrom(this.centre, this.radius, this.startAngle, endAngle);

    this.commitArc(pathD);
  }

  onMouseMove(opt) {
    if (!this.centre) return;

    const world = toWorldPointer(this.editor, opt);
    if (!world) return;

    const doAngle = shouldAngleSnap(this.editor, opt);

    // if only centre set, show reference line but no preview
    if (this.radius == null) {
      const pt = this._snapWithOptionalAngle(this.centre, world, doAngle);
      try {
        this.editor?.snapper?.setReferenceLine?.(this.centre, pt);
      } catch (err) {}
      this.canvas.requestRenderAll();
      return;
    }

    // update arc preview
    const pt = this._snapWithOptionalAngle(this.centre, world, doAngle);
    const endAngle = angleFrom(this.centre, pt);
    const pathD = arcPathFrom(this.centre, this.radius, this.startAngle, endAngle);

    this.createPreview(pathD);

    try {
      this.editor?.snapper?.setReferenceLine?.(this.centre, pt);
    } catch (err) {}

    this.canvas.requestRenderAll();
  }

  onKeyDown(e) {
    if (e && e.key === "Escape") this.cancel();
  }
}
