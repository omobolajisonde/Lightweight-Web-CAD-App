/**
 * Viewport: canvas element, scale, offset, and zoom-to-pointer.
 * Uses utils/transform for world ↔ screen conversion.
 */

import { worldToScreen, screenToWorld } from '../utils/transform.js';

export function createViewport(canvasEl, options = {}) {
  const scale = options.initialScale ?? 1 / 100;
  const offset = options.initialOffset ?? { x: 50, y: 50 };

  const state = {
    canvas: canvasEl,
    ctx: canvasEl.getContext('2d'),
    scale,
    offset: { ...offset },
  };

  function getScale() {
    return state.scale;
  }

  function getOffset() {
    return { ...state.offset };
  }

  function setScale(s) {
    state.scale = s;
  }

  function setOffset(o) {
    state.offset.x = o.x;
    state.offset.y = o.y;
  }

  function toScreen(p) {
    return worldToScreen(p, state.scale, state.offset);
  }

  function toWorld(p) {
    return screenToWorld(p, state.scale, state.offset);
  }

  /**
   * Zoom toward a screen point (e.g. mouse). Call from wheel handler.
   */
  function zoomAt(screenPoint, deltaY) {
    const mouseWorld = screenToWorld(screenPoint, state.scale, state.offset);
    const zoom = deltaY < 0 ? 1.1 : 0.9;
    state.scale *= zoom;
    const newScreen = worldToScreen(mouseWorld, state.scale, state.offset);
    state.offset.x += screenPoint.x - newScreen.x;
    state.offset.y += screenPoint.y - newScreen.y;
  }

  function installWheelHandler() {
    state.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt({ x: e.offsetX, y: e.offsetY }, e.deltaY);
    });
  }

  return {
    get canvas() {
      return state.canvas;
    },
    get ctx() {
      return state.ctx;
    },
    getScale,
    getOffset,
    setScale,
    setOffset,
    toScreen,
    toWorld,
    zoomAt,
    installWheelHandler,
  };
}
