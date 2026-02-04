// config.js

// config.js

export const CONFIG = {
  // 96 DPI browser default
  DPI: 96,

  // 1 inch = 25.4 mm
  // px per mm at 96 DPI
  DPI_RATIO: 96 / 25.4,

  // snap threshold in screen pixels
  SNAP_THRESHOLD: 15
};

export const STYLES = {
  detail_line: {
    stroke: "#111",
    strokeWidthPxAt100: 1.5,
    dashArray: null
  },

  ground_line: {
    stroke: "#111",
    strokeWidthPxAt100: 2.2,
    dashArray: null
  },

  overhead_line: {
    stroke: "#111",
    strokeWidthPxAt100: 1.2,
    dashArray: [12, 6]
  },

  pen_01: {
    stroke: "#111",
    strokeWidthPxAt100: 0.6,
    dashArray: null
  },

  pen_02: {
    stroke: "#111",
    strokeWidthPxAt100: 0.9,
    dashArray: null
  },

  pen_03: {
    stroke: "#111",
    strokeWidthPxAt100: 1.2,
    dashArray: null
  },

  pen_05: {
    stroke: "#111",
    strokeWidthPxAt100: 1.8,
    dashArray: null
  },

  pen_07: {
    stroke: "#111",
    strokeWidthPxAt100: 2.4,
    dashArray: null
  },

  pen_10: {
    stroke: "#111",
    strokeWidthPxAt100: 3.2,
    dashArray: null
  },

  pen_14: {
    stroke: "#111",
    strokeWidthPxAt100: 4.2,
    dashArray: null
  },

  pen_20: {
    stroke: "#111",
    strokeWidthPxAt100: 6.0,
    dashArray: null
  },

  pen_30: {
    stroke: "#111",
    strokeWidthPxAt100: 8.5,
    dashArray: null
  },

  grid_line: {
    stroke: "rgba(255,255,255,0.22)",
    strokeWidthPxAt100: 1,
    dashArray: null
  }
};

function resolveStyle(styleOrKey) {
  if (!styleOrKey) return STYLES.detail_line;

  if (typeof styleOrKey === "string") {
    return STYLES[styleOrKey] || STYLES.detail_line;
  }

  return styleOrKey;
}

function getScaledStrokeWidthPx(style, scale = 100) {
  const base = style.strokeWidthPxAt100 || 1.5;
  const s = isFinite(scale) && scale > 0 ? scale : 100;
  return base * (s / 100);
}

/**
 * applyStyleToObject supports two call styles
 * 1 applyStyleToObject(obj, "detail_line", scale, isWireframe)
 * 2 applyStyleToObject(obj, STYLES.detail_line, isWireframe)
 */
export function applyStyleToObject(obj, styleOrKey, a, b) {
  if (!obj) return;

  let style = null;
  let scale = 100;
  let isWireframe = true;

  if (typeof styleOrKey === "string") {
    style = resolveStyle(styleOrKey);
    scale = typeof a === "number" ? a : 100;
    isWireframe = typeof b === "boolean" ? b : true;
  } else {
    style = resolveStyle(styleOrKey);
    isWireframe = typeof a === "boolean" ? a : true;
  }

  const strokeWidth = getScaledStrokeWidthPx(style, scale);

  const isPaperLike =
    obj.isPaper === true ||
    obj.isPaperShadow === true ||
    obj.isSheetGuide === true ||
    obj.isInnerA4Frame === true ||
    obj.isSheetLabel === true;

  // Never restyle paper elements
  if (isPaperLike) return;

  // Never restyle background grid
  if (obj.isGrid === true || obj.isGridLine === true || obj.isPaperGrid === true) return;

  // Never restyle key reference graphics
  if (obj.isKeyReference === true || obj.isKeyReferenceHandle === true || obj.isReferenceDashedLine === true) return;

  // Filled region polygon support
  if ((obj.objectType === "filledregion" || obj.objectType === "filled-region") && obj.type === "polygon") {
    obj.set({
      stroke: style.stroke || "#111",
      strokeWidth,
      strokeDashArray: style.dashArray || null,
      fill: isWireframe ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.15)"
    });

    obj.strokeUniform = true;
    obj.objectCaching = false;
    obj.dirty = true;
    return;
  }

  // Default linework styling
  obj.set({
    stroke: style.stroke || "#111",
    strokeWidth,
    strokeDashArray: style.dashArray || null
  });

  obj.strokeUniform = true;
  obj.objectCaching = false;
  obj.dirty = true;
}
