/**
 * Circle tool: first click = center, second click = radius. Adds a closed polyline (circle approximation).
 */

import { distance } from '../utils/math.js';
import { angleBetween, constrainToAngle, normalizeAngle, snapAngle, ANGLE_SNAP_TOLERANCE } from '../utils/math.js';

const SEGMENTS = 64;

function circlePoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/**
 * @param {{ getState: function, viewport: object }} engine
 * @returns {import('./types.js').Tool}
 */
export function createCircleTool(engine) {
  let centre = null;

  return {
    id: 'circle',
    name: 'Circle',

    get centre() {
      return centre;
    },

    isActive() {
      return centre !== null;
    },

    cancel() {
      centre = null;
    },

    activate() {
      centre = null;
    },

    deactivate() {
      centre = null;
    },

    onClick(ctx) {
      const { viewport, getSnap, addPolyline, worldMouse, angleSnapMode, shiftKey } = ctx;
      const scale = viewport.getScale();
      const useAngleSnap = angleSnapMode === 'always' || (angleSnapMode === 'shift' && shiftKey);

      if (!centre) {
        const snap = getSnap();
        centre = snap ? { x: snap.point.x, y: snap.point.y } : { x: worldMouse.x, y: worldMouse.y };
        return true;
      }

      let radiusPt = getSnap()?.point ?? worldMouse;
      if (useAngleSnap) {
        const rawAngle = angleBetween(centre, worldMouse);
        const stepDeg = 45;
        const snapTargets = [0, 90, 180, 270];
        for (let k = -2; k <= 2; k++) snapTargets.push(normalizeAngle(rawAngle + k * stepDeg));
        const snappedAngle = snapAngle(rawAngle, snapTargets, ANGLE_SNAP_TOLERANCE);
        if (snappedAngle !== null) radiusPt = constrainToAngle(centre, worldMouse, snappedAngle);
      }

      const dx = radiusPt.x - centre.x;
      const dy = radiusPt.y - centre.y;
      const r = Math.max(1, Math.hypot(dx, dy));
      const pts = circlePoints(centre.x, centre.y, r);
      addPolyline(pts);
      centre = null;
      return true;
    },

    draw(ctx) {
      if (!centre) return;
      const { viewport, getSnap, worldMouse, angleSnapMode, shiftKey, gfx } = ctx;
      const useAngleSnap = angleSnapMode === 'always' || (angleSnapMode === 'shift' && shiftKey);
      let radiusPt = getSnap()?.point ?? worldMouse;
      if (useAngleSnap) {
        const rawAngle = angleBetween(centre, worldMouse);
        const stepDeg = 45;
        const snapTargets = [0, 90, 180, 270];
        for (let k = -2; k <= 2; k++) snapTargets.push(normalizeAngle(rawAngle + k * stepDeg));
        const snappedAngle = snapAngle(rawAngle, snapTargets, ANGLE_SNAP_TOLERANCE);
        if (snappedAngle !== null) radiusPt = constrainToAngle(centre, worldMouse, snappedAngle);
      }
      const dx = radiusPt.x - centre.x;
      const dy = radiusPt.y - centre.y;
      const r = Math.max(1, Math.hypot(dx, dy));
      const pts = circlePoints(centre.x, centre.y, r);
      gfx.strokeStyle = 'rgba(0,0,0,0.5)';
      gfx.lineWidth = 1;
      gfx.setLineDash?.([]);
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
