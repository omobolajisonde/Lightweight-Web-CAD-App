// viewMath.js
const fabric = globalThis.fabric;

export function getZoomMagnitude(canvas) {
  if (!canvas) return 1;

  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];

  // Under camera rotation, zoom is distributed across (a,b) (and (c,d)).
  // vpt[0] = cosθ * zoom, vpt[1] = sinθ * zoom
  const z = Math.hypot(vpt[0], vpt[1]);

  if (!isFinite(z) || z <= 0) return 1;
  return z;
}

export function screenPxToWorldPx(screenPx, zoom) {
  const z = isFinite(zoom) && zoom > 0 ? zoom : 1;
  return screenPx / z;
}

export function worldPtToScreenPt(canvas, worldPt) {
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];

  const p = fabric.util.transformPoint(
    new fabric.Point(worldPt.x, worldPt.y),
    vpt
  );

  return { x: p.x, y: p.y };
}

export function screenPtToWorldPt(canvas, screenPt) {
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const inv = fabric.util.invertTransform(vpt);

  const p = fabric.util.transformPoint(
    new fabric.Point(screenPt.x, screenPt.y),
    inv
  );

  return { x: p.x, y: p.y };
}

export function getCanvasWorldCentre(canvas) {
  if (!canvas) return { x: 0, y: 0 };

  const w = canvas.getWidth();
  const h = canvas.getHeight();

  const centreScreen = { x: w / 2, y: h / 2 };
  return screenPtToWorldPt(canvas, centreScreen);
}
