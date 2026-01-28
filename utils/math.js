/**
 * Geometry and math helpers used across tools and the engine.
 */

export const SNAP_DIST = 10;
export const HANDLE_SIZE = 6;
export const HIT_TOLERANCE = 5;
export const CLOSE_LOOP_THRESHOLD = 10;

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return distance(p, a);

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));

  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return distance(p, proj);
}

/**
 * Check if a polyline is inside/intersecting a box.
 * @param {Object[]} line - Array of {x,y} points
 * @param {{x1,y1,x2,y2}} box - Selection box
 * @param {boolean} crossing - If true, any point inside counts; if false, all points must be inside
 */
export function lineInBox(line, box, crossing) {
  const minX = Math.min(box.x1, box.x2);
  const maxX = Math.max(box.x1, box.x2);
  const minY = Math.min(box.y1, box.y2);
  const maxY = Math.max(box.y1, box.y2);

  let insideCount = 0;
  for (const p of line) {
    const inside = p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    if (inside) insideCount++;
  }
  return crossing ? insideCount > 0 : insideCount === line.length;
}
