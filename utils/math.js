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
 * Check if a line segment intersects a box (for crossing selection).
 * Uses Liang-Barsky line clipping algorithm.
 * @param {{x,y}} a - Segment start point
 * @param {{x,y}} b - Segment end point
 * @param {{x1,y1,x2,y2}} box - Selection box (coordinates may be unordered)
 * @returns {boolean} True if segment intersects box
 */
export function segmentIntersectsBox(a, b, box) {
  // Normalize box coordinates
  const minX = Math.min(box.x1, box.x2);
  const maxX = Math.max(box.x1, box.x2);
  const minY = Math.min(box.y1, box.y2);
  const maxY = Math.max(box.y1, box.y2);

  // Quick reject: both endpoints outside same side
  if ((a.x < minX && b.x < minX) || (a.x > maxX && b.x > maxX)) return false;
  if ((a.y < minY && b.y < minY) || (a.y > maxY && b.y > maxY)) return false;

  // Quick accept: both endpoints inside
  if (
    a.x >= minX &&
    a.x <= maxX &&
    a.y >= minY &&
    a.y <= maxY &&
    b.x >= minX &&
    b.x <= maxX &&
    b.y >= minY &&
    b.y <= maxY
  ) {
    return true;
  }

  // Liang-Barsky algorithm: parametric line intersection
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  // Degenerate case: point
  if (dx === 0 && dy === 0) {
    return a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY;
  }

  let t0 = 0;
  let t1 = 1;

  // Clip against left and right edges
  if (dx < 0) {
    if (a.x < minX) return false; // Line starts left of box
    if (b.x > maxX) t1 = Math.min(t1, (maxX - a.x) / dx);
    if (a.x > maxX) t0 = Math.max(t0, (maxX - a.x) / dx);
  } else if (dx > 0) {
    if (a.x > maxX) return false; // Line starts right of box
    if (b.x < minX) t1 = Math.min(t1, (minX - a.x) / dx);
    if (a.x < minX) t0 = Math.max(t0, (minX - a.x) / dx);
  } else {
    // Vertical line
    if (a.x < minX || a.x > maxX) return false;
  }

  // Clip against bottom and top edges
  if (dy < 0) {
    if (a.y < minY) return false; // Line starts below box
    if (b.y > maxY) t1 = Math.min(t1, (maxY - a.y) / dy);
    if (a.y > maxY) t0 = Math.max(t0, (maxY - a.y) / dy);
  } else if (dy > 0) {
    if (a.y > maxY) return false; // Line starts above box
    if (b.y < minY) t1 = Math.min(t1, (minY - a.y) / dy);
    if (a.y < minY) t0 = Math.max(t0, (minY - a.y) / dy);
  } else {
    // Horizontal line
    if (a.y < minY || a.y > maxY) return false;
  }

  // If t0 <= t1, segment intersects box
  return t0 <= t1 && t1 >= 0 && t0 <= 1;
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

/**
 * Angle snapping constants (CAD standard).
 */
export const ANGLE_SNAP_TOLERANCE = 10; // degrees
export const ANGLE_SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]; // degrees

/**
 * Normalize angle to [0, 360).
 */
export function normalizeAngle(degrees) {
  while (degrees < 0) degrees += 360;
  while (degrees >= 360) degrees -= 360;
  return degrees;
}

/**
 * Compute angle from point a to point b in degrees.
 */
export function angleBetween(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const radians = Math.atan2(dy, dx);
  return normalizeAngle((radians * 180) / Math.PI);
}

/**
 * Snap angle to nearest snap target (global axes or relative angles).
 * @param {number} angleDeg - Current angle in degrees
 * @param {number[]} snapTargets - Array of target angles in degrees (e.g. [0, 45, 90] or relative angles)
 * @param {number} tolerance - Tolerance in degrees
 * @returns {number|null} Snapped angle or null if not within tolerance
 */
export function snapAngle(angleDeg, snapTargets, tolerance = ANGLE_SNAP_TOLERANCE) {
  let bestAngle = null;
  let minDiff = tolerance;

  for (const target of snapTargets) {
    const diff = Math.abs(normalizeAngle(angleDeg - target));
    const diffWrapped = Math.min(diff, 360 - diff);
    if (diffWrapped < minDiff) {
      minDiff = diffWrapped;
      bestAngle = target;
    }
  }

  return bestAngle;
}

/**
 * Constrain point to angle from reference point.
 * @param {{x,y}} reference - Reference point (e.g. last point in polyline)
 * @param {{x,y}} target - Target point (e.g. mouse position)
 * @param {number} snapAngleDeg - Target angle in degrees
 * @returns {{x,y}} Constrained point
 */
export function constrainToAngle(reference, target, snapAngleDeg) {
  const radians = (snapAngleDeg * Math.PI) / 180;
  const dx = target.x - reference.x;
  const dy = target.y - reference.y;
  const dist = Math.hypot(dx, dy);
  return {
    x: reference.x + dist * Math.cos(radians),
    y: reference.y + dist * Math.sin(radians),
  };
}
