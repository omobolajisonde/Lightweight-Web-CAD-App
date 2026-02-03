/**
 * Building gridlines / alignment guides. Matches StackBlitz gridlines.js (KeyReferenceManager).
 * Four keys: L (left), R (right), F (front), B (back).
 * - Reference dashed lines: vertical for L/R (frontTop to backBottom), horizontal for F/B (leftRight to rightLeft).
 * - Instances: on each sheet a dashed line with head bubble (L, R, F, or B).
 * - Handles: two colored circles per key in the gaps between plan and adjacent sheets.
 * All in world mm.
 */

const PAPER_EDGE_PAD_MM = 6;
const GRID_LINE_COLOUR = '#6f6f6f';
const DASH_MM = [8, 6];
const HEAD_RADIUS_MM = 8;
const HEAD_STROKE_MM = 1;
const LINE_OVERHANG_MM = 3;
const HEAD_GAP_MM = 0;
const HANDLE_RADIUS_MM = 11;
const HANDLE_COLOURS = { left: '#0066ff', right: '#ff0000', front: '#00cc00', back: '#ffcc00' };
const LABELS = { left: 'L', right: 'R', front: 'F', back: 'B' };
const REF_LINE_STROKE_MM = 2;
const REF_LINE_DASH_MM = [8, 8];
const REF_LINE_COLOUR = '#ffffff';
const MIN_SEPARATION_MM = 10;
const MIN_FROM_CENTRE_MM = 2;

function getEffectiveInnerA4(sheet) {
  return sheet?.innerA4 || null;
}

function getViewsForKey(key) {
  if (key === 'left' || key === 'right') return ['plan', 'front', 'back'];
  if (key === 'front' || key === 'back') return ['plan', 'left', 'right'];
  return ['plan'];
}

function getEffectiveDimensions(sheet) {
  return { w: sheet.wMm, h: sheet.hMm };
}

/**
 * Initialize key ref model from plan inner A4 (default positions).
 */
export function initKeyRefModel(sheets) {
  const plan = sheets?.plan;
  if (!plan?.centre || !plan?.innerA4) {
    return {
      left: { offsetX: 0 },
      right: { offsetX: 0 },
      front: { offsetY: 0 },
      back: { offsetY: 0 },
    };
  }
  const inner = getEffectiveInnerA4(plan);
  const cx = plan.centre.x;
  const cy = plan.centre.y;
  return {
    left: { offsetX: (inner.leftMm - cx) * 0.65 },
    right: { offsetX: (inner.rightMm - cx) * 0.65 },
    back: { offsetY: (inner.topMm - cy) * 0.65 },
    front: { offsetY: (inner.bottomMm - cy) * 0.65 },
  };
}

/**
 * Draw reference dashed line (vertical for left/right, horizontal for front/back).
 */
