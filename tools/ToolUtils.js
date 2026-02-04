// tools/ToolUtils.js
const fabric = globalThis.fabric;

/**
 * Convert native mouse/pointer event -> WORLD coordinates (scene coords).
 * Uses Fabric's pointer normalization so snapping stays pixel-perfect under:
 * - zoom/pan/rotation
 * - retina scaling
 * - CSS scaling / responsive layout
 */
export function toWorldPointer(editor, opt) {
  const canvas = editor?.canvas;
  const e = opt && opt.e ? opt.e : null;
  if (!canvas || !e) return null;

  // Fabric normalizes pointer properly (retina + css + offsets)
  // getPointer(e, true) => coordinates in "viewport/screen" canvas space (ignores viewportTransform)
  // then we apply inverse VPT to get WORLD.
  let p = null;

  if (typeof canvas.getPointer === "function") {
    p = canvas.getPointer(e, true);
  } else {
    // Fallback (older Fabric): manual method
    const rect = canvas.upperCanvasEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    p = { x: sx, y: sy };
  }

  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const inv = fabric.util.invertTransform(vpt);
  const world = fabric.util.transformPoint(new fabric.Point(p.x, p.y), inv);

  return { x: world.x, y: world.y };
}

/** WORLD -> SCREEN (viewport/canvas pixel coords), rotation-safe */
export function worldToScreen(editor, pt) {
  const canvas = editor?.canvas;
  if (!canvas) return { x: pt.x, y: pt.y };

  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const p = fabric.util.transformPoint(new fabric.Point(pt.x, pt.y), vpt);
  return { x: p.x, y: p.y };
}

/** SCREEN -> WORLD (inverse VPT), rotation-safe */
export function screenToWorld(editor, ptScreen) {
  const canvas = editor?.canvas;
  if (!canvas) return { x: ptScreen.x, y: ptScreen.y };

  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const inv = fabric.util.invertTransform(vpt);
  const w = fabric.util.transformPoint(new fabric.Point(ptScreen.x, ptScreen.y), inv);
  return { x: w.x, y: w.y };
}

/**
 * Automatic CAD ortho snap:
 * - Locks horizontal or vertical relative to origin
 * - Tolerance is SCREEN pixels (stable under zoom/rotation)
 */
export function applyOrthoSnapWorld(editor, originWorld, rawWorld, tolPx = 8) {
  if (!editor?.canvas || !originWorld || !rawWorld) return { snapped: false, point: rawWorld };

  const oS = worldToScreen(editor, originWorld);
  const rS = worldToScreen(editor, rawWorld);

  const dx = rS.x - oS.x;
  const dy = rS.y - oS.y;

  // If close to horizontal => lock Y (horizontal line)
  if (Math.abs(dy) <= tolPx && Math.abs(dx) > tolPx) {
    const lockedScreen = { x: rS.x, y: oS.y };
    return { snapped: true, point: screenToWorld(editor, lockedScreen), axis: "h" };
  }

  // If close to vertical => lock X (vertical line)
  if (Math.abs(dx) <= tolPx && Math.abs(dy) > tolPx) {
    const lockedScreen = { x: oS.x, y: rS.y };
    return { snapped: true, point: screenToWorld(editor, lockedScreen), axis: "v" };
  }

  return { snapped: false, point: rawWorld };
}

export function snapWorldPointer(editor, worldPt) {
  if (!editor?.snapper) return worldPt;

  const res = editor.snapper.applySnapToPointer(worldPt);
  if (!res || !res.snapped) return worldPt;

  return res.point || worldPt;
}

export function snapWorldPointerWithTarget(editor, worldPt) {
  if (!editor?.snapper) return { snapped: false, point: worldPt, target: null };

  const res = editor.snapper.applySnapToPointer(worldPt);
  if (!res || !res.snapped) return { snapped: false, point: worldPt, target: null };

  return {
    snapped: true,
    point: res.point || worldPt,
    target: res.target || null
  };
}

export function shouldAngleSnap(editor, opt) {
  const e = opt && opt.e ? opt.e : null;
  const shiftKey = !!(e && e.shiftKey);

  const snapper = editor?.snapper;
  if (snapper && typeof snapper.shouldAngleSnap === "function") {
    return snapper.shouldAngleSnap(shiftKey);
  }

  // Default: Shift-only
  return shiftKey;
}

/** Choose between two WORLD points based on which is closer to the raw cursor in SCREEN space */
export function pickCloserInScreen(editor, rawWorld, aWorld, bWorld) {
  const rS = worldToScreen(editor, rawWorld);
  const aS = worldToScreen(editor, aWorld);
  const bS = worldToScreen(editor, bWorld);

  const da = Math.hypot(aS.x - rS.x, aS.y - rS.y);
  const db = Math.hypot(bS.x - rS.x, bS.y - rS.y);

  return db < da ? bWorld : aWorld;
}

export function removeToolPreviews(editor) {
  const canvas = editor?.canvas;
  if (!canvas) return;

  const toRemove = [];
  canvas.getObjects().forEach((o) => {
    if (o && o.isToolPreview) toRemove.push(o);
  });

  toRemove.forEach((o) => {
    try {
      canvas.remove(o);
    } catch (err) {}
  });
}

export function distanceWorld(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

export function pxToMm(editor, px) {
  // px -> paper mm
  const paperMm = px / editor.CONFIG.DPI_RATIO;

  // paper mm -> model mm (e.g., 1:100 means multiply by 100)
  const scale =
    typeof editor.currentScale === "number" && isFinite(editor.currentScale)
      ? editor.currentScale
      : 100;

  return paperMm * scale;
}
