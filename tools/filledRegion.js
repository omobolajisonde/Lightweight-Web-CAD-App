/**
 * Filled Region tool: click to add vertices, double-click or click first point to close.
 * Adds a closed polyline; fill can be applied via Selection UI.
 */

import {
  distance,
  CLOSE_LOOP_THRESHOLD,
  angleBetween,
  snapAngle,
  constrainToAngle,
  normalizeAngle,
  ANGLE_SNAP_TOLERANCE,
} from '../utils/math.js';

/**
 * @param {{ getState: function, viewport: object }} engine
 * @returns {import('./types.js').Tool}
 */
export function createFilledRegionTool(engine) {
  let current = [];

  return {
    id: 'filledRegion',
    name: 'Filled Region',

    getCurrentPoints() {
      return current;
    },

    cancel() {
      current = [];
    },

    activate() {
      current = [];
    },

    deactivate() {
      current = [];
    },

    /** Returns closed points array to add, or null. Engine should add them. */
    finish() {
      if (current.length < 3) {
        current = [];
        return null;
      }
      const pts = current.map((p) => ({ x: p.x, y: p.y }));
      if (distance(pts[0], pts[pts.length - 1]) > 1) {
        pts.push({ x: pts[0].x, y: pts[0].y });
      }
      current = [];
      return pts;
    },

    onClick(ctx) {
      const { viewport, getSnap, addPolyline, setSelectedLines, worldMouse, angleSnapMode, shiftKey } = ctx;
      const scale = viewport.getScale();
      const useAngleSnap = angleSnapMode === 'always' || (angleSnapMode === 'shift' && shiftKey);

      let p = getSnap()?.point ?? worldMouse;
      const snap = getSnap();
      if (!snap && current.length > 0 && useAngleSnap) {
        const last = current[current.length - 1];
        const rawAngle = angleBetween(last, worldMouse);
        const snapTargets = [0, 90, 180, 270];
        if (current.length >= 2) {
          const prevAngle = angleBetween(current[current.length - 2], last);
          snapTargets.push(
            prevAngle,
            normalizeAngle(prevAngle + 45),
            normalizeAngle(prevAngle - 45),
            normalizeAngle(prevAngle + 90),
            normalizeAngle(prevAngle - 90),
            normalizeAngle(prevAngle + 135),
            normalizeAngle(prevAngle - 135),
            normalizeAngle(prevAngle + 180)
          );
        }
        const snappedAngle = snapAngle(rawAngle, snapTargets, ANGLE_SNAP_TOLERANCE);
        if (snappedAngle !== null) p = constrainToAngle(last, worldMouse, snappedAngle);
      } else {
        p = { x: p.x, y: p.y };
      }

      if (current.length >= 2) {
        const first = current[0];
        if (distance(p, first) < CLOSE_LOOP_THRESHOLD / scale) {
          current.push({ x: first.x, y: first.y });
          addPolyline([...current]);
          current = [];
          setSelectedLines([]);
          return true;
        }
      }

      setSelectedLines([]);
      current.push(p);
      return true;
    },

    draw(ctx) {
      const { viewport, mouse, getSnap, gfx, angleSnapMode, shiftKey } = ctx;
      const scale = viewport.getScale();
      const toScreen = viewport.toScreen.bind(viewport);
      const useAngleSnap = angleSnapMode === 'always' || (angleSnapMode === 'shift' && shiftKey);

      const snap = getSnap();
      let worldMouse = snap?.point ?? ctx.worldMouse;
      if (!snap && current.length > 0 && useAngleSnap) {
        const last = current[current.length - 1];
        const rawAngle = angleBetween(last, ctx.worldMouse);
        const snapTargets = [0, 90, 180, 270];
        if (current.length >= 2) {
          const prevAngle = angleBetween(current[current.length - 2], last);
          snapTargets.push(
            prevAngle,
            normalizeAngle(prevAngle + 45),
            normalizeAngle(prevAngle - 45),
            normalizeAngle(prevAngle + 90),
            normalizeAngle(prevAngle - 90),
            normalizeAngle(prevAngle + 135),
            normalizeAngle(prevAngle - 135),
            normalizeAngle(prevAngle + 180)
          );
        }
        const snappedAngle = snapAngle(rawAngle, snapTargets, ANGLE_SNAP_TOLERANCE);
        if (snappedAngle !== null) worldMouse = constrainToAngle(last, ctx.worldMouse, snappedAngle);
      }

      const drawLine = (points) => {
        gfx.beginPath();
        points.forEach((p, i) => {
          const s = toScreen(p);
          if (i === 0) gfx.moveTo(s.x, s.y);
          else gfx.lineTo(s.x, s.y);
        });
        gfx.stroke();
      };

      if (current.length >= 2) {
        const first = current[0];
        if (distance(worldMouse, first) < CLOSE_LOOP_THRESHOLD / scale) {
          const s = toScreen(first);
          gfx.strokeStyle = 'gold';
          gfx.lineWidth = 2;
          gfx.beginPath();
          gfx.arc(s.x, s.y, 10, 0, Math.PI * 2);
          gfx.stroke();
        }
      }

      if (current.length > 0) {
        const last = current[current.length - 1];
        gfx.strokeStyle = 'black';
        gfx.lineWidth = 1;
        drawLine([...current, worldMouse]);
        const len = distance(last, worldMouse).toFixed(1);
        gfx.fillStyle = 'black';
        gfx.font = '12px Arial';
        gfx.fillText(`${len}`, mouse.x + 10, mouse.y - 10);
      }
    },
  };
}