function drawReferenceDashedLine(ctx, viewport, key, sheets, model, pad) {
  const plan = sheets.plan;
  if (!plan?.centre) return;
  const cx = plan.centre.x;
  const cy = plan.centre.y;

  if (key === 'left' || key === 'right') {
    const front = sheets.front;
    const back = sheets.back;
    if (!front?.centre || !back?.centre) return;
    const frontDim = getEffectiveDimensions(front);
    const backDim = getEffectiveDimensions(back);
    const frontH = frontDim.h + pad * 2;
    const backH = backDim.h + pad * 2;
    const frontTop = front.centre.y - frontH / 2;
    const backBottom = back.centre.y + backH / 2;
    const x = cx + model[key].offsetX;
    const p1 = viewport.toScreen({ x, y: frontTop });
    const p2 = viewport.toScreen({ x, y: backBottom });
    ctx.strokeStyle = REF_LINE_COLOUR;
    ctx.lineWidth = Math.max(1, REF_LINE_STROKE_MM * viewport.getScale());
    ctx.setLineDash(REF_LINE_DASH_MM.map((d) => d * viewport.getScale()));
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  if (key === 'front' || key === 'back') {
    const left = sheets.left;
    const right = sheets.right;
    if (!left?.centre || !right?.centre) return;
    const leftDim = getEffectiveDimensions(left);
    const rightDim = getEffectiveDimensions(right);
    const leftW = leftDim.w + pad * 2;
    const rightW = rightDim.w + pad * 2;
    const leftRight = left.centre.x + leftW / 2;
    const rightLeft = right.centre.x - rightW / 2;
    const y = cy + model[key].offsetY;
    const p1 = viewport.toScreen({ x: leftRight, y });
    const p2 = viewport.toScreen({ x: rightLeft, y });
    ctx.strokeStyle = REF_LINE_COLOUR;
    ctx.lineWidth = Math.max(1, REF_LINE_STROKE_MM * viewport.getScale());
    ctx.setLineDash(REF_LINE_DASH_MM.map((d) => d * viewport.getScale()));
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Get head placement in sheet-local coords (mm). Head = circle + letter at one end of the grid line.
 */
function getHeadPlacement(viewId, sheet, orientation) {
  const inner = getEffectiveInnerA4(sheet);
  if (!inner) return { x: 0, y: 0 };
  const pushFromA4 = LINE_OVERHANG_MM + HEAD_GAP_MM + HEAD_RADIUS_MM + 3 * HEAD_RADIUS_MM;
  const innerLeft = inner.leftMm - sheet.centre.x;
  const innerRight = inner.rightMm - sheet.centre.x;
  const innerTop = inner.topMm - sheet.centre.y;
  const innerBottom = inner.bottomMm - sheet.centre.y;

  if (viewId === 'plan') {
    if (orientation === 'vertical') return { x: 0, y: innerTop - pushFromA4 };
    return { x: innerLeft - pushFromA4, y: 0 };
  }
  if (viewId === 'front') {
    if (orientation === 'vertical') return { x: 0, y: innerBottom + pushFromA4 };
    return { x: innerLeft - pushFromA4, y: 0 };
  }
  if (viewId === 'back') {
    if (orientation === 'vertical') return { x: 0, y: innerTop - pushFromA4 };
    return { x: innerLeft - pushFromA4, y: 0 };
  }
  if (viewId === 'left') {
    if (orientation === 'horizontal') return { x: innerRight + pushFromA4, y: 0 };
    return { x: 0, y: innerTop - pushFromA4 };
  }
  if (viewId === 'right') {
    if (orientation === 'horizontal') return { x: innerLeft - pushFromA4, y: 0 };
    return { x: 0, y: innerTop - pushFromA4 };
  }
  if (orientation === 'vertical') return { x: 0, y: innerTop - pushFromA4 };
  return { x: innerLeft - pushFromA4, y: 0 };
}

function getHeadTextRotation(viewId) {
  if (viewId === 'front') return 180;
  if (viewId === 'back') return 0;
  if (viewId === 'left') return 90;
  if (viewId === 'right') return -90;
  return 0;
}

/**
 * Draw one instance: vertical or horizontal dashed line with head bubble on a sheet.
 */
function drawInstance(ctx, viewport, key, viewId, sheet, label) {
  const inner = getEffectiveInnerA4(sheet);
  if (!inner) return;
  const scale = viewport.getScale();
  const cx = sheet.centre.x;
  const cy = sheet.centre.y;
  const innerLeft = inner.leftMm - cx;
  const innerRight = inner.rightMm - cx;
  const innerTop = inner.topMm - cy;
  const innerBottom = inner.bottomMm - cy;
  const r = HEAD_RADIUS_MM;

  if (key === 'left' || key === 'right') {
    const head = getHeadPlacement(viewId, sheet, 'vertical');
    let y1, y2;
    if (head.y < innerTop) {
      const yHeadTouch = head.y + r;
      const overhang = innerTop - yHeadTouch;
      y1 = yHeadTouch;
      y2 = innerBottom + overhang;
    } else if (head.y > innerBottom) {
      const yHeadTouch = head.y - r;
      const overhang = yHeadTouch - innerBottom;
      y1 = innerTop - overhang;
      y2 = yHeadTouch;
    } else {
      y1 = innerTop;
      y2 = innerBottom;
    }
    if (y2 < y1) {
      const mid = (y1 + y2) / 2;
      y1 = mid - 1;
      y2 = mid + 1;
    }
    const p1 = viewport.toScreen({ x: cx, y: cy + y1 });
    const p2 = viewport.toScreen({ x: cx, y: cy + y2 });
    ctx.strokeStyle = GRID_LINE_COLOUR;
    ctx.lineWidth = 1;
    ctx.setLineDash(DASH_MM.map((d) => d * scale));
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const headPos = viewport.toScreen({ x: cx + head.x, y: cy + head.y });
    const radPx = Math.max(4, r * scale);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = GRID_LINE_COLOUR;
    ctx.lineWidth = Math.max(1, HEAD_STROKE_MM * scale);
    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, radPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GRID_LINE_COLOUR;
    ctx.font = `bold ${Math.min(24, Math.max(12, radPx * 1.2))}px Segoe UI, sans-serif`;
    ctx.save();
    ctx.translate(headPos.x, headPos.y);
    ctx.rotate((getHeadTextRotation(viewId) * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    ctx.restore();
    return;
  }

  if (key === 'front' || key === 'back') {
    const head = getHeadPlacement(viewId, sheet, 'horizontal');
    let x1, x2;
    if (head.x < innerLeft) {
      const xHeadTouch = head.x + r;
      const overhang = innerLeft - xHeadTouch;
      x1 = xHeadTouch;
      x2 = innerRight + overhang;
    } else if (head.x > innerRight) {
      const xHeadTouch = head.x - r;
      const overhang = xHeadTouch - innerRight;
      x1 = innerLeft - overhang;
      x2 = xHeadTouch;
    } else {
      x1 = innerLeft;
      x2 = innerRight;
    }
    if (x2 < x1) {
      const mid = (x1 + x2) / 2;
      x1 = mid - 1;
      x2 = mid + 1;
    }
    const p1 = viewport.toScreen({ x: cx + x1, y: cy });
    const p2 = viewport.toScreen({ x: cx + x2, y: cy });
    ctx.strokeStyle = GRID_LINE_COLOUR;
    ctx.lineWidth = 1;
    ctx.setLineDash(DASH_MM.map((d) => d * scale));
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const headPos = viewport.toScreen({ x: cx + head.x, y: cy + head.y });
    const radPx = Math.max(4, r * scale);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = GRID_LINE_COLOUR;
    ctx.lineWidth = Math.max(1, HEAD_STROKE_MM * scale);
    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, radPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GRID_LINE_COLOUR;
    ctx.font = `bold ${Math.min(24, Math.max(12, radPx * 1.2))}px Segoe UI, sans-serif`;
    ctx.save();
    ctx.translate(headPos.x, headPos.y);
    ctx.rotate((getHeadTextRotation(viewId) * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

function getHandlePosition(key, sheets, model, pad) {
  const plan = sheets.plan;
  if (!plan?.centre) return null;
  const planDim = getEffectiveDimensions(plan);
  const planW = planDim.w + pad * 2;
  const planH = planDim.h + pad * 2;
  const planHalfW = planW / 2;
  const planHalfH = planH / 2;

  if (key === 'left' || key === 'right') {
    const front = sheets.front;
    if (!front?.centre) return null;
    const frontDim = getEffectiveDimensions(front);
    const frontH = frontDim.h + pad * 2;
    const frontHalfH = frontH / 2;
    const planBottom = plan.centre.y + planHalfH;
    const frontTop = front.centre.y - frontHalfH;
    const yGapMid = (planBottom + frontTop) / 2;
    return { x: plan.centre.x + model[key].offsetX, y: yGapMid };
  }
  if (key === 'front' || key === 'back') {
    const right = sheets.right;
    if (!right?.centre) return null;
    const rightDim = getEffectiveDimensions(right);
    const rightW = rightDim.w + pad * 2;
    const rightHalfW = rightW / 2;
    const planRight = plan.centre.x + planHalfW;
    const rightLeft = right.centre.x - rightHalfW;
    const xGapMid = (planRight + rightLeft) / 2;
    return { x: xGapMid, y: plan.centre.y + model[key].offsetY };
  }
  return null;
}

function getSecondaryHandlePosition(key, sheets, model, pad) {
  const plan = sheets.plan;
  if (!plan?.centre) return null;
  const planDim = getEffectiveDimensions(plan);
  const planW = planDim.w + pad * 2;
  const planH = planDim.h + pad * 2;
  const planHalfW = planW / 2;
  const planHalfH = planH / 2;

  if (key === 'left' || key === 'right') {
    const back = sheets.back;
    if (!back?.centre) return null;
    const backDim = getEffectiveDimensions(back);
    const backH = backDim.h + pad * 2;
    const backHalfH = backH / 2;
    const planTop = plan.centre.y - planHalfH;
    const backBottom = back.centre.y + backHalfH;
    const yGapMid = (planTop + backBottom) / 2;
    return { x: plan.centre.x + model[key].offsetX, y: yGapMid };
  }
  if (key === 'front' || key === 'back') {
    const left = sheets.left;
    if (!left?.centre) return null;
    const leftDim = getEffectiveDimensions(left);
    const leftW = leftDim.w + pad * 2;
    const leftHalfW = leftW / 2;
    const planLeft = plan.centre.x - planHalfW;
    const leftRight = left.centre.x + leftHalfW;
    const xGapMid = (planLeft + leftRight) / 2;
    return { x: xGapMid, y: plan.centre.y + model[key].offsetY };
  }
  return null;
}

/**
 * Draw all building gridlines: reference dashed lines, instances per sheet, handles.
 */
export function drawBuildingGridlines(ctx, viewport, sheets, model, paperEdgePad = PAPER_EDGE_PAD_MM) {
  if (!sheets?.plan) return;
  const keys = ['left', 'right', 'front', 'back'];
  for (const key of keys) {
    drawReferenceDashedLine(ctx, viewport, key, sheets, model, paperEdgePad);
  }
  for (const key of keys) {
    const views = getViewsForKey(key);
    const label = LABELS[key] || '?';
    for (const viewId of views) {
      const sheet = sheets[viewId];
      if (!sheet) continue;
      if (key === 'left' || key === 'right') {
        if (viewId === 'left' || viewId === 'right') continue;
      } else {
        if (viewId === 'front' || viewId === 'back') continue;
      }
      drawInstance(ctx, viewport, key, viewId, sheet, label);
    }
  }
  const scale = viewport.getScale();
  const radPx = Math.max(8, HANDLE_RADIUS_MM * scale);
  for (const key of keys) {
    const pos = getHandlePosition(key, sheets, model, paperEdgePad);
    if (pos) {
      const p = viewport.toScreen(pos);
      const color = HANDLE_COLOURS[key] || '#888';
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.min(24, Math.max(13, radPx * 1.0))}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(LABELS[key] || '?', p.x, p.y);
    }
    const pos2 = getSecondaryHandlePosition(key, sheets, model, paperEdgePad);
    if (pos2) {
      const p = viewport.toScreen(pos2);
      const color = HANDLE_COLOURS[key] || '#888';
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.min(24, Math.max(13, radPx * 1.0))}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(LABELS[key] || '?', p.x, p.y);
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * Get all handle positions in world mm for hit-test and drag.
 * @returns {{ key: string, isSecondary: boolean, x: number, y: number }[]}
 */
export function getKeyRefHandlePositions(sheets, model, paperEdgePad = PAPER_EDGE_PAD_MM) {
  const out = [];
  const keys = ['left', 'right', 'front', 'back'];
  for (const key of keys) {
    const pos = getHandlePosition(key, sheets, model, paperEdgePad);
    if (pos) out.push({ key, isSecondary: false, x: pos.x, y: pos.y });
    const pos2 = getSecondaryHandlePosition(key, sheets, model, paperEdgePad);
    if (pos2) out.push({ key, isSecondary: true, x: pos2.x, y: pos2.y });
  }
  return out;
}

/**
 * Enforce ordering constraints (left < right, back < front, min separation).
 */
function enforceIdentityAndOrdering(model, plan) {
  if (!plan?.centre || !plan?.innerA4) return;
  const inner = plan.innerA4;
  const cx = plan.centre.x;
  const cy = plan.centre.y;
  const minX = inner.leftMm - cx;
  const maxX = inner.rightMm - cx;
  const minY = inner.topMm - cy;
  const maxY = inner.bottomMm - cy;

  if (model.left) {
    model.left.offsetX = Math.min(model.left.offsetX, -MIN_FROM_CENTRE_MM);
    model.left.offsetX = Math.max(model.left.offsetX, minX);
  }
  if (model.right) {
    model.right.offsetX = Math.max(model.right.offsetX, MIN_FROM_CENTRE_MM);
    model.right.offsetX = Math.min(model.right.offsetX, maxX);
  }
  if (model.back) {
    model.back.offsetY = Math.min(model.back.offsetY, -MIN_FROM_CENTRE_MM);
    model.back.offsetY = Math.max(model.back.offsetY, minY);
  }
  if (model.front) {
    model.front.offsetY = Math.max(model.front.offsetY, MIN_FROM_CENTRE_MM);
    model.front.offsetY = Math.min(model.front.offsetY, maxY);
  }
  if (model.left && model.right) {
    if (model.left.offsetX > model.right.offsetX - MIN_SEPARATION_MM) {
      model.left.offsetX = model.right.offsetX - MIN_SEPARATION_MM;
    }
    model.left.offsetX = Math.min(model.left.offsetX, -MIN_FROM_CENTRE_MM);
    model.right.offsetX = Math.max(model.right.offsetX, MIN_FROM_CENTRE_MM);
  }
  if (model.back && model.front) {
    if (model.back.offsetY > model.front.offsetY - MIN_SEPARATION_MM) {
      model.back.offsetY = model.front.offsetY - MIN_SEPARATION_MM;
    }
    model.back.offsetY = Math.min(model.back.offsetY, -MIN_FROM_CENTRE_MM);
    model.front.offsetY = Math.max(model.front.offsetY, MIN_FROM_CENTRE_MM);
  }
}

/**
 * Update model from drag: set offset from world position (left/right: offsetX, front/back: offsetY), then enforce constraints.
 */
export function applyKeyRefDrag(key, worldX, worldY, model, sheets, paperEdgePad = PAPER_EDGE_PAD_MM) {
  const plan = sheets?.plan;
  if (!plan?.centre) return;
  if (key === 'left' || key === 'right') {
    model[key].offsetX = worldX - plan.centre.x;
  } else {
    model[key].offsetY = worldY - plan.centre.y;
  }
  enforceIdentityAndOrdering(model, plan);
}
