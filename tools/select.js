/**
 * Select tool: click to select one line, box select, drag selected, drag grip handles.
 */

import {
  distance,
  pointToSegmentDistance,
  lineInBox,
  segmentIntersectsBox,
  HANDLE_SIZE,
  HIT_TOLERANCE,
} from '../utils/math.js';

/**
 * @param {import('../core/engine.js').Engine} engine
 * @returns {import('./types.js').Tool}
 */
export function createSelectTool(engine) {
  let hoveredLine = null;
  let hoveredSegment = null; // { polyline, segmentIndex }
  let hoveredHandle = null;
  let activeHandle = null;
  let isSelecting = false;
  let selectStart = null;
  let selectEnd = null;
  let isDragging = false;
  let dragStartWorld = null;
  let dragOriginalSegments = null; // Store original positions of selected segments
  let didJustFinishBoxSelect = false;

  return {
    id: 'select',
    name: 'Select',

    onMouseMove(ctx) {
      const { viewport, worldMouse, polylines, selectedSegments, setHoveredLine, setHoveredSegment } = ctx;
      const scale = viewport.getScale();

      setHoveredLine(null);
      setHoveredSegment(null);

      if (isDragging) {
        const dx = worldMouse.x - dragStartWorld.x;
        const dy = worldMouse.y - dragStartWorld.y;
        // Move endpoints of selected segments
        selectedSegments.forEach((seg, i) => {
          const orig = dragOriginalSegments[i];
          const { polyline, segmentIndex } = seg;
          if (segmentIndex < polyline.length - 1) {
            polyline[segmentIndex].x = orig.start.x + dx;
            polyline[segmentIndex].y = orig.start.y + dy;
            polyline[segmentIndex + 1].x = orig.end.x + dx;
            polyline[segmentIndex + 1].y = orig.end.y + dy;
          }
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

      // Hit test handles first (from selected segments)
      hoveredHandle = null;
      const selectedPoints = new Set();
      selectedSegments.forEach(({ polyline, segmentIndex }) => {
        if (segmentIndex < polyline.length - 1) {
          selectedPoints.add(polyline[segmentIndex]);
          selectedPoints.add(polyline[segmentIndex + 1]);
        }
      });
      for (const p of selectedPoints) {
        if (distance(worldMouse, p) < HANDLE_SIZE / scale) {
          hoveredHandle = { point: p };
          return;
        }
      }

      // Then hit test segments
      hoveredSegment = null;
      for (const line of polylines) {
        for (let i = 0; i < line.length - 1; i++) {
          const d = pointToSegmentDistance(worldMouse, line[i], line[i + 1]);
          if (d < HIT_TOLERANCE / scale) {
            hoveredSegment = { polyline: line, segmentIndex: i };
            setHoveredSegment(hoveredSegment);
            return;
          }
        }
      }
      setHoveredSegment(null);
    },

    onMouseDown(ctx) {
      const { worldMouse, selectedSegments } = ctx;

      if (hoveredHandle) {
        activeHandle = hoveredHandle;
        return true;
      }

      if (hoveredSegment && selectedSegments.some((s) => s.polyline === hoveredSegment.polyline && s.segmentIndex === hoveredSegment.segmentIndex)) {
        isDragging = true;
        dragStartWorld = worldMouse;
        dragOriginalSegments = selectedSegments.map(({ polyline, segmentIndex }) => ({
          start: { x: polyline[segmentIndex].x, y: polyline[segmentIndex].y },
          end: { x: polyline[segmentIndex + 1].x, y: polyline[segmentIndex + 1].y },
        }));
        return true;
      }

      isSelecting = true;
      selectStart = worldMouse;
      selectEnd = null;
      return true;
    },

    onMouseUp(ctx) {
      const { polylines, setSelectedSegments } = ctx;

      if (activeHandle) {
        activeHandle = null;
        return true;
      }

      if (isDragging) {
        isDragging = false;
        dragOriginalSegments = null;
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
      // Crossing selection: right-to-left OR bottom-to-top (CAD standard)
      const crossing = box.x2 < box.x1 || box.y2 < box.y1;
      const nextSelection = [];
      
      if (crossing) {
        // Crossing selection: select individual segments that intersect the box
        // This is CAD-standard behavior - back-select only touches what it crosses
        for (const line of polylines) {
          for (let i = 0; i < line.length - 1; i++) {
            if (segmentIntersectsBox(line[i], line[i + 1], box)) {
              nextSelection.push({ polyline: line, segmentIndex: i });
            }
          }
        }
      } else {
        // Window selection: select all segments of polylines where all points are inside
        for (const line of polylines) {
          if (lineInBox(line, box, false)) {
            // Select all segments of this polyline
            for (let i = 0; i < line.length - 1; i++) {
              nextSelection.push({ polyline: line, segmentIndex: i });
            }
          }
        }
      }
      
      setSelectedSegments(nextSelection);
      isSelecting = false;
      selectStart = null;
      selectEnd = null;
      didJustFinishBoxSelect = true;
      return true;
    },

    onClick(ctx) {
      const { setSelectedSegments, selectedSegments, shiftKey } = ctx;
      if (didJustFinishBoxSelect) {
        didJustFinishBoxSelect = false;
        return true; // consume click so we don't replace box selection with single-segment
      }
      if (isSelecting || isDragging || activeHandle) return false;
      if (hoveredSegment) {
        if (shiftKey) {
          // Shift+click: toggle selection (add if not selected, remove if selected)
          const isAlreadySelected = selectedSegments.some(
            (s) =>
              s.polyline === hoveredSegment.polyline &&
              s.segmentIndex === hoveredSegment.segmentIndex
          );
          if (isAlreadySelected) {
            // Remove from selection
            const newSelection = selectedSegments.filter(
              (s) =>
                !(
                  s.polyline === hoveredSegment.polyline &&
                  s.segmentIndex === hoveredSegment.segmentIndex
                )
            );
            setSelectedSegments(newSelection);
          } else {
            // Add to selection
            setSelectedSegments([...selectedSegments, hoveredSegment]);
          }
        } else {
          // Normal click: replace selection
          setSelectedSegments([hoveredSegment]);
        }
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
