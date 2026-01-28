/**
 * Line (polyline) tool: click to add points, click near first point to close.
 */

import { distance, CLOSE_LOOP_THRESHOLD } from '../utils/math.js';

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
      let p = getSnap()?.point ?? worldMouse;
      p = { x: p.x, y: p.y };

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
      const worldMouse = getSnap()?.point ?? ctx.worldMouse;

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
