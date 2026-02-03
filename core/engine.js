/**
 * Engine: canvas, document state (polylines, selection), snapping, tool delegation, and render loop.
 */

import { createViewport } from './viewport.js';
import { createTools } from '../tools/index.js';
import { buildStructuredDrawing } from './export.js';
import { renderHatch } from '../patterns/hatch.js';
import { getSheetLayout, hitTestSheet, getSheetsBounds } from './sheetLayout.js';
import { rotateViewByAnimated } from './rotation.js';
import {
  initKeyRefModel,
  drawBuildingGridlines as drawBuildingGridlinesModule,
  getKeyRefHandlePositions,
  applyKeyRefDrag,
} from './buildingGridlines.js';
import {
  distance,
  SNAP_DIST,
  HANDLE_SIZE,
  GRID_SPACING,
  snapToGrid,
  distanceToGrid,
  isClosedPolyline,
  polygonArea,
  MM2_TO_M2,
} from '../utils/math.js';

/**
 * @param {HTMLCanvasElement} canvasEl
 * @param {{ initialScale?: number, initialOffset?: {x,y}, onToolChange?: (id: string) => void }} options
 */
export function createEngine(canvasEl, options = {}) {
  const viewport = createViewport(canvasEl, options);
  const ctx = viewport.ctx;

  const state = {
    polylines: [],
    polylineFillColors: new Map(), // Map<polyline, fillColor> for solid fills
    polylineHatch: new Map(), // Map<polyline, { pattern: string, color: string }>
    selectedSegments: [], // [{ polyline, segmentIndex }, ...] for segment-level selection
    hoveredLine: null,
    hoveredSegment: null, // { polyline, segmentIndex } for segment hover
    mouse: { x: 0, y: 0 },
    snapPoint: null,
    snapType: null,
    gridEnabled: true,
    gridSpacing: options.gridSpacing ?? GRID_SPACING,
    angleSnapMode: 'always', // 'off' | 'shift' | 'always'
    buildingGridlinesEnabled: true,
    panning: false,
    panStart: null, // { screenX, screenY, offsetX, offsetY }
    shiftKey: false,
    draggingKeyRef: null, // { key, isSecondary } when dragging alignment handle
    multiViewEnabled: true,
    sheets: null,
    radiusMm: 0,
    activeViewId: 'plan',
  };

  const layout = getSheetLayout();
  state.sheets = layout.sheets;
  state.radiusMm = layout.radiusMm;
  state.keyRefModel = initKeyRefModel(layout.sheets);
  state.paperEdgePadMm = 6;

  const tools = createTools({ getState: () => state, viewport });
  const toolsById = Object.fromEntries(tools.map((t) => [t.id, t]));
  let currentToolId = 'select';

  function getSnap() {
    if (!state.snapPoint) return null;
    return { point: state.snapPoint, type: state.snapType };
  }

  function findSnap(worldMouse) {
    state.snapPoint = null;
    state.snapType = null;
    const scale = viewport.getScale();

    // When drawing a polyline (line or filledRegion), prefer snapping to first point for closing
    if (currentToolId === 'line' || currentToolId === 'filledRegion') {
      const lineTool = toolsById[currentToolId === 'filledRegion' ? 'filledRegion' : 'line'];
      const current = lineTool?.getCurrentPoints?.() ?? [];
      if (current.length >= 2) {
        const first = current[0];
        if (distance(worldMouse, first) < SNAP_DIST / scale) {
          state.snapPoint = first;
          state.snapType = 'Start';
          return getSnap();
        }
      }
    }

    for (const line of state.polylines) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i];
        const b = line[i + 1];

        if (distance(worldMouse, a) < SNAP_DIST / scale) {
          state.snapPoint = a;
          state.snapType = 'End';
          return getSnap();
        }
        if (distance(worldMouse, b) < SNAP_DIST / scale) {
          state.snapPoint = b;
          state.snapType = 'End';
          return getSnap();
        }

        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (distance(worldMouse, mid) < SNAP_DIST / scale) {
          state.snapPoint = mid;
          state.snapType = 'Mid';
          return getSnap();
        }
      }
    }

    // Phase 2: grid snapping (lowest priority)
    if (state.gridEnabled && distanceToGrid(worldMouse, state.gridSpacing) < SNAP_DIST / scale) {
      state.snapPoint = snapToGrid(worldMouse, state.gridSpacing);
      state.snapType = 'Grid';
      return getSnap();
    }
    return null;
  }

  function buildToolContext(worldMouse) {
    return {
      viewport,
      gfx: ctx,
      mouse: state.mouse,
      worldMouse,
      polylines: state.polylines,
      selectedSegments: state.selectedSegments,
      angleSnapMode: state.angleSnapMode,
      shiftKey: state.shiftKey,
      setSelectedSegments(segments) {
        state.selectedSegments.length = 0;
        state.selectedSegments.push(...segments);
      },
      setSelectedLines(lines) {
        // Legacy: convert polylines to all their segments
        const segments = [];
        for (const line of lines) {
          for (let i = 0; i < line.length - 1; i++) {
            segments.push({ polyline: line, segmentIndex: i });
          }
        }
        state.selectedSegments.length = 0;
        state.selectedSegments.push(...segments);
      },
      setHoveredLine(line) {
        state.hoveredLine = line;
        state.hoveredSegment = null;
      },
      setHoveredSegment(segment) {
        state.hoveredSegment = segment;
        state.hoveredLine = segment?.polyline ?? null;
      },
      getSnap,
      addPolyline(points) {
        state.polylines.push(points);
      },
      setPolylineFillColor(polyline, color) {
        if (color) {
          state.polylineFillColors.set(polyline, color);
        } else {
          state.polylineFillColors.delete(polyline);
        }
      },
      getPolylineFillColor(polyline) {
        return state.polylineFillColors.get(polyline) || null;
      },
      removePolylines(lines) {
        state.polylines = state.polylines.filter((l) => !lines.includes(l));
        state.selectedSegments = state.selectedSegments.filter(
          (s) => !lines.includes(s.polyline)
        );
        lines.forEach((line) => {
          state.polylineFillColors.delete(line);
          state.polylineHatch.delete(line);
        });
      },
    };
  }

  function getCurrentTool() {
    return toolsById[currentToolId];
  }

  function setTool(id) {
    if (toolsById[id] == null) return;
    if (id === currentToolId) return;
    const prev = toolsById[currentToolId];
    if (prev?.deactivate) prev.deactivate();
    currentToolId = id;
    const next = toolsById[currentToolId];
    if (next?.activate) next.activate();
    options.onToolChange?.(currentToolId);
  }

  viewport.installWheelHandler();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') state.shiftKey = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') state.shiftKey = false;
  });

  function hitTestKeyRefHandle(screenX, screenY) {
    if (!state.buildingGridlinesEnabled || !state.sheets || !state.keyRefModel) return null;
    const positions = getKeyRefHandlePositions(
      state.sheets,
      state.keyRefModel,
      state.paperEdgePadMm
    );
    const scale = viewport.getScale();
    const radPx = Math.max(12, 9.5 * scale);
    const mouse = { x: screenX, y: screenY };
    for (const h of positions) {
      const s = viewport.toScreen({ x: h.x, y: h.y });
      if (distance(mouse, s) <= radPx) return { key: h.key, isSecondary: h.isSecondary };
    }
    return null;
  }

  canvasEl.addEventListener('mousemove', (e) => {
    state.mouse.x = e.offsetX;
    state.mouse.y = e.offsetY;
    if (state.panning && state.panStart) {
      const dx = e.offsetX - state.panStart.screenX;
      const dy = e.offsetY - state.panStart.screenY;
      viewport.setOffset({
        x: state.panStart.offsetX + dx,
        y: state.panStart.offsetY + dy,
      });
      return;
    }
    if (state.draggingKeyRef) {
      const worldMouse = viewport.toWorld(state.mouse);
      applyKeyRefDrag(
        state.draggingKeyRef.key,
        worldMouse.x,
        worldMouse.y,
        state.keyRefModel,
        state.sheets,
        state.paperEdgePadMm
      );
      canvasEl.style.cursor = 'move';
      return;
    }

    // Hover feedback for draggable alignment handles
    const handleHover = hitTestKeyRefHandle(e.offsetX, e.offsetY);
    if (handleHover) {
      canvasEl.style.cursor = 'move';
    } else {
      canvasEl.style.cursor = 'default';
    }
    const worldMouse = viewport.toWorld(state.mouse);
    findSnap(worldMouse);

    const tool = getCurrentTool();
    const toolCtx = buildToolContext(worldMouse);
    if (tool.onMouseMove) tool.onMouseMove(toolCtx);
  });

  document.body.addEventListener('keydown', (e) => {
    if (e.code === 'Space') document.body.dataset.spaceDown = '1';
  });
  document.body.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      document.body.dataset.spaceDown = '';
      if (state.panning) {
        state.panning = false;
        state.panStart = null;
      }
    }
  });

  canvasEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (document.body.dataset.spaceDown === '1') {
      state.panning = true;
      state.panStart = {
        screenX: e.offsetX,
        screenY: e.offsetY,
        offsetX: viewport.getOffset().x,
        offsetY: viewport.getOffset().y,
      };
      e.preventDefault();
      return;
    }
    const handleHit = hitTestKeyRefHandle(e.offsetX, e.offsetY);
    if (handleHit) {
      state.draggingKeyRef = handleHit;
      canvasEl.style.cursor = 'move';
      return;
    }
    const worldMouse = viewport.toWorld({ x: e.offsetX, y: e.offsetY });
    const tool = getCurrentTool();
    const toolCtx = buildToolContext(worldMouse);
    if (tool.onMouseDown && tool.onMouseDown(toolCtx)) return;
  });

  function endPanOrKeyRefDrag() {
    if (state.panning) {
      state.panning = false;
      state.panStart = null;
      return true;
    }
    if (state.draggingKeyRef) {
      state.draggingKeyRef = null;
      canvasEl.style.cursor = 'default';
      return true;
    }
    return false;
  }

  canvasEl.addEventListener('mouseup', () => {
    if (endPanOrKeyRefDrag()) return;
    const worldMouse = viewport.toWorld(state.mouse);
    const tool = getCurrentTool();
    const toolCtx = buildToolContext(worldMouse);
    if (tool.onMouseUp && tool.onMouseUp(toolCtx)) return;
  });

  window.addEventListener('mouseup', () => {
    endPanOrKeyRefDrag();
  });

  canvasEl.addEventListener('click', (e) => {
    const worldMouse = viewport.toWorld({ x: e.offsetX, y: e.offsetY });
    const tool = getCurrentTool();
    const toolCtx = buildToolContext(worldMouse);
    toolCtx.shiftKey = e.shiftKey; // Pass shift key state for multi-select
    if (tool.onClick && tool.onClick(toolCtx)) return;
    if (state.panning) return;
    if (state.sheets && state.multiViewEnabled) {
      const hit = hitTestSheet(state.sheets, worldMouse);
      if (hit && hit !== state.activeViewId) {
        state.activeViewId = hit;
        options.onActiveViewChange?.(state.activeViewId);
      }
    }
  });

  canvasEl.addEventListener('dblclick', () => {
    if (currentToolId === 'filledRegion') {
      const filledTool = toolsById['filledRegion'];
      const pts = filledTool?.finish?.();
      if (pts && pts.length >= 3) state.polylines.push(pts);
      return;
    }
    const lineTool = toolsById['line'];
    if (currentToolId !== 'line' || !lineTool) return;
    const current = lineTool.getCurrentPoints?.() ?? [];
    if (current.length >= 2) {
      state.polylines.push(current.map((p) => ({ x: p.x, y: p.y })));
      lineTool.deactivate?.();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const lineTool = toolsById['line'];
      const filledTool = toolsById['filledRegion'];
      const circleTool = toolsById['circle'];
      const arcTool = toolsById['arc'];
      const currentLine = lineTool?.getCurrentPoints?.() ?? [];
      const currentFilled = filledTool?.getCurrentPoints?.() ?? [];
      const circleActive = circleTool?.isActive?.() ?? false;
      const arcActive = arcTool?.isActive?.() ?? false;

      if (circleActive && circleTool.cancel) {
        circleTool.cancel();
        return;
      }
      if (arcActive && arcTool.cancel) {
        arcTool.cancel();
        return;
      }
      if (currentFilled.length > 0 && filledTool?.cancel) {
        filledTool.cancel();
        return;
      }
      if (currentLine.length >= 2) {
        state.polylines.push(currentLine.map((p) => ({ x: p.x, y: p.y })));
        lineTool.deactivate?.();
        return;
      }
      if (currentLine.length === 1) {
        lineTool?.deactivate?.();
        return;
      }
      if (state.selectedSegments.length > 0) {
        state.selectedSegments.length = 0;
        return;
      }
      if (currentToolId === 'line') {
        setTool('select');
        return;
      }
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedSegments.length > 0) {
      // Delete selected segments by removing their polylines (for now - could split polylines later)
      const polylinesToRemove = [...new Set(state.selectedSegments.map((s) => s.polyline))];
      state.polylines = state.polylines.filter((l) => !polylinesToRemove.includes(l));
      state.selectedSegments.length = 0;
    }
  });

  function drawLine(points, strokeStyle, lineWidth) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    points.forEach((p, i) => {
      const s = viewport.toScreen(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
  }

  const SHEET_GRID_SPACING_MM = 10; // 10mm grid inside sheets (1m at 1:100)

  function drawSheets() {
    if (!state.sheets || !state.multiViewEnabled) return;
    const pad = state.paperEdgePadMm ?? 6;
    for (const id of ['plan', 'front', 'back', 'left', 'right']) {
      const s = state.sheets[id];
      if (!s) continue;
      const left = s.paperLeftMm;
      const top = s.paperTopMm;
      const w = s.paperW;
      const h = s.paperH;
      const tl = viewport.toScreen({ x: left, y: top });
      const tr = viewport.toScreen({ x: left + w, y: top });
      const br = viewport.toScreen({ x: left + w, y: top + h });
      const bl = viewport.toScreen({ x: left, y: top + h });
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = 'rgba(0,0,0,0.001)';
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fill();
      const labelY = s.topMm - 20;
      const labelPos = viewport.toScreen({ x: s.centre.x, y: labelY });
      ctx.fillStyle = '#666';
      ctx.font = '14px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, labelPos.x, labelPos.y);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  function drawSheetGrids() {
    if (!state.sheets || !state.multiViewEnabled || !state.gridEnabled) return;
    const spacing = SHEET_GRID_SPACING_MM;
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (const id of ['plan', 'front', 'back', 'left', 'right']) {
      const s = state.sheets[id];
      if (!s) continue;
      const left = s.leftMm;
      const top = s.topMm;
      const right = s.rightMm;
      const bottom = s.bottomMm;
      const minX = Math.ceil(left / spacing) * spacing;
      const maxX = Math.floor(right / spacing) * spacing;
      const minY = Math.ceil(top / spacing) * spacing;
      const maxY = Math.floor(bottom / spacing) * spacing;
      for (let x = minX; x <= maxX; x += spacing) {
        const p1 = viewport.toScreen({ x, y: top });
        const p2 = viewport.toScreen({ x, y: bottom });
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      for (let y = minY; y <= maxY; y += spacing) {
        const p1 = viewport.toScreen({ x: left, y });
        const p2 = viewport.toScreen({ x: right, y });
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  }

  function drawKeyRefs() {
    if (!state.sheets || !state.buildingGridlinesEnabled || !state.multiViewEnabled || !state.keyRefModel) return;
    drawBuildingGridlinesModule(ctx, viewport, state.sheets, state.keyRefModel, state.paperEdgePadMm);
  }

  function drawFilledPolygon(points, fillColor) {
    if (points.length < 3) return;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    points.forEach((p, i) => {
      const s = viewport.toScreen(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    const scale = viewport.getScale();

    if (state.multiViewEnabled) drawSheets();
    if (state.multiViewEnabled && state.gridEnabled) drawSheetGrids();
    if (state.buildingGridlinesEnabled) drawKeyRefs();

    // Draw filled / hatched regions first (behind strokes)
    state.polylines.forEach((line) => {
      if (!isClosedPolyline(line)) return;
      const hatch = state.polylineHatch.get(line);
      const fillColor = state.polylineFillColors.get(line);

      if (hatch && hatch.pattern && hatch.color) {
        if (hatch.pattern === 'SOLID') {
          drawFilledPolygon(line, hatch.color);
        } else {
          renderHatch(ctx, viewport, line, hatch.pattern, hatch.color);
        }
      } else if (fillColor) {
        // Legacy solid fill
        drawFilledPolygon(line, fillColor);
      }
    });

    // Draw all polylines (strokes)
    state.polylines.forEach((line) => {
      drawLine(line, 'black', 1);
    });

    // Highlight hovered segment
    if (state.hoveredSegment) {
      const { polyline, segmentIndex } = state.hoveredSegment;
      if (segmentIndex < polyline.length - 1) {
        drawLine([polyline[segmentIndex], polyline[segmentIndex + 1]], 'blue', 2);
      }
    } else if (state.hoveredLine) {
      drawLine(state.hoveredLine, 'blue', 2);
    }

    // Highlight selected segments
    const selectedPoints = new Set();
    state.selectedSegments.forEach(({ polyline, segmentIndex }) => {
      if (segmentIndex < polyline.length - 1) {
        drawLine([polyline[segmentIndex], polyline[segmentIndex + 1]], 'red', 2);
        selectedPoints.add(polyline[segmentIndex]);
        selectedPoints.add(polyline[segmentIndex + 1]);
      }
    });

    // Draw handles for selected segment endpoints
    selectedPoints.forEach((p) => {
      const s = viewport.toScreen(p);
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'red';
      ctx.beginPath();
      ctx.arc(s.x, s.y, HANDLE_SIZE, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    const worldMouse = viewport.toWorld(state.mouse);
    const toolCtx = buildToolContext(worldMouse);
    const tool = getCurrentTool();
    if (tool.draw) tool.draw(toolCtx);

    if (state.snapPoint) {
      const s = viewport.toScreen(state.snapPoint);
      ctx.fillStyle = 'orange';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fill();
      if (state.snapType) {
        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.fillText(state.snapType, state.mouse.x + 15, state.mouse.y - 15);
      }
    }

    ctx.strokeStyle = '#ccc';
    ctx.beginPath();
    ctx.moveTo(state.mouse.x, 0);
    ctx.lineTo(state.mouse.x, canvasEl.height);
    ctx.moveTo(0, state.mouse.y);
    ctx.lineTo(canvasEl.width, state.mouse.y);
    ctx.stroke();

    requestAnimationFrame(draw);
  }

  draw();

  /** Phase 1: Export drawing to structured JSON */
  function exportDrawing() {
    const structured = buildStructuredDrawing(state.polylines);
    return JSON.stringify(structured, null, 2);
  }

  /** Phase 2: When exactly one closed polygon is selected, return area in m²; otherwise null */
  function getSelectionAreaInfo() {
    // Check if all selected segments form a single closed polyline
    const uniquePolylines = [...new Set(state.selectedSegments.map((s) => s.polyline))];
    if (uniquePolylines.length !== 1) return null;
    const line = uniquePolylines[0];
    if (!isClosedPolyline(line)) return null;
    const areaMm2 = polygonArea(line);
    const areaM2 = areaMm2 * MM2_TO_M2;
    return { area: areaM2 };
  }

  function setGridEnabled(enabled) {
    state.gridEnabled = !!enabled;
  }

  function getGridEnabled() {
    return state.gridEnabled;
  }

  function getBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const line of state.polylines) {
      for (const p of line) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    if (minX === Infinity && state.multiViewEnabled && state.sheets) {
      const b = getSheetsBounds(state.sheets, state.radiusMm);
      return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
    }
    if (minX === Infinity) {
      const c = viewport.toWorld({ x: canvasEl.width / 2, y: canvasEl.height / 2 });
      const pad = 10000;
      return { minX: c.x - pad, minY: c.y - pad, maxX: c.x + pad, maxY: c.y + pad };
    }
    return { minX, minY, maxX, maxY };
  }

  function fitToContent(padding = 40) {
    viewport.fitToBounds(getBounds(), padding);
  }

  function fitToSheets(padding = 40) {
    if (!state.sheets) return;
    const b = getSheetsBounds(state.sheets, state.radiusMm);
    viewport.fitToBounds(b, padding);
  }

  function getActiveViewId() {
    return state.activeViewId;
  }

  function setActiveViewId(id) {
    if (state.sheets && state.sheets[id]) state.activeViewId = id;
  }

  function rotateView(deltaDeg = 90) {
    const pivot = state.sheets?.plan?.centre ?? { x: 0, y: 0 };
    rotateViewByAnimated(viewport, pivot, deltaDeg, { durationMs: 220 });
  }

  function setAngleSnapMode(mode) {
    state.angleSnapMode = mode === 'off' || mode === 'shift' || mode === 'always' ? mode : 'shift';
  }

  function setScaleFromDenom(denom) {
    const d = Number(denom) || 100;
    viewport.setScale(1 / d);
  }

  function setBuildingGridlinesEnabled(enabled) {
    state.buildingGridlinesEnabled = !!enabled;
  }

  function getBuildingGridlinesEnabled() {
    return state.buildingGridlinesEnabled;
  }

  return {
    viewport,
    setTool,
    getCurrentToolId: () => currentToolId,
    getTools: () => tools,
    getPolylines: () => state.polylines,
    getSelectedSegments: () => state.selectedSegments,
    getSelectedLines: () => {
      // Legacy: return unique polylines from selected segments
      return [...new Set(state.selectedSegments.map((s) => s.polyline))];
    },
    setPolylineFillColor: (polyline, color) => {
      if (color) {
        state.polylineFillColors.set(polyline, color);
      } else {
        state.polylineFillColors.delete(polyline);
      }
    },
    getPolylineFillColor: (polyline) => state.polylineFillColors.get(polyline) || null,
    setPolylineHatch: (polyline, pattern, color) => {
      if (pattern && color) {
        state.polylineHatch.set(polyline, { pattern, color });
      } else {
        state.polylineHatch.delete(polyline);
      }
    },
    getPolylineHatch: (polyline) => state.polylineHatch.get(polyline) || null,
    exportDrawing,
    getSelectionAreaInfo,
    setGridEnabled,
    getGridEnabled,
    getBounds,
    fitToContent,
    fitToSheets,
    getActiveViewId,
    setActiveViewId,
    rotateView,
    setAngleSnapMode,
    setScaleFromDenom,
    setBuildingGridlinesEnabled,
    getBuildingGridlinesEnabled,
  };
}
