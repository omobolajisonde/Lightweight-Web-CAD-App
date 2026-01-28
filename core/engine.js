/**
 * Engine: canvas, document state (polylines, selection), snapping, tool delegation, and render loop.
 */

import { createViewport } from './viewport.js';
import { createTools } from '../tools/index.js';
import { distance, SNAP_DIST, HANDLE_SIZE } from '../utils/math.js';

/**
 * @param {HTMLCanvasElement} canvasEl
 * @param {{ initialScale?: number, initialOffset?: {x,y}, onToolChange?: (id: string) => void }} options
 */
export function createEngine(canvasEl, options = {}) {
  const viewport = createViewport(canvasEl, options);
  const ctx = viewport.ctx;

  const state = {
    polylines: [],
    selectedLines: [],
    hoveredLine: null,
    mouse: { x: 0, y: 0 },
    snapPoint: null,
    snapType: null,
  };

  const tools = createTools({ getState: () => state, viewport });
  const toolsById = Object.fromEntries(tools.map((t) => [t.id, t]));
  let currentToolId = 'line';

  function getSnap() {
    if (!state.snapPoint) return null;
    return { point: state.snapPoint, type: state.snapType };
  }

  function findSnap(worldMouse) {
    state.snapPoint = null;
    state.snapType = null;
    const scale = viewport.getScale();

    // When drawing a polyline, prefer snapping to its first point so closing is reliable
    if (currentToolId === 'line') {
      const lineTool = toolsById['line'];
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
    return null;
  }

  function buildToolContext(worldMouse) {
    return {
      viewport,
      gfx: ctx,
      mouse: state.mouse,
      worldMouse,
      polylines: state.polylines,
      selectedLines: state.selectedLines,
      setSelectedLines(lines) {
        state.selectedLines.length = 0;
        state.selectedLines.push(...lines);
      },
      setHoveredLine(line) {
        state.hoveredLine = line;
      },
      getSnap,
      addPolyline(points) {
        state.polylines.push(points);
      },
      removePolylines(lines) {
        state.polylines = state.polylines.filter((l) => !lines.includes(l));
        state.selectedLines = state.selectedLines.filter((l) => !lines.includes(l));
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

  canvasEl.addEventListener('mousemove', (e) => {
    state.mouse.x = e.offsetX;
    state.mouse.y = e.offsetY;
    const worldMouse = viewport.toWorld(state.mouse);
    findSnap(worldMouse);

    const tool = getCurrentTool();
    const toolCtx = buildToolContext(worldMouse);
    if (tool.onMouseMove) tool.onMouseMove(toolCtx);
  });

  canvasEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const worldMouse = viewport.toWorld({ x: e.offsetX, y: e.offsetY });
    const tool = getCurrentTool();
    const toolCtx = buildToolContext(worldMouse);
    if (tool.onMouseDown && tool.onMouseDown(toolCtx)) return;
  });

  canvasEl.addEventListener('mouseup', () => {
    const worldMouse = viewport.toWorld(state.mouse);
    const tool = getCurrentTool();
    const toolCtx = buildToolContext(worldMouse);
    if (tool.onMouseUp && tool.onMouseUp(toolCtx)) return;
  });

  canvasEl.addEventListener('click', (e) => {
    const worldMouse = viewport.toWorld({ x: e.offsetX, y: e.offsetY });
    const tool = getCurrentTool();
    const toolCtx = buildToolContext(worldMouse);
    if (tool.onClick && tool.onClick(toolCtx)) return;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const lineTool = toolsById['line'];
      if (lineTool?.getCurrentPoints?.()?.length > 0) {
        lineTool.deactivate?.();
        return;
      }
      if (currentToolId === 'line') {
        setTool('select');
        return;
      }
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedLines.length > 0) {
      state.polylines = state.polylines.filter((l) => !state.selectedLines.includes(l));
      state.selectedLines.length = 0;
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

  function draw() {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    const scale = viewport.getScale();

    state.polylines.forEach((line) => {
      if (state.selectedLines.includes(line)) {
        drawLine(line, 'red', 2);
      } else if (line === state.hoveredLine) {
        drawLine(line, 'blue', 2);
      } else {
        drawLine(line, 'black', 1);
      }
    });

    state.selectedLines.forEach((line) => {
      line.forEach((p) => {
        const s = viewport.toScreen(p);
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'red';
        ctx.beginPath();
        ctx.arc(s.x, s.y, HANDLE_SIZE, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
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

  return {
    viewport,
    setTool,
    getCurrentToolId: () => currentToolId,
    getTools: () => tools,
    getPolylines: () => state.polylines,
    getSelectedLines: () => state.selectedLines,
  };
}
