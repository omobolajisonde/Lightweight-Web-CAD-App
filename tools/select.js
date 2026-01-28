/**
 * Select tool: click to select one line, box select, drag selected, drag grip handles.
 */

import {
  distance,
  pointToSegmentDistance,
  lineInBox,
  HANDLE_SIZE,
  HIT_TOLERANCE,
} from '../utils/math.js';

/**
 * @param {import('../core/engine.js').Engine} engine
 * @returns {import('./types.js').Tool}
 */
export function createSelectTool(engine) {
  let hoveredLine = null;
  let hoveredHandle = null;
  let activeHandle = null;
  let isSelecting = false;
  let selectStart = null;
  let selectEnd = null;
  let isDragging = false;
  let dragStartWorld = null;
  let dragOriginalLines = null;
  let didJustFinishBoxSelect = false;

  return {
    id: 'select',
    name: 'Select',

    onMouseMove(ctx) {
      const { viewport, worldMouse, polylines, selectedLines, setHoveredLine } = ctx;
      const scale = viewport.getScale();

      setHoveredLine(null);

      if (isDragging) {
        const dx = worldMouse.x - dragStartWorld.x;
        const dy = worldMouse.y - dragStartWorld.y;
        selectedLines.forEach((line, i) => {
          line.forEach((p, j) => {
            p.x = dragOriginalLines[i][j].x + dx;
            p.y = dragOriginalLines[i][j].y + dy;
          });
        });
        return;
      }

      if (activeHandle) {
        activeHandle.point.x = worldMouse.x;
        activeHandle.point.y = worldMouse.y;
        return;
      }

      if (isSelecting) {
        selectEnd = worldMouse;
        return;
      }

      // Hit test handles first
      hoveredHandle = null;
      for (const line of selectedLines) {
        for (const p of line) {
          if (distance(worldMouse, p) < HANDLE_SIZE / scale) {
            hoveredHandle = { line, point: p };
            return;
          }
        }
      }

      // Then hit test segments
      hoveredLine = null;
      for (const line of polylines) {
        for (let i = 0; i < line.length - 1; i++) {
          const d = pointToSegmentDistance(worldMouse, line[i], line[i + 1]);
          if (d < HIT_TOLERANCE / scale) {
            hoveredLine = line;
            setHoveredLine(line);
            return;
          }
        }
      }
      setHoveredLine(null);
    },

    onMouseDown(ctx) {
      const { worldMouse, selectedLines } = ctx;

      if (hoveredHandle) {
        activeHandle = hoveredHandle;
        return true;
      }

      if (hoveredLine && selectedLines.includes(hoveredLine)) {
        isDragging = true;
        dragStartWorld = worldMouse;
        dragOriginalLines = selectedLines.map((line) =>
          line.map((p) => ({ x: p.x, y: p.y }))
        );
        return true;
      }

      isSelecting = true;
      selectStart = worldMouse;
      selectEnd = null;
      return true;
    },

    onMouseUp(ctx) {
      const { polylines, setSelectedLines } = ctx;

      if (activeHandle) {
        activeHandle = null;
        return true;
      }

      if (isDragging) {
        isDragging = false;
        dragOriginalLines = null;
        return true;
      }

      if (!isSelecting || !selectEnd) {
        isSelecting = false;
        return false;
      }

      const box = {
        x1: selectStart.x,
        y1: selectStart.y,
        x2: selectEnd.x,
        y2: selectEnd.y,
      };
      const crossing = box.x2 < box.x1;
      const nextSelection = [];
      for (const line of polylines) {
        if (lineInBox(line, box, crossing)) nextSelection.push(line);
      }
      setSelectedLines(nextSelection);
      isSelecting = false;
      selectStart = null;
      selectEnd = null;
      didJustFinishBoxSelect = true;
      return true;
    },

    onClick(ctx) {
      const { setSelectedLines } = ctx;
      if (didJustFinishBoxSelect) {
        didJustFinishBoxSelect = false;
        return true; // consume click so we don't replace box selection with single-line
      }
      if (isSelecting || isDragging || activeHandle) return false;
      if (hoveredLine) {
        setSelectedLines([hoveredLine]);
        return true;
      }
      return false;
    },

    draw(ctx) {
      if (!isSelecting || !selectEnd) return;
      const { viewport } = ctx;
      const s1 = viewport.toScreen(selectStart);
      const s2 = viewport.toScreen(selectEnd);
      ctx.gfx.strokeStyle = s2.x < s1.x ? 'green' : 'blue';
      ctx.gfx.setLineDash([5, 5]);
      ctx.gfx.strokeRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
      ctx.gfx.setLineDash([]);
    },
  };
}
