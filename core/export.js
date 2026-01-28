/**
 * Export drawing to structured JSON (Phase 1 & 2 data layer).
 * Coordinates in mm; area in m² (architectural norm).
 */

import { isClosedPolyline, polygonArea, MM2_TO_M2 } from '../utils/math.js';

/**
 * @param {Object[][]} polylines - Array of point arrays {x,y} in mm
 * @returns {{ units: string, areaUnit: string, rooms: { id: number, vertices: {x,y}[], area: number }[], walls: { id: number, vertices: {x,y}[] }[] }}
 */
export function buildStructuredDrawing(polylines) {
  const rooms = [];
  const walls = [];
  let roomId = 1;
  let wallId = 1;

  for (const points of polylines) {
    if (!points || points.length < 2) continue;

    const vertices = points.map((p) => ({ x: p.x, y: p.y }));

    if (isClosedPolyline(points)) {
      const areaMm2 = polygonArea(vertices);
      const areaM2 = areaMm2 * MM2_TO_M2;
      rooms.push({ id: roomId++, vertices, area: areaM2 });
    } else {
      walls.push({ id: wallId++, vertices });
    }
  }

  return {
    units: 'mm',
    areaUnit: 'm²',
    rooms,
    walls,
  };
}
