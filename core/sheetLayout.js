/**
 * Multi-view sheet layout (vanilla, no Fabric).
 * World units = mm. Five sheets: PLAN (center), FRONT (top), BACK (bottom), LEFT (left), RIGHT (right).
 * Matches StackBlitz sheetLayout.js: paper edge pad 6mm, inner A4 frame per sheet.
 */

const A3_LANDSCAPE_W_MM = 420;
const A3_LANDSCAPE_H_MM = 297;
const A3_PORTRAIT_W_MM = 297;
const A3_PORTRAIT_H_MM = 420;
const GAP_MM = 30;
const PAPER_EDGE_PAD_MM = 6;
const A4_LANDSCAPE_W_MM = 297;
const A4_LANDSCAPE_H_MM = 210;
const A4_PORTRAIT_W_MM = 210;
const A4_PORTRAIT_H_MM = 297;

/**
 * Returns sheet definitions in world mm. Centre of plan is (0, 0).
 * Each sheet has innerA4: { leftMm, topMm, rightMm, bottomMm } for the dashed inner frame.
 */
export function getSheetLayout() {
  const planW = A3_LANDSCAPE_W_MM;
  const planH = A3_LANDSCAPE_H_MM;
  const frontW = A3_LANDSCAPE_W_MM;
  const frontH = A3_LANDSCAPE_H_MM;
  const backW = A3_LANDSCAPE_W_MM;
  const backH = A3_LANDSCAPE_H_MM;
  const leftW = A3_PORTRAIT_W_MM;
  const leftH = A3_PORTRAIT_H_MM;
  const rightW = A3_PORTRAIT_W_MM;
  const rightH = A3_PORTRAIT_H_MM;

  const planHalfMax = Math.max(planW, planH) / 2;
  const otherHalfMax = Math.max(frontW, frontH, backW, backH, leftW, leftH, rightW, rightH) / 2;
  const radiusMm = planHalfMax + GAP_MM + otherHalfMax;

  function makeSheet(id, cx, cy, wMm, hMm, label, a4Landscape) {
    const a4W = a4Landscape ? A4_LANDSCAPE_W_MM : A4_PORTRAIT_W_MM;
    const a4H = a4Landscape ? A4_LANDSCAPE_H_MM : A4_PORTRAIT_H_MM;
    const leftMm = cx - wMm / 2;
    const topMm = cy - hMm / 2;
    const innerA4 = {
      leftMm: cx - a4W / 2,
      topMm: cy - a4H / 2,
      rightMm: cx + a4W / 2,
      bottomMm: cy + a4H / 2,
    };
    return {
      id,
      centre: { x: cx, y: cy },
      wMm,
      hMm,
      leftMm,
      topMm,
      rightMm: cx + wMm / 2,
      bottomMm: cy + hMm / 2,
      label,
      innerA4,
      paperLeftMm: leftMm - PAPER_EDGE_PAD_MM,
      paperTopMm: topMm - PAPER_EDGE_PAD_MM,
      paperW: wMm + 2 * PAPER_EDGE_PAD_MM,
      paperH: hMm + 2 * PAPER_EDGE_PAD_MM,
    };
  }

  const sheets = {
    plan: makeSheet('plan', 0, 0, planW, planH, 'PLAN', true),
    front: makeSheet('front', 0, -radiusMm, frontW, frontH, 'FRONT', true),
    back: makeSheet('back', 0, radiusMm, backW, backH, 'BACK', true),
    left: makeSheet('left', -radiusMm, 0, leftW, leftH, 'LEFT', false),
    right: makeSheet('right', radiusMm, 0, rightW, rightH, 'RIGHT', false),
  };

  return { sheets, radiusMm };
}

/**
 * Hit-test: which sheet (if any) contains the world point?
 * @param {Record<string, { leftMm, topMm, rightMm, bottomMm }>} sheets
 * @param {{ x: number, y: number }} worldMm
 * @returns {string|null} sheet id or null
 */
export function hitTestSheet(sheets, worldMm) {
  const { x, y } = worldMm;
  for (const id of ['plan', 'front', 'back', 'left', 'right']) {
    const s = sheets[id];
    if (!s) continue;
    const right = s.paperLeftMm + s.paperW;
    const bottom = s.paperTopMm + s.paperH;
    if (x >= s.paperLeftMm && x <= right && y >= s.paperTopMm && y <= bottom) return id;
  }
  return null;
}

/**
 * Bounding box in mm that contains all five sheets (for fitToSheets).
 */
export function getSheetsBounds(sheets, radiusMm) {
  const r = radiusMm + Math.max(A3_LANDSCAPE_W_MM, A3_LANDSCAPE_H_MM, A3_PORTRAIT_W_MM, A3_PORTRAIT_H_MM) / 2;
  return { minX: -r, minY: -r, maxX: r, maxY: r };
}
