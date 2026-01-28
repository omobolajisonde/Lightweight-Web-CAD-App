/**
 * Geometry and math helpers.
 * Unit convention: 1 world unit = 1 mm (A3 @ 1:100, architectural norms).
 */

export const SNAP_DIST = 10;
export const HANDLE_SIZE = 6;
export const HIT_TOLERANCE = 5;
export const CLOSE_LOOP_THRESHOLD = 10;
/** World-unit grid spacing (e.g. 1000 at 1:100 scale = 10m grid) */
export const GRID_SPACING = 1000;
/** Tolerance to treat polyline as closed (first point ≈ last point) */
export const CLOSED_POLYGON_TOLERANCE = 1;

/** Convert area from mm² (internal) to m² (display/export) */
export const MM2_TO_M2 = 1 / 1_000_000;

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

/**
 * True if polyline is closed (first and last point within tolerance).
 * @param {{x,y}[]} points
 * @param {number} [tolerance]
 */
export function isClosedPolyline(points, tolerance = CLOSED_POLYGON_TOLERANCE) {
  if (!points || points.length < 3) return false;
  return distance(points[0], points[points.length - 1]) <= tolerance;
}

/**
 * Signed polygon area (shoelace formula). Use Math.abs for display.
 * @param {{x,y}[]} vertices - closed polygon (first may equal last, or not)
 * @returns {number} area in world units²
 */
export function polygonArea(vertices) {
  if (!vertices || vertices.length < 3) return 0;
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Nearest grid point in world coordinates.
 * @param {{x,y}} worldPoint
 * @param {number} [spacing]
 */
export function snapToGrid(worldPoint, spacing = GRID_SPACING) {
  return {
    x: Math.round(worldPoint.x / spacing) * spacing,
    y: Math.round(worldPoint.y / spacing) * spacing,
  };
}

/**
 * Distance from world point to nearest grid intersection.
 */
export function distanceToGrid(worldPoint, spacing = GRID_SPACING) {
  const g = snapToGrid(worldPoint, spacing);
  return distance(worldPoint, g);
}
