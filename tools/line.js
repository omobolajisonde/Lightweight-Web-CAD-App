/**
 * Line (polyline) tool: click to add points, click near first point to close.
 * Supports angle snapping: global H/V axes and 45°/90° relative to previous segment.
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
 * @param {import('../core/engine.js').Engine} engine
 * @returns {import('./types.js').Tool}
 */
export function createLineTool(engine) {
  let current = [];

  return {
    id: 'line',
    name: 'Line',

    deactivate() {
      current = [];
    },

    onClick(ctx) {
      const { viewport, getSnap, addPolyline, setSelectedLines, worldMouse } = ctx;
      const scale = viewport.getScale();
      
      // Get snapped point (endpoint/midpoint/grid/angle)
      let p = getSnap()?.point ?? worldMouse;
      
      // Apply angle snapping if no geometric snap (same logic as draw)
      const snap = getSnap();
      if (!snap && current.length > 0) {
        const last = current[current.length - 1];
        const rawAngle = angleBetween(last, worldMouse);
        
        const snapTargets = [0, 90, 180, 270]; // Global axes
        if (current.length >= 2) {
          const prevAngle = angleBetween(current[current.length - 2], last);
          const relativeAngles = [
            prevAngle,
            normalizeAngle(prevAngle + 45),
            normalizeAngle(prevAngle - 45),
            normalizeAngle(prevAngle + 90),
            normalizeAngle(prevAngle - 90),
            normalizeAngle(prevAngle + 135),
            normalizeAngle(prevAngle - 135),
            normalizeAngle(prevAngle + 180),
          ];
          snapTargets.push(...relativeAngles);
        }
        
        const snappedAngle = snapAngle(rawAngle, snapTargets, ANGLE_SNAP_TOLERANCE);
        if (snappedAngle !== null) {
          p = constrainToAngle(last, worldMouse, snappedAngle);
        } else {
          p = { x: worldMouse.x, y: worldMouse.y };
        }
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
      const { viewport, mouse, getSnap, polylines, selectedLines } = ctx;
      const scale = viewport.getScale();
      const toScreen = viewport.toScreen.bind(viewport);
      
      // Get base mouse position (may be snapped to endpoint/midpoint/grid)
      const snap = getSnap();
      let worldMouse = snap?.point ?? ctx.worldMouse;
      
      // Apply angle snapping if no geometric snap is active
      if (!snap && current.length > 0) {
        const last = current[current.length - 1];
        const rawAngle = angleBetween(last, ctx.worldMouse);
        
        // Build snap targets: global axes + relative angles
        const snapTargets = [0, 90, 180, 270]; // Global horizontal/vertical
        
        // If we have at least one complete segment (2+ points), add relative angles
        if (current.length >= 2) {
          const prevAngle = angleBetween(current[current.length - 2], last);
          // Add relative angles: same, ±45°, ±90°, ±135°, 180°
          const relativeAngles = [
            prevAngle, // Same direction
            normalizeAngle(prevAngle + 45),
            normalizeAngle(prevAngle - 45),
            normalizeAngle(prevAngle + 90),
            normalizeAngle(prevAngle - 90),
            normalizeAngle(prevAngle + 135),
            normalizeAngle(prevAngle - 135),
            normalizeAngle(prevAngle + 180),
          ];
          snapTargets.push(...relativeAngles);
        }
        
        const snappedAngle = snapAngle(rawAngle, snapTargets, ANGLE_SNAP_TOLERANCE);
        if (snappedAngle !== null) {
          worldMouse = constrainToAngle(last, ctx.worldMouse, snappedAngle);
        }
      }

      const gfx = ctx.gfx;
      const drawLine = (points) => {
        gfx.beginPath();
        points.forEach((p, i) => {
          const s = toScreen(p);
          if (i === 0) gfx.moveTo(s.x, s.y);
          else gfx.lineTo(s.x, s.y);
        });
        gfx.stroke();
      };

      // Highlight close-shape affordance
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

      // Preview segment
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

    getCurrentPoints() {
      return current;
    },
  };
}
