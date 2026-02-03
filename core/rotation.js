/**
 * Smooth camera rotation (viewport only). Matches StackBlitz rotation.js.
 * Pivot stays fixed on screen; zoom magnitude preserved; easeInOutCubic.
 */

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function normaliseAngleRad(a) {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
}

/**
 * Rotate view by delta degrees with animation.
 * @param {object} viewport - { getScale, getOffset, getRotationRad, setScale, setOffset, setRotationRad, toScreen }
 * @param {{ x: number, y: number }} pivotWorld - world coords of pivot (e.g. plan centre)
 * @param {number} deltaDeg - degrees to rotate (e.g. 90 for clockwise)
 * @param {{ durationMs?: number }} opts
 */
export function rotateViewByAnimated(viewport, pivotWorld, deltaDeg = 90, opts = {}) {
  const durationMs = clamp(Number(opts.durationMs ?? 220), 80, 1200);
  const scale = viewport.getScale();
  const offset = viewport.getOffset();
  const a0 = viewport.getRotationRad();
  const deltaRad = (deltaDeg * Math.PI) / 180;
  let a1 = normaliseAngleRad(a0 + deltaRad);
  let da = normaliseAngleRad(a1 - a0);
  if (da > Math.PI) da -= Math.PI * 2;
  if (da < -Math.PI) da += Math.PI * 2;

  const pivotScreen = viewport.toScreen(pivotWorld);
  const t0 = performance.now();

  function tick(now) {
    const t = clamp((now - t0) / durationMs, 0, 1);
    const k = easeInOutCubic(t);
    const ang = a0 + da * k;
    viewport.setRotationRad(ang);
    const newScreen = viewport.toScreen(pivotWorld);
    const cur = viewport.getOffset();
    viewport.setOffset({
      x: cur.x + pivotScreen.x - newScreen.x,
      y: cur.y + pivotScreen.y - newScreen.y,
    });
    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
