// sheetLayout.js
const fabric = globalThis.fabric;

function safeMoveTo(canvas, obj, index) {
  if (!canvas || !obj) return;

  if (typeof canvas.moveTo === "function") {
    try {
      canvas.moveTo(obj, index);
      return;
    } catch (err) {}
  }

  if (typeof obj.moveTo === "function") {
    try {
      obj.moveTo(index);
      return;
    } catch (err) {}
  }
}

export function reorderGuideLayers(editor) {
  const canvas = editor.canvas;

  const shadows = editor.sheetGuides.filter((o) => o && o.isPaperShadow === true);
  const papers = editor.sheetGuides.filter((o) => o && o.isPaper === true);
  const frames = editor.sheetGuides.filter((o) => o && (o.isInnerA4Frame === true));
  const otherGuides = editor.sheetGuides.filter(
    (o) =>
      o &&
      o.isPaperShadow !== true &&
      o.isPaper !== true &&
      o.isInnerA4Frame !== true
  );

  let idx = 0;

  shadows.forEach((o) => {
    safeMoveTo(canvas, o, idx);
    idx += 1;
  });

  papers.forEach((o) => {
    safeMoveTo(canvas, o, idx);
    idx += 1;
  });

  frames.forEach((o) => {
    safeMoveTo(canvas, o, idx);
    idx += 1;
  });

  if (editor.sheetGrids && editor.sheetGrids.length) {
    editor.sheetGrids.forEach((o) => {
      safeMoveTo(canvas, o, idx);
      idx += 1;
    });
  }

  otherGuides.forEach((o) => {
    safeMoveTo(canvas, o, idx);
    idx += 1;
  });

  if (editor.sheetLabels && editor.sheetLabels.length) {
    editor.sheetLabels.forEach((o) => {
      safeMoveTo(canvas, o, idx);
      idx += 1;
    });
  }

  canvas.requestRenderAll();
}

function makeLabel(editor, text, cx, cy) {
  const t = new fabric.Text(text, {
    left: cx,
    top: cy,
    originX: "center",
    originY: "center",
    fontSize: 14,
    fontFamily: "Segoe UI, sans-serif",
    fill: "#666",
    selectable: false,
    evented: false,
    objectCaching: false
  });

  t.isSheetLabel = true;
  t.isSheetGuide = true;
  return t;
}

function createShadowRect(editor, cx, cy, wPx, hPx) {
  const r = new fabric.Rect({
    left: cx,
    top: cy,
    originX: "center",
    originY: "center",
    width: wPx + editor.paperEdgePad * 2,
    height: hPx + editor.paperEdgePad * 2,

    // important
    // keep a tiny fill so Fabric renders the shadow consistently
    fill: "rgba(0,0,0,0.001)",

    selectable: false,
    evented: false,
    objectCaching: false,
    strokeUniform: true,
    angle: 0,
    shadow: new fabric.Shadow({
      color: "rgba(0,0,0,0.45)",
      blur: 22,
      offsetX: 0,
      offsetY: 0
    })
  });

  r.isPaperShadow = true;
  r.isSheetGuide = true;

  return r;
}

function createPaperRect(editor, cx, cy, wPx, hPx) {
  const r = new fabric.Rect({
    left: cx,
    top: cy,
    originX: "center",
    originY: "center",
    width: wPx + editor.paperEdgePad * 2,
    height: hPx + editor.paperEdgePad * 2,

    // important
    // force true white so it pops against the dark background
    fill: "#ffffff",

    stroke: "#9a9a9a",
    strokeWidth: 2,

    selectable: false,

    // allow clicking the sheet to set active view
    evented: true,

    objectCaching: false,
    strokeUniform: true,
    angle: 0
  });

  r.isPaper = true;
  r.isSheetGuide = true;

  return r;
}

