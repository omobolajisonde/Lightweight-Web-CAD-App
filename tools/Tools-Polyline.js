// tools/Tools-Polyline.js
import { applyStyleToObject } from "../config.js";
import {
  toWorldPointer,
  snapWorldPointerWithTarget,
  removeToolPreviews,
  distanceWorld,
  pxToMm,
  shouldAngleSnap
} from "./ToolUtils.js";

const fabric = globalThis.fabric;

function worldToScreen(canvas, pt) {
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const p = fabric.util.transformPoint(new fabric.Point(pt.x, pt.y), vpt);
  return { x: p.x, y: p.y };
}

function distPx(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class PolylineTool {
  constructor(editor) {
    this.editor = editor;
    this.canvas = editor.canvas;

    this.points = [];
    this.previewLine = null;
    this.lengthLabel = null;

    this._lastFinishAt = 0;
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

    if (this.previewLine) {
      try {
        this.canvas.remove(this.previewLine);
      } catch (err) {}
    }
    this.previewLine = null;

    if (this.lengthLabel) {
      try {
        this.canvas.remove(this.lengthLabel);
      } catch (err) {}
    }
    this.lengthLabel = null;

    removeToolPreviews(this.editor);

    // Clear snap reference line so other tools don't inherit it
    try {
      this.editor?.snapper?.clearReferenceLine?.();
    } catch (err) {}

    this.canvas.requestRenderAll();
  }

  finishLine() {
    this._lastFinishAt = performance.now();
    if (this.points.length < 2) {
      this.cancel();
      return;
    }

    // Remove any previews first so they never get selected as a “group”
    removeToolPreviews(this.editor);

    const line = new fabric.Polyline(this.points, {
      fill: "transparent",
      selectable: true,
      evented: true,
      objectCaching: false,

      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true
    });

    line.objectType = "polyline";
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

    if (this.previewLine) {
      try {
        this.canvas.remove(this.previewLine);
      } catch (err) {}
    }
    this.previewLine = null;

    if (this.lengthLabel) {
      try {
        this.canvas.remove(this.lengthLabel);
      } catch (err) {}
    }
    this.lengthLabel = null;

    // Clear reference line after commit
    try {
      this.editor?.snapper?.clearReferenceLine?.();
    } catch (err) {}

    this.canvas.add(line);
    this.canvas.discardActiveObject();

    this.points = [];
    this.canvas.requestRenderAll();
  }

  getCloseThresholdWorld() {
    // Use snap threshold so “close to first point” feels consistent with snapping
    if (this.editor.snapper && typeof this.editor.snapper.getSnapThresholdWorldPx === "function") {
      return this.editor.snapper.getSnapThresholdWorldPx() * 1.25;
    }
    return 10;
  }

  applyAngleConstraint(lastPt, currentPt, stepDeg = 45) {
    const snapper = this.editor?.snapper;
    if (snapper && typeof snapper.applyAngleSnap === "function") {
      return snapper.applyAngleSnap(lastPt, currentPt, { enabled: true, stepDeg });
    }

    const dx = currentPt.x - lastPt.x;
    const dy = currentPt.y - lastPt.y;
    const len = Math.hypot(dx, dy);
    if (!isFinite(len) || len < 1e-6) return currentPt;

    const ang = Math.atan2(dy, dx);
    const stepRad = (stepDeg * Math.PI) / 180;
    const snappedAng = Math.round(ang / stepRad) * stepRad;

    return { x: lastPt.x + Math.cos(snappedAng) * len, y: lastPt.y + Math.sin(snappedAng) * len };
  }

  updateLengthLabel(a, b) {
    const distPxW = distanceWorld(a, b);
    const distMM = pxToMm(this.editor, distPxW);

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

  /**
   * Premium CAD behavior:
   * - Try direct snap FIRST
   * - If angle snap is active, also try constrained snap
   * - Choose whichever is closer to the cursor (screen space)
   */
  _computeCandidate(rawWorld, doAngleSnap) {
    // direct snap
    const direct = snapWorldPointerWithTarget(this.editor, rawWorld);
    const directPt = direct.snapped ? direct.point : rawWorld;

    if (!doAngleSnap || this.points.length < 1) return directPt;

    const last = this.points[this.points.length - 1];
    const constrained = this.applyAngleConstraint(last, rawWorld, 45);
    const constrainedSnap = snapWorldPointerWithTarget(this.editor, constrained);
    const constrainedPt = constrainedSnap.snapped ? constrainedSnap.point : constrained;

    const rawS = worldToScreen(this.canvas, rawWorld);
    const d1 = distPx(worldToScreen(this.canvas, directPt), rawS);
    const d2 = distPx(worldToScreen(this.canvas, constrainedPt), rawS);

    return d2 < d1 ? constrainedPt : directPt;
  }

  onMouseDown(opt) {
    const e = opt && opt.e ? opt.e : null;
    if (e && typeof e.detail === "number" && e.detail >= 2) {
      // Treat double-click as "finish" without leaving the tool.
      const world2 = toWorldPointer(this.editor, opt);
      if (world2 && this.points.length >= 1) {
        const doAngle2 = shouldAngleSnap(this.editor, opt);
        const cand2 = this._computeCandidate(world2, doAngle2);

        // allow close-to-first behavior too
        if (this.points.length >= 3) {
          const first = this.points[0];
          const d = distanceWorld(cand2, first);
          if (d <= this.getCloseThresholdWorld()) {
            this.points.push({ x: first.x, y: first.y });
            this.finishLine();
            return;
          }
        }

        this.points.push(cand2);
      }
      this.finishLine();
      return;
    }

    const world = toWorldPointer(this.editor, opt);
    if (!world) return;

    const doAngle = shouldAngleSnap(this.editor, opt);
    const candidate = this._computeCandidate(world, doAngle);

    // If closing the polyline, snap to first point if close
    if (this.points.length >= 3) {
      const first = this.points[0];
      const d = distanceWorld(candidate, first);
      if (d <= this.getCloseThresholdWorld()) {
        this.points.push({ x: first.x, y: first.y });
        this.finishLine();
        return;
      }
    }

    this.points.push(candidate);

    // Keep a reference line (last segment) for stability
    if (this.points.length >= 2) {
      try {
        this.editor?.snapper?.setReferenceLine?.(
          this.points[this.points.length - 2],
          this.points[this.points.length - 1]
        );
      } catch (err) {}
    }

    // Build/update preview
    if (!this.previewLine) {
      this.previewLine = new fabric.Polyline(this.points, {
        fill: "transparent",
        selectable: false,
        evented: false,
        objectCaching: false,
        strokeUniform: true,
        hasControls: false,
        hasBorders: false,
        perPixelTargetFind: false
      });

      this.previewLine.isToolPreview = true;
      this.previewLine.objectType = "polyline-preview";
      this.previewLine.__styleKey = this.editor.activeStyleType;
      this.previewLine.styleKey = this.editor.activeStyleType;

      applyStyleToObject(this.previewLine, this.editor.activeStyleType, this.editor.currentScale, this.editor.isWireframe);

      this.canvas.add(this.previewLine);
      this.previewLine.bringToFront();
    } else {
      this.previewLine.set({ points: this.points });
      this.previewLine.dirty = true;
    }

    this.canvas.requestRenderAll();
  }

  onMouseMove(opt) {
    if (!this.previewLine || this.points.length < 1) return;

    const world = toWorldPointer(this.editor, opt);
    if (!world) return;

    const doAngle = shouldAngleSnap(this.editor, opt);
    const candidate = this._computeCandidate(world, doAngle);

    const previewPts = this.points.concat([candidate]);
    this.previewLine.set({ points: previewPts });
    this.previewLine.dirty = true;

    // Label shows length of the last segment (last fixed point -> candidate)
    const last = this.points[this.points.length - 1];
    this.updateLengthLabel(last, candidate);

    // Update reference line (last fixed point -> candidate)
    try {
      this.editor?.snapper?.setReferenceLine?.(last, candidate);
    } catch (err) {}

    this.canvas.requestRenderAll();
  }

  handleDoubleClick() {
    const now = performance.now();
    if (now - (this._lastFinishAt || 0) < 200) return;
    this.finishLine();
  }

  onKeyDown(e) {
    if (!e) return;

    if (e.key === "Escape") {
      this.cancel();
      return;
    }

    // Enter finishes polyline
    if (e.key === "Enter") {
      this.finishLine();
      return;
    }

    // Backspace removes last point
    if (e.key === "Backspace") {
      e.preventDefault();
      if (this.points.length > 0) {
        this.points.pop();
      }
      if (this.points.length < 2) {
        this.cancel();
        return;
      }
      if (this.previewLine) {
        this.previewLine.set({ points: this.points });
        this.previewLine.dirty = true;
      }
      this.canvas.requestRenderAll();
    }
  }
}
