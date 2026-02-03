/**
 * Viewport: canvas element, scale, offset, rotation, and zoom-to-pointer.
 * Uses utils/transform for world ↔ screen conversion.
 */

import { worldToScreen, screenToWorld } from '../utils/transform.js';

function rotatePoint(p, angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function createViewport(canvasEl, options = {}) {
  const scale = options.initialScale ?? 1 / 100;
  const offset = options.initialOffset ?? { x: 50, y: 50 };

  const state = {
    canvas: canvasEl,
    ctx: canvasEl.getContext('2d'),
    scale,
    offset: { ...offset },
    rotationRad: 0,
  };

  function getScale() {
    return state.scale;
  }

  function getOffset() {
    return { ...state.offset };
  }

  function getRotationRad() {
    return state.rotationRad;
  }

  function setScale(s) {
    state.scale = s;
  }

  function setOffset(o) {
    state.offset.x = o.x;
    state.offset.y = o.y;
  }

  /** Add rotation in radians (e.g. Math.PI/2 for 90° clockwise). */
  function rotateBy(angleRad) {
    state.rotationRad += angleRad;
  }

  function setRotationRad(angleRad) {
    state.rotationRad = angleRad;
  }

  function toScreen(p) {
    const rotated = rotatePoint(p, -state.rotationRad);
    return worldToScreen(rotated, state.scale, state.offset);
  }

  function toWorld(p) {
    const rotated = screenToWorld(p, state.scale, state.offset);
    return rotatePoint(rotated, state.rotationRad);
  }

  /**
   * Zoom toward a screen point (e.g. mouse). Call from wheel handler.
   */
  function zoomAt(screenPoint, deltaY) {
    const mouseWorld = toWorld(screenPoint);
    const zoom = deltaY < 0 ? 1.1 : 0.9;
    state.scale *= zoom;
    const newScreen = toScreen(mouseWorld);
    state.offset.x += screenPoint.x - newScreen.x;
    state.offset.y += screenPoint.y - newScreen.y;
  }

  /**
   * Set scale and offset so the given world bounds fit in the canvas with padding.
   * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds - world units
   * @param {number} [padding=40] - screen pixels padding
   */
  function fitToBounds(bounds, padding = 40) {
    const w = state.canvas.width;
    const h = state.canvas.height;
    const pad = padding;
    const usableW = w - 2 * pad;
    const usableH = h - 2 * pad;
    const rangeX = bounds.maxX - bounds.minX;
    const rangeY = bounds.maxY - bounds.minY;
    if (rangeX <= 0 || rangeY <= 0) return;
    const scaleX = usableW / rangeX;
    const scaleY = usableH / rangeY;
    state.scale = Math.min(scaleX, scaleY);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const screenC = worldToScreen(rotatePoint({ x: cx, y: cy }, -state.rotationRad), state.scale, { x: 0, y: 0 });
    state.offset.x = w / 2 - screenC.x;
    state.offset.y = h / 2 - screenC.y;
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
    getRotationRad,
    setScale,
    setOffset,
    setRotationRad,
    rotateBy,
    toScreen,
    toWorld,
    zoomAt,
    fitToBounds,
    installWheelHandler,
  };
}
