/**
 * Arc tool: click 1 = center, click 2 = radius + start angle, click 3 = end angle.
 * Adds an open polyline (arc approximation).
 */

import {
  angleBetween,
  constrainToAngle,
  normalizeAngle,
  snapAngle,
  ANGLE_SNAP_TOLERANCE,
} from '../utils/math.js';

const SEGMENTS = 32;

function arcPoints(cx, cy, r, startRad, endRad) {
  const pts = [];
  let a0 = startRad;
  let a1 = endRad;
  let da = a1 - a0;
  if (da > Math.PI) da -= Math.PI * 2;
  if (da < -Math.PI) da += Math.PI * 2;
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const a = a0 + da * t;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/**
 * @param {{ getState: function, viewport: object }} engine
 * @returns {import('./types.js').Tool}
 */
export function createArcTool(engine) {
  let centre = null;
  let radius = null;
  let startAngleRad = null;

  return {
    id: 'arc',
    name: 'Arc',

    get centre() {
      return centre;
    },
    get radius() {
      return radius;
    },
    get startAngleRad() {
      return startAngleRad;
    },

    isActive() {
      return centre !== null;
    },

    cancel() {
      centre = null;
      radius = null;
      startAngleRad = null;
    },

    activate() {
      centre = null;
      radius = null;
      startAngleRad = null;
    },

    deactivate() {
      centre = null;
      radius = null;
      startAngleRad = null;
    },

    onClick(ctx) {
      const { viewport, getSnap, addPolyline, worldMouse, angleSnapMode, shiftKey } = ctx;
      const useAngleSnap = angleSnapMode === 'always' || (angleSnapMode === 'shift' && shiftKey);

      const snap = getSnap();
      const pt = snap ? snap.point : worldMouse;

      if (!centre) {
        centre = { x: pt.x, y: pt.y };
        return true;
      }

      if (radius == null) {
        let radiusPt = pt;
        if (useAngleSnap) {
          const rawAngle = angleBetween(centre, worldMouse);
          const snapTargets = [0, 90, 180, 270];
          for (let k = -2; k <= 2; k++) snapTargets.push(normalizeAngle(rawAngle + k * 45));
          const snappedAngle = snapAngle(rawAngle, snapTargets, ANGLE_SNAP_TOLERANCE);
          if (snappedAngle !== null) radiusPt = constrainToAngle(centre, worldMouse, snappedAngle);
        }
        const dx = radiusPt.x - centre.x;
        const dy = radiusPt.y - centre.y;
        radius = Math.max(1, Math.hypot(dx, dy));
        startAngleRad = Math.atan2(dy, dx);
        return true;
      }

      let endPt = pt;
      if (useAngleSnap) {
        const rawAngle = angleBetween(centre, worldMouse);
        const snapTargets = [0, 90, 180, 270];
        for (let k = -2; k <= 2; k++) snapTargets.push(normalizeAngle(rawAngle + k * 45));
        const snappedAngle = snapAngle(rawAngle, snapTargets, ANGLE_SNAP_TOLERANCE);
        if (snappedAngle !== null) endPt = constrainToAngle(centre, worldMouse, snappedAngle);
      }
      const dx = endPt.x - centre.x;
      const dy = endPt.y - centre.y;
      const endAngleRad = Math.atan2(dy, dx);
      const pts = arcPoints(centre.x, centre.y, radius, startAngleRad, endAngleRad);
      addPolyline(pts);
      centre = null;
      radius = null;
      startAngleRad = null;
      return true;
    },

    draw(ctx) {
      if (!centre || radius == null || startAngleRad == null) return;
      const { viewport, getSnap, worldMouse, angleSnapMode, shiftKey, gfx } = ctx;
      const useAngleSnap = angleSnapMode === 'always' || (angleSnapMode === 'shift' && shiftKey);
      let endPt = getSnap()?.point ?? worldMouse;
      if (useAngleSnap) {
        const rawAngle = angleBetween(centre, worldMouse);
        const snapTargets = [0, 90, 180, 270];
        for (let k = -2; k <= 2; k++) snapTargets.push(normalizeAngle(rawAngle + k * 45));
        const snappedAngle = snapAngle(rawAngle, snapTargets, ANGLE_SNAP_TOLERANCE);
        if (snappedAngle !== null) endPt = constrainToAngle(centre, worldMouse, snappedAngle);
      }
      const dx = endPt.x - centre.x;
      const dy = endPt.y - centre.y;
      const endAngleRad = Math.atan2(dy, dx);
      const pts = arcPoints(centre.x, centre.y, radius, startAngleRad, endAngleRad);
      gfx.strokeStyle = 'rgba(0,0,0,0.5)';
      gfx.lineWidth = 1;
      gfx.beginPath();
      pts.forEach((p, i) => {
        const s = viewport.toScreen(p);
        if (i === 0) gfx.moveTo(s.x, s.y);
        else gfx.lineTo(s.x, s.y);
      });
      gfx.stroke();
    },
  };
}
