// rotation.js - smooth camera rotation (viewportTransform), no object rotation
const fabric = globalThis.fabric;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function normaliseAngleRad(a) {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
}

// zoom magnitude under rotation
function zoomFromVpt(vpt) {
  const a = vpt && vpt.length ? vpt[0] : 1;
  const b = vpt && vpt.length ? vpt[1] : 0;
  const z = Math.hypot(a, b);
  return isFinite(z) && z > 0 ? z : 1;
}

// camera angle from VPT
function angleFromVpt(vpt) {
  const a = vpt && vpt.length ? vpt[0] : 1;
  const b = vpt && vpt.length ? vpt[1] : 0;
  return Math.atan2(b, a);
}

// Prefer plan centre; fallback to paper bounds centre
function getPivotWorld(editor) {
  if (editor?.sheets?.plan?.centre) {
    return { x: editor.sheets.plan.centre.x, y: editor.sheets.plan.centre.y };
  }

  const canvas = editor?.canvas;
  if (!canvas) return { x: 0, y: 0 };

  const papers = canvas.getObjects().filter((o) => o && o.isPaper === true);
  if (!papers.length) return { x: 0, y: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of papers) {
    const r = o.getBoundingRect(true, true);
    minX = Math.min(minX, r.left);
    minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.left + r.width);
    maxY = Math.max(maxY, r.top + r.height);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function applyViewport(editor, vpt) {
  const canvas = editor?.canvas;
  if (!canvas) return;

  canvas.setViewportTransform(vpt);

  // keep your existing "rebuild hooks" consistent with editor.applyCameraRotationImmediate()
  try { editor?.refreshCurrentZoom?.(); } catch (err) {}
  try { if (editor?.showGrid) editor?.drawGrid?.(); } catch (err) {}
  try { editor?.keyRefs?.reorderLayers?.(); } catch (err) {}

  canvas.requestRenderAll();
}

// keep a cancel handle per-editor (so spamming rotate doesn't stack)
function cancelAny(editor) {
  if (editor && editor.__rotAnimRaf) {
    try { cancelAnimationFrame(editor.__rotAnimRaf); } catch (err) {}
    editor.__rotAnimRaf = 0;
  }
}

/**
 * Smooth 90° clockwise rotation.
 * Called by editor.rotateView() already:
 *    rotateViewClockwiseAnimated(this);
 */
export function rotateViewClockwiseAnimated(editor, opts = {}) {
  rotateViewByAnimated(editor, +90, opts);
}

/**
 * Smooth 90° counter-clockwise rotation (optional if you want it).
 */
export function rotateViewCounterClockwiseAnimated(editor, opts = {}) {
  rotateViewByAnimated(editor, -90, opts);
}

/**
 * Rotate by a delta degrees with animation.
 * - rotates viewportTransform only
 * - keeps pivot fixed on screen
 * - preserves zoom magnitude
 */
export function rotateViewByAnimated(editor, deltaDeg = 90, opts = {}) {
  const canvas = editor?.canvas;
  if (!canvas) return;

  cancelAny(editor);

  const durationMs = clamp(Number(opts.durationMs ?? 220), 80, 1200);

  const vptStart = (canvas.viewportTransform || [1, 0, 0, 1, 0, 0]).slice();
  const zoom = zoomFromVpt(vptStart);
  const a0 = angleFromVpt(vptStart);

  const delta = degToRad(Number(deltaDeg) || 0);
  let a1 = normaliseAngleRad(a0 + delta);

  // choose shortest path
  let da = normaliseAngleRad(a1 - a0);
  if (da > Math.PI) da -= Math.PI * 2;
  if (da < -Math.PI) da += Math.PI * 2;

  const pivotWorld = getPivotWorld(editor);
  const pivotScreen = fabric.util.transformPoint(
    new fabric.Point(pivotWorld.x, pivotWorld.y),
    vptStart
  );

  const t0 = performance.now();

  const tick = (now) => {
    const t = clamp((now - t0) / durationMs, 0, 1);
    const k = easeInOutCubic(t);

    const ang = a0 + da * k;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);

    // base rotation+zoom, no translation
    const vpt = [
      zoom * cos,
      zoom * sin,
      -zoom * sin,
      zoom * cos,
      0,
      0
    ];

    // translate so pivot stays at same screen pixel
    const mapped = fabric.util.transformPoint(new fabric.Point(pivotWorld.x, pivotWorld.y), vpt);
    vpt[4] = pivotScreen.x - mapped.x;
    vpt[5] = pivotScreen.y - mapped.y;

    applyViewport(editor, vpt);

    if (t < 1) {
      editor.__rotAnimRaf = requestAnimationFrame(tick);
    } else {
      editor.__rotAnimRaf = 0;

      // keep your editor rotation state updated
      const deg = radToDeg(ang);
      editor.viewRotationDeg = deg;
      // normalize to [0..360)
      const n = ((deg % 360) + 360) % 360;
      editor.viewRotationDegNorm = n;
    }
  };

  editor.__rotAnimRaf = requestAnimationFrame(tick);
}