function createInnerA4Frame(editor, id, cx, cy, isLandscape) {
  const a4Wmm = isLandscape ? 297 : 210;
  const a4Hmm = isLandscape ? 210 : 297;

  const a4Wpx = editor.mmToPx(a4Wmm);
  const a4Hpx = editor.mmToPx(a4Hmm);

  const inner = new fabric.Rect({
    left: cx,
    top: cy,
    originX: "center",
    originY: "center",
    width: a4Wpx,
    height: a4Hpx,
    fill: "transparent",
    stroke: "#b0b0b0",
    strokeWidth: 1,
    strokeDashArray: [4, 4],
    selectable: false,
    evented: false,
    objectCaching: false,
    strokeUniform: true
  });

  inner.isSheetGuide = true;
  inner.isInnerA4Frame = true;
  inner.sheetId = id;

  const bounds = {
    left: cx - a4Wpx / 2,
    right: cx + a4Wpx / 2,
    top: cy - a4Hpx / 2,
    bottom: cy + a4Hpx / 2,
    width: a4Wpx,
    height: a4Hpx,
    cx,
    cy
  };

  return { inner, bounds };
}

export function initSheetLayout(editor) {
  const canvas = editor.canvas;

  // Remove previous sheet guides and labels
  try {
    [...(editor.sheetGuides || []), ...(editor.sheetLabels || [])].forEach((o) => {
      try {
        canvas.remove(o);
      } catch (err) {}
    });
  } catch (err) {}

  editor.sheetGuides = [];
  editor.sheetLabels = [];
  editor.sheets = {};

  const gapMM = 30;
  const gapPx = editor.mmToPx(gapMM);

  const a3LandscapeW = editor.mmToPx(editor.A3_L.w);
  const a3LandscapeH = editor.mmToPx(editor.A3_L.h);

  const a3PortraitW = editor.mmToPx(editor.A3_L.h);
  const a3PortraitH = editor.mmToPx(editor.A3_L.w);

  const planW = a3LandscapeW;
  const planH = a3LandscapeH;

  const frontW = a3LandscapeW;
  const frontH = a3LandscapeH;

  const backW = a3LandscapeW;
  const backH = a3LandscapeH;

  const leftW = a3PortraitW;
  const leftH = a3PortraitH;

  const rightW = a3PortraitW;
  const rightH = a3PortraitH;

  const planHalfMax = Math.max(planW, planH) / 2;
  const otherHalfMax = Math.max(frontW, frontH, backW, backH, leftW, leftH, rightW, rightH) / 2;
  const radius = planHalfMax + gapPx + otherHalfMax;

  const views = {
    plan: {
      cx: 0,
      cy: 0,
      wPx: planW,
      hPx: planH,
      label: "PLAN",
      a4Landscape: true
    },
    front: {
      cx: 0,
      cy: -radius,
      wPx: frontW,
      hPx: frontH,
      label: "FRONT",
      a4Landscape: true
    },
    right: {
      cx: radius,
      cy: 0,
      wPx: rightW,
      hPx: rightH,
      label: "RIGHT",
      a4Landscape: false
    },
    back: {
      cx: 0,
      cy: radius,
      wPx: backW,
      hPx: backH,
      label: "BACK",
      a4Landscape: true
    },
    left: {
      cx: -radius,
      cy: 0,
      wPx: leftW,
      hPx: leftH,
      label: "LEFT",
      a4Landscape: false
    }
  };

  Object.keys(views).forEach((id) => {
    const v = views[id];

    const sheet = {
      id,
      centre: { x: v.cx, y: v.cy },
      wPx: v.wPx,
      hPx: v.hPx,
      leftPx: v.cx - v.wPx / 2,
      topPx: v.cy - v.hPx / 2,
      label: v.label,
      innerA4: null
    };

    editor.sheets[id] = sheet;

    const shadow = createShadowRect(editor, v.cx, v.cy, v.wPx, v.hPx);
    shadow.sheetId = id;

    const paper = createPaperRect(editor, v.cx, v.cy, v.wPx, v.hPx);
    paper.sheetId = id;

    const innerFrame = createInnerA4Frame(editor, id, v.cx, v.cy, v.a4Landscape);
    sheet.innerA4 = innerFrame.bounds;

    const labelY = v.cy - v.hPx / 2 - editor.mmToPx(10);
    const label = makeLabel(editor, v.label, v.cx, labelY);
    label.sheetId = id;

    canvas.add(shadow);
    canvas.add(paper);
    canvas.add(innerFrame.inner);
    canvas.add(label);

    editor.sheetGuides.push(shadow);
    editor.sheetGuides.push(paper);
    editor.sheetGuides.push(innerFrame.inner);
    editor.sheetLabels.push(label);
  });

  reorderGuideLayers(editor);

  // extra safety
  // if any external layer ordering ran, bring paper back above shadows
  reorderGuideLayers(editor);

  canvas.requestRenderAll();
}
