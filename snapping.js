// snapping.js - CAD-grade snapping (stable, accurate, arc midpoint/endpoints correct)
const fabric = globalThis.fabric;

/* ----------------------------- helpers ----------------------------- */

function worldToScreen(canvas, pt) {
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const p = fabric.util.transformPoint(new fabric.Point(pt.x, pt.y), vpt);
  return { x: p.x, y: p.y };
}

function getZoomMagnitudeFromVpt(canvas) {
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  return Math.hypot(vpt[0], vpt[1]) || 1;
}

function angleRadBetween(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function normaliseAngleRad(a) {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
}

function distPx(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function kindPriority(kind) {
  switch (kind) {
    case "end":
    case "vertex":
      return 0;
    case "intersection":
      return 1;
    case "half":
      return 2;
    case "quadrant":
      return 3;
    case "centre":
      return 4;
    case "perpendicular":
      return 5;
    case "parallel":
      return 6;
    case "tangent":
      return 7;
    case "extension":
      return 8;
    case "grid":
      return 9;
    default:
      return 10;
  }
}

function objectIsNonSnappable(obj) {
  if (!obj) return true;
  if (obj.visible === false) return true;

  // Phase 5:
  // Overlay plan objects are intentionally non-evented/non-selectable,
  // but we still want snapping to consider them.
  const allowSnapOnly = obj.isOverlayReference === true;

  if (obj.evented === false && !allowSnapOnly) return true;

  // Sheet furniture
  if (obj.isSheetGuide === true) return true;
  if (obj.isPaper === true) return true;
  if (obj.isPaperShadow === true) return true;
  if (obj.isSheetLabel === true) return true;
  if (obj.isInnerA4Frame === true) return true;

  // Paper grids
  if (obj.isGrid === true) return true;
  if (obj.isGridLine === true) return true;
  if (obj.isPaperGrid === true) return true;

  // Building grid
  if (obj.isKeyReference === true) return true;
  if (obj.isKeyReferenceHandle === true) return true;
  if (obj.isReferenceDashedLine === true) return true;

  // Tool visuals
  if (obj.isToolPreview === true) return true;
  if (obj.isEndpointMarker === true) return true;

  return false;
}

function aabbIntersects(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function lineIntersection(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };

  const rxs = r.x * s.y - r.y * s.x;
  const q_p = { x: c.x - a.x, y: c.y - a.y };

  if (Math.abs(rxs) < 1e-10) return null;

  const t = (q_p.x * s.y - q_p.y * s.x) / rxs;
  const u = (q_p.x * r.y - q_p.y * r.x) / rxs;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

function lineCircleIntersections(a, b, c, r) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  const fx = a.x - c.x;
  const fy = a.y - c.y;

  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;

  const disc = B * B - 4 * A * C;
  if (disc < 0 || Math.abs(A) < 1e-12) return [];

  const sd = Math.sqrt(disc);
  const t1 = (-B - sd) / (2 * A);
  const t2 = (-B + sd) / (2 * A);

  const out = [];
  if (t1 >= 0 && t1 <= 1) out.push({ x: a.x + t1 * dx, y: a.y + t1 * dy });
  if (t2 >= 0 && t2 <= 1 && Math.abs(t2 - t1) > 1e-8) out.push({ x: a.x + t2 * dx, y: a.y + t2 * dy });
  return out;
}

function circleCircleIntersections(c0, r0, c1, r1) {
  const dx = c1.x - c0.x;
  const dy = c1.y - c0.y;
  const d = Math.hypot(dx, dy);

  if (!isFinite(d) || d < 1e-10) return [];
  if (d > r0 + r1) return [];
  if (d < Math.abs(r0 - r1)) return [];

  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h2 = r0 * r0 - a * a;
  if (h2 < 0) return [];

  const h = Math.sqrt(h2);
  const xm = c0.x + (a * dx) / d;
  const ym = c0.y + (a * dy) / d;

  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;

  const p1 = { x: xm + rx, y: ym + ry };
  const p2 = { x: xm - rx, y: ym - ry };

  if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < 1e-8) return [p1];
  return [p1, p2];
}

function snapAngleRadians(angleRad, stepRad) {
  return Math.round(angleRad / stepRad) * stepRad;
}

/**
 * SVG arc midpoint computed from endpoints and arc params.
 * Returns midpoint in same coordinate space as inputs.
 */
function computeSvgArcMidpoint(p0, p1, rx0, ry0, phiDegIn, largeArcFlag, sweepFlag) {
  let rx = Math.abs(Number(rx0) || 0);
  let ry = Math.abs(Number(ry0) || 0);
  if (!isFinite(rx) || !isFinite(ry) || rx <= 0 || ry <= 0) return null;

  const phi = (Number(phiDegIn) || 0) * (Math.PI / 180);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (p0.x - p1.x) / 2;
  const dy2 = (p0.y - p1.y) / 2;

  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  const laf = largeArcFlag ? 1 : 0;
  const sf = sweepFlag ? 1 : 0;

  const sign = laf === sf ? -1 : 1;
  const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  const den = rxSq * y1pSq + rySq * x1pSq;
  if (den === 0) return null;

  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (coef * -ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2;

  const v1 = { x: (x1p - cxp) / rx, y: (y1p - cyp) / ry };
  const v2 = { x: (-x1p - cxp) / rx, y: (-y1p - cyp) / ry };

  const ang = (u, v) => Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);

  const theta1 = Math.atan2(v1.y, v1.x);
  let dtheta = ang(v1, v2);

  if (!sf && dtheta > 0) dtheta -= Math.PI * 2;
  if (sf && dtheta < 0) dtheta += Math.PI * 2;

  const thetaMid = theta1 + dtheta / 2;

  const x = cx + rx * cosPhi * Math.cos(thetaMid) - ry * sinPhi * Math.sin(thetaMid);
  const y = cy + rx * sinPhi * Math.cos(thetaMid) + ry * cosPhi * Math.sin(thetaMid);

  if (!isFinite(x) || !isFinite(y)) return null;
  return { x, y };
}

// Projection (unbounded) of point onto infinite line (AB)
function projectPointToInfiniteLine(pt, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dd = dx * dx + dy * dy;
  if (dd < 1e-12) return null;
  const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / dd;
  return { x: a.x + t * dx, y: a.y + t * dy, t };
}

function anglesAreParallel(ang1, ang2, tolerance = 0.05) {
  const diff = Math.abs(normaliseAngleRad(ang1 - ang2));
  return diff < tolerance || Math.abs(diff - Math.PI) < tolerance;
}

function anglesArePerpendicular(ang1, ang2, tolerance = 0.05) {
  const diff = Math.abs(normaliseAngleRad(ang1 - ang2));
  return Math.abs(diff - Math.PI / 2) < tolerance || Math.abs(diff - 3 * Math.PI / 2) < tolerance;
}

/* ----------------------- smooth camera rotation ---------------------- */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function easeInOutCubic(t) {
  // 0..1 -> 0..1
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Rotation-safe zoom magnitude from a viewportTransform
function zoomFromVpt(vpt) {
  const a = vpt && vpt.length ? vpt[0] : 1;
  const b = vpt && vpt.length ? vpt[1] : 0;
  const z = Math.hypot(a, b);
  return isFinite(z) && z > 0 ? z : 1;
}

// Rotation angle from VPT (radians)
function angleFromVpt(vpt) {
  const a = vpt && vpt.length ? vpt[0] : 1;
  const b = vpt && vpt.length ? vpt[1] : 0;
  return Math.atan2(b, a);
}

function getPivotWorld(editor) {
  // Prefer plan centre if available
  if (editor && editor.sheets && editor.sheets.plan && editor.sheets.plan.centre) {
    const c = editor.sheets.plan.centre;
    return { x: c.x, y: c.y };
  }

  // Fallback: centre of all paper bounds
  const canvas = editor?.canvas;
  if (!canvas) return { x: 0, y: 0 };

  const papers = canvas.getObjects().filter((o) => o && o.isPaper === true);
  if (!papers.length) return { x: 0, y: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  papers.forEach((o) => {
    const r = o.getBoundingRect(true, true);
    minX = Math.min(minX, r.left);
    minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.left + r.width);
    maxY = Math.max(maxY, r.top + r.height);
  });

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function applyViewport(editor, vpt) {
  const canvas = editor?.canvas;
  if (!canvas) return;

  canvas.setViewportTransform(vpt);

  // Keep your existing editor hooks (same pattern as InputRouter)
  try {
    editor?.refreshCurrentZoom?.();
  } catch (err) {}

  try {
    if (editor?.showGrid) editor?.drawGrid?.();
  } catch (err) {}

  try {
    editor?.keyRefs?.reorderLayers?.();
  } catch (err) {}

  canvas.requestRenderAll();
}

/* --------------------------- snapping engine --------------------------- */

export class SnappingEngine {
  constructor(editor) {
    this.editor = editor;
    this.canvas = editor.canvas;

    this.enabled = true;

    this.wrapperEl = document.getElementById("canvas-wrapper");
    this.snapIndicatorEl = document.getElementById("snap-indicator");
    this.edgeIndicatorEl = document.getElementById("edge-indicator");
    this.midIndicatorEl = document.getElementById("mid-indicator");

    // Less “sticky”, more stable
    this.lastSnap = null;
    this.lastSnapHoldPx = 6;

    // Angle snap mode: "off" | "shift" | "always"
    this.angleSnapMode = "shift";
    this.angleSnapStepDeg = 45;

    // Advanced snaps default OFF (these are the main reason snapping can feel chaotic)
    this.enablePerpendicularSnap = false;
    this.enableParallelSnap = false;
    this.enableQuadrantSnap = true;
    this.enableTangentSnap = false;
    this.enableExtensionSnap = false;

    // Reference line for perpendicular/parallel/tangent
    this.referenceLine = null;

    // Simple cache (rebuild candidates only when objects likely changed)
    this._cacheKey = "";
    this._cache = { pts: [], segs: [], circles: [] };

    // Rotation animation
    this._rotRaf = 0;
  }

  /* ---------------------- rotation API (new) ---------------------- */

  /**
   * Rotate the camera smoothly by a delta (degrees).
   * Example: snapper.rotateViewAnimated(90)
   */
  rotateViewAnimated(deltaDeg = 90, opts = {}) {
    const delta = (Number(deltaDeg) || 0) * (Math.PI / 180);
    const canvas = this.canvas;
    if (!canvas) return;

    const vpt0 = (canvas.viewportTransform || [1, 0, 0, 1, 0, 0]).slice();
    const z = zoomFromVpt(vpt0);
    const a0 = angleFromVpt(vpt0);

    // target angle (normalized) – keep it tidy
    const a1 = normaliseAngleRad(a0 + delta);

    this.setViewAngleAnimated(a1, { ...opts, zoom: z });
  }

  /**
   * Animate camera to an absolute angle (radians).
   * Keeps pivot world point fixed in screen space.
   */
  setViewAngleAnimated(targetAngleRad, opts = {}) {
    const canvas = this.canvas;
    const editor = this.editor;
    if (!canvas) return;

    // Cancel any in-progress anim
    if (this._rotRaf) {
      try { cancelAnimationFrame(this._rotRaf); } catch (err) {}
      this._rotRaf = 0;
    }

    const durationMs = clamp(Number(opts.durationMs ?? 220), 80, 1200);

    const vptStart = (canvas.viewportTransform || [1, 0, 0, 1, 0, 0]).slice();
    const zoom = isFinite(opts.zoom) && opts.zoom > 0 ? opts.zoom : zoomFromVpt(vptStart);

    const a0 = angleFromVpt(vptStart);
    let da = normaliseAngleRad(targetAngleRad - a0);

    // Choose shortest path
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;

    const pivotWorld = getPivotWorld(editor);
    const pivotScreen = fabric.util.transformPoint(new fabric.Point(pivotWorld.x, pivotWorld.y), vptStart);

    const t0 = performance.now();

    const tick = (now) => {
      const t = clamp((now - t0) / durationMs, 0, 1);
      const k = easeInOutCubic(t);
      const ang = a0 + da * k;

      const cos = Math.cos(ang);
      const sin = Math.sin(ang);

      // Base rotation+zoom matrix (no translation yet)
      const vpt = [
        zoom * cos,
        zoom * sin,
        -zoom * sin,
        zoom * cos,
        0,
        0
      ];

      // Set translation so pivot stays locked at the same screen pixel
      const mapped = fabric.util.transformPoint(new fabric.Point(pivotWorld.x, pivotWorld.y), vpt);
      vpt[4] = pivotScreen.x - mapped.x;
      vpt[5] = pivotScreen.y - mapped.y;

      applyViewport(editor, vpt);

      if (t < 1) {
        this._rotRaf = requestAnimationFrame(tick);
      } else {
        this._rotRaf = 0;
      }
    };

    this._rotRaf = requestAnimationFrame(tick);
  }

  /* ---------------------- existing snapping API ---------------------- */

  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this.hideIndicators();
  }

  setAngleSnapMode(mode) {
    const m = String(mode || "").toLowerCase();
    if (m === "off" || m === "shift" || m === "always") this.angleSnapMode = m;
  }

  getAngleSnapMode() {
    return this.angleSnapMode;
  }

  shouldAngleSnap(shiftKey) {
    if (this.angleSnapMode === "always") return true;
    if (this.angleSnapMode === "shift") return !!shiftKey;
    return false;
  }

  hideIndicators() {
    if (this.snapIndicatorEl) this.snapIndicatorEl.style.display = "none";
    if (this.edgeIndicatorEl) this.edgeIndicatorEl.style.display = "none";
    if (this.midIndicatorEl) this.midIndicatorEl.style.display = "none";
  }

  showIndicator(el, screenPt, kind = "") {
    if (!el) return;

    let x = screenPt.x;
    let y = screenPt.y;

    try {
      const wrapperRect = this.wrapperEl?.getBoundingClientRect();
      const canvasRect = this.canvas.upperCanvasEl?.getBoundingClientRect();
      if (wrapperRect && canvasRect) {
        x = canvasRect.left - wrapperRect.left + screenPt.x;
        y = canvasRect.top - wrapperRect.top + screenPt.y;
      }
    } catch (err) {}

    el.style.display = "block";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    const colors = {
      end: "#00ff00",
      vertex: "#00ff00",
      intersection: "#ff00ff",
      half: "#00ffff",
      centre: "#ffff00",
      quadrant: "#ff8800",
      perpendicular: "#8888ff",
      parallel: "#8888ff",
      tangent: "#ff88ff",
      extension: "#ff4444",
      grid: "#ffffff"
    };

    if (colors[kind]) {
      el.style.borderColor = colors[kind];
      el.style.boxShadow = `0 0 8px ${colors[kind]}`;
    } else {
      el.style.borderColor = "";
      el.style.boxShadow = "";
    }

    const labels = { half: "½", quadrant: "Q", perpendicular: "⊥", parallel: "∥", tangent: "T", extension: "E" };
    el.setAttribute("data-label", labels[kind] || "");
  }

  getSnapThresholdScreenPx() {
    const base = Number(this.editor?.CONFIG?.SNAP_THRESHOLD ?? 12);
    const px = isFinite(base) ? base : 12;
    return Math.min(22, Math.max(6, px));
  }

  getSnapThresholdWorldPx() {
    const px = this.getSnapThresholdScreenPx();
    const zoomMag = getZoomMagnitudeFromVpt(this.canvas);
    return px / zoomMag;
  }

  _buildCacheKey() {
    const objs = this.canvas.getObjects();
    let key = `${objs.length}|`;

    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (!o || objectIsNonSnappable(o)) continue;

      key += `${o.type}:${o.left ?? 0},${o.top ?? 0},${o.scaleX ?? 1},${o.scaleY ?? 1},${o.angle ?? 0}|`;

      if (o.type === "line") {
        key += `L:${o.x1 ?? 0},${o.y1 ?? 0},${o.x2 ?? 0},${o.y2 ?? 0}|`;
      } else if (o.type === "circle") {
        key += `C:${o.radius ?? 0}|`;
      } else if (o.type === "polyline" || o.type === "polygon") {
        const pts = Array.isArray(o.points) ? o.points : [];
        const off = o.pathOffset ? `${o.pathOffset.x},${o.pathOffset.y}` : "0,0";
        key += `P:${pts.length}:${off}|`;
        if (pts.length) {
          const a = pts[0], b = pts[(pts.length / 2) | 0], c = pts[pts.length - 1];
          key += `p0:${a.x},${a.y}|pm:${b.x},${b.y}|pN:${c.x},${c.y}|`;
        }
      } else if (o.type === "path") {
        const path = Array.isArray(o.path) ? o.path : [];
        key += `S:${o.objectType || ""}:${path.length}|`;
        const last = path.length ? path[path.length - 1] : null;
        if (last) key += `sl:${last.join(",")}|`;
      }
    }

    return key;
  }

  _getCachedCandidates() {
    const key = this._buildCacheKey();
    if (key === this._cacheKey) return this._cache;
    this._cacheKey = key;
    this._cache = this.getCandidatesSegmentsCirclesWorld();
    return this._cache;
  }

  _pushUnique(ptsOut, p, kind, angleRad = null, srcId = null) {
    const eps = 1e-4;
    for (let i = 0; i < ptsOut.length; i++) {
      const q = ptsOut[i];
      if (q.kind !== kind) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) < eps) return;
    }
    ptsOut.push({ x: p.x, y: p.y, kind, angleRad, srcId });
  }

  addLineCandidates(lineObj, ptsOut, segsOut) {
    const matrix = lineObj.calcTransformMatrix();

    const p1World = fabric.util.transformPoint(new fabric.Point(lineObj.x1, lineObj.y1), matrix);
    const p2World = fabric.util.transformPoint(new fabric.Point(lineObj.x2, lineObj.y2), matrix);

    const a = { x: p1World.x, y: p1World.y };
    const b = { x: p2World.x, y: p2World.y };

    const ang = normaliseAngleRad(angleRadBetween(a, b));
    const id = lineObj.__uid || (lineObj.__uid = `o${Math.random().toString(36).slice(2)}`);

    this._pushUnique(ptsOut, a, "end", ang, id);
    this._pushUnique(ptsOut, b, "end", ang, id);
    this._pushUnique(ptsOut, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, "half", ang, id);

    segsOut.push({ a, b, angle: ang, src: lineObj.type, srcId: id });
  }

  addCircleCandidates(circleObj, circlesOut, ptsOut) {
    const center = circleObj.getCenterPoint();
    const cWorld = { x: center.x, y: center.y };

    const sx = Math.abs(circleObj.scaleX ?? 1);
    const sy = Math.abs(circleObj.scaleY ?? 1);
    const r = (circleObj.radius ?? 0) * Math.max(sx, sy);

    const id = circleObj.__uid || (circleObj.__uid = `o${Math.random().toString(36).slice(2)}`);

    circlesOut.push({ c: cWorld, r, srcId: id });
    this._pushUnique(ptsOut, cWorld, "centre", null, id);

    if (this.enableQuadrantSnap && r > 1e-9) {
      const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      for (const a of angles) {
        this._pushUnique(
          ptsOut,
          { x: cWorld.x + r * Math.cos(a), y: cWorld.y + r * Math.sin(a) },
          "quadrant",
          a,
          id
        );
      }
    }
  }

  addPolylineOrPolygonCandidates(polyObj, ptsOut, segsOut) {
    const matrix = polyObj.calcTransformMatrix();
    const localPts = polyObj.points;
    if (!Array.isArray(localPts) || localPts.length === 0) return;

    const off = polyObj.pathOffset ? { x: polyObj.pathOffset.x, y: polyObj.pathOffset.y } : { x: 0, y: 0 };
    const id = polyObj.__uid || (polyObj.__uid = `o${Math.random().toString(36).slice(2)}`);

    const worldPts = localPts.map((pt) => {
      const w = fabric.util.transformPoint(new fabric.Point(pt.x - off.x, pt.y - off.y), matrix);
      return { x: w.x, y: w.y };
    });

    for (let i = 0; i < worldPts.length; i++) {
      this._pushUnique(ptsOut, worldPts[i], "vertex", null, id);
    }

    const isClosed = polyObj.type === "polygon";
    const segCount = isClosed ? worldPts.length : worldPts.length - 1;

    for (let i = 0; i < segCount; i++) {
      const a = worldPts[i];
      const b = worldPts[(i + 1) % worldPts.length];
      const ang = normaliseAngleRad(angleRadBetween(a, b));

      this._pushUnique(ptsOut, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, "half", ang, id);
      segsOut.push({ a, b, angle: ang, src: polyObj.type, srcId: id });
    }
  }

  addArcPathCandidates(pathObj, ptsOut) {
    if (!pathObj || pathObj.type !== "path") return;
    if (pathObj.objectType !== "arc") return;

    const cmds = pathObj.path;
    if (!Array.isArray(cmds) || cmds.length < 2) return;

    const first = cmds[0];
    if (!first || first[0] !== "M") return;

    let lastA = null;
    for (let i = cmds.length - 1; i >= 0; i--) {
      const c = cmds[i];
      if (c && (c[0] === "A" || c[0] === "a")) {
        lastA = c;
        break;
      }
    }
    if (!lastA) return;

    const mtx = pathObj.calcTransformMatrix();
    const off = pathObj.pathOffset ? { x: pathObj.pathOffset.x, y: pathObj.pathOffset.y } : { x: 0, y: 0 };
    const id = pathObj.__uid || (pathObj.__uid = `o${Math.random().toString(36).slice(2)}`);

    const startLocal = { x: Number(first[1]) - off.x, y: Number(first[2]) - off.y };
    const endLocal = { x: Number(lastA[6]) - off.x, y: Number(lastA[7]) - off.y };

    const toWorld = (pt) => {
      const w = fabric.util.transformPoint(new fabric.Point(pt.x, pt.y), mtx);
      return { x: w.x, y: w.y };
    };

    const aW = toWorld(startLocal);
    const bW = toWorld(endLocal);
    const ang = normaliseAngleRad(angleRadBetween(aW, bW));

    this._pushUnique(ptsOut, aW, "end", ang, id);
    this._pushUnique(ptsOut, bW, "end", ang, id);

    const rx = Math.abs(Number(lastA[1]) || 0);
    const ry = Math.abs(Number(lastA[2]) || 0);
    const phiDeg = Number(lastA[3]) || 0;
    const laf = Number(lastA[4]) ? 1 : 0;
    const sf = Number(lastA[5]) ? 1 : 0;

    const midLocal = computeSvgArcMidpoint(startLocal, endLocal, rx, ry, phiDeg, laf, sf);
    const midW = midLocal ? toWorld(midLocal) : { x: (aW.x + bW.x) / 2, y: (aW.y + bW.y) / 2 };
    this._pushUnique(ptsOut, midW, "half", ang, id);
  }

  getCandidatesSegmentsCirclesWorld() {
    const pts = [];
    const segs = [];
    const circles = [];

    this.canvas.getObjects().forEach((obj) => {
      if (!obj || objectIsNonSnappable(obj)) return;

      if (obj.type === "line") return this.addLineCandidates(obj, pts, segs);
      if (obj.type === "circle") return this.addCircleCandidates(obj, circles, pts);
      if (obj.type === "polygon" || obj.type === "polyline") return this.addPolylineOrPolygonCandidates(obj, pts, segs);
      if (obj.type === "path") return this.addArcPathCandidates(obj, pts);
    });

    return { pts, segs, circles };
  }

  addSegmentIntersections(pointerScreen, segs, ptsOut, thresholdPx) {
    const cursorBox = {
      minX: pointerScreen.x - thresholdPx * 3,
      maxX: pointerScreen.x + thresholdPx * 3,
      minY: pointerScreen.y - thresholdPx * 3,
      maxY: pointerScreen.y + thresholdPx * 3
    };

    const active = segs
      .map((s) => {
        const aS = worldToScreen(this.canvas, s.a);
        const bS = worldToScreen(this.canvas, s.b);
        const aabb = {
          minX: Math.min(aS.x, bS.x),
          maxX: Math.max(aS.x, bS.x),
          minY: Math.min(aS.y, bS.y),
          maxY: Math.max(aS.y, bS.y)
        };
        return { ...s, aabb };
      })
      .filter((s) => aabbIntersects(s.aabb, cursorBox));

    if (active.length < 2) return;

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const si = active[i];
        const sj = active[j];
        if (!aabbIntersects(si.aabb, sj.aabb)) continue;

        const ip = lineIntersection(si.a, si.b, sj.a, sj.b);
        if (!ip) continue;

        const ipS = worldToScreen(this.canvas, ip);
        if (distPx(ipS, pointerScreen) > thresholdPx) continue;

        this._pushUnique(ptsOut, ip, "intersection", null, "ix");
      }
    }
  }

  addLineCircleIntersections(pointerScreen, segs, circles, ptsOut, thresholdPx) {
    for (const s of segs) {
      for (const cc of circles) {
        const ips = lineCircleIntersections(s.a, s.b, cc.c, cc.r);
        for (const ip of ips) {
          const ipS = worldToScreen(this.canvas, ip);
          if (distPx(ipS, pointerScreen) <= thresholdPx) {
            this._pushUnique(ptsOut, ip, "intersection", null, "ix");
          }
        }
      }
    }
  }

  addCircleCircleIntersections(pointerScreen, circles, ptsOut, thresholdPx) {
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const c0 = circles[i];
        const c1 = circles[j];
        const ips = circleCircleIntersections(c0.c, c0.r, c1.c, c1.r);
        for (const ip of ips) {
          const ipS = worldToScreen(this.canvas, ip);
          if (distPx(ipS, pointerScreen) <= thresholdPx) {
            this._pushUnique(ptsOut, ip, "intersection", null, "ix");
          }
        }
      }
    }
  }

  addPerpendicularSnaps(pointerWorld, pointerScreen, segs, ptsOut, thresholdPx) {
    if (!this.enablePerpendicularSnap || !this.referenceLine) return;

    const refAngle = angleRadBetween(this.referenceLine.start, this.referenceLine.end);

    for (const seg of segs) {
      const segAngle = angleRadBetween(seg.a, seg.b);
      if (!anglesArePerpendicular(refAngle, segAngle)) continue;

      const proj = projectPointToInfiniteLine(pointerWorld, seg.a, seg.b);
      if (!proj) continue;
      if (proj.t < 0 || proj.t > 1) continue;

      const projS = worldToScreen(this.canvas, proj);
      if (distPx(projS, pointerScreen) <= thresholdPx) {
        this._pushUnique(ptsOut, proj, "perpendicular", segAngle, seg.srcId);
      }
    }
  }

  addParallelSnaps(pointerWorld, pointerScreen, segs, ptsOut, thresholdPx) {
    if (!this.enableParallelSnap || !this.referenceLine) return;

    const refAngle = angleRadBetween(this.referenceLine.start, this.referenceLine.end);

    for (const seg of segs) {
      const segAngle = angleRadBetween(seg.a, seg.b);
      if (!anglesAreParallel(refAngle, segAngle)) continue;

      const proj = projectPointToInfiniteLine(pointerWorld, seg.a, seg.b);
      if (!proj) continue;
      if (proj.t < 0 || proj.t > 1) continue;

      const projS = worldToScreen(this.canvas, proj);
      if (distPx(projS, pointerScreen) <= thresholdPx) {
        this._pushUnique(ptsOut, proj, "parallel", segAngle, seg.srcId);
      }
    }
  }

  addTangentSnaps(pointerWorld, pointerScreen, circles, ptsOut, thresholdPx) {
    if (!this.enableTangentSnap || !this.referenceLine) return;

    const p = this.referenceLine.start;

    for (const circle of circles) {
      const dx = circle.c.x - p.x;
      const dy = circle.c.y - p.y;
      const d = Math.hypot(dx, dy);
      if (!(d > circle.r + 1e-9)) continue;

      const base = Math.atan2(dy, dx);
      const alpha = Math.acos(circle.r / d);

      const t1 = base + alpha;
      const t2 = base - alpha;

      const pts = [
        { x: circle.c.x + circle.r * Math.cos(t1), y: circle.c.y + circle.r * Math.sin(t1) },
        { x: circle.c.x + circle.r * Math.cos(t2), y: circle.c.y + circle.r * Math.sin(t2) }
      ];

      for (const tp of pts) {
        const tpS = worldToScreen(this.canvas, tp);
        if (distPx(tpS, pointerScreen) <= thresholdPx) {
          this._pushUnique(ptsOut, tp, "tangent", null, circle.srcId);
        }
      }
    }
  }

  addExtensionSnaps(pointerWorld, pointerScreen, segs, ptsOut, thresholdPx) {
    if (!this.enableExtensionSnap) return;

    for (const seg of segs) {
      const proj = projectPointToInfiniteLine(pointerWorld, seg.a, seg.b);
      if (!proj) continue;

      if (proj.t >= 0 && proj.t <= 1) continue;

      const projS = worldToScreen(this.canvas, proj);
      if (distPx(projS, pointerScreen) <= thresholdPx) {
        this._pushUnique(ptsOut, proj, "extension", seg.angle, seg.srcId);
      }
    }
  }

  pickBestCandidate(pointerWorld) {
    const thresholdPx = this.getSnapThresholdScreenPx();
    const pointerScreen = worldToScreen(this.canvas, pointerWorld);

    const { pts, segs, circles } = this._getCachedCandidates();
    const ptsDynamic = pts.slice();

    this.addSegmentIntersections(pointerScreen, segs, ptsDynamic, thresholdPx);
    this.addLineCircleIntersections(pointerScreen, segs, circles, ptsDynamic, thresholdPx);
    this.addCircleCircleIntersections(pointerScreen, circles, ptsDynamic, thresholdPx);

    this.addPerpendicularSnaps(pointerWorld, pointerScreen, segs, ptsDynamic, thresholdPx);
    this.addParallelSnaps(pointerWorld, pointerScreen, segs, ptsDynamic, thresholdPx);
    this.addTangentSnaps(pointerWorld, pointerScreen, circles, ptsDynamic, thresholdPx);
    this.addExtensionSnaps(pointerWorld, pointerScreen, segs, ptsDynamic, thresholdPx);

    const box = {
      minX: pointerScreen.x - thresholdPx,
      maxX: pointerScreen.x + thresholdPx,
      minY: pointerScreen.y - thresholdPx,
      maxY: pointerScreen.y + thresholdPx
    };

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestD = Number.POSITIVE_INFINITY;

    const priorityBiasPx = 0.9;

    for (const c of ptsDynamic) {
      const cS = worldToScreen(this.canvas, c);
      if (cS.x < box.minX || cS.x > box.maxX || cS.y < box.minY || cS.y > box.maxY) continue;

      const d = distPx(cS, pointerScreen);
      if (d > thresholdPx) continue;

      const p = kindPriority(c.kind);
      const score = d + p * priorityBiasPx;

      if (
        !best ||
        score < bestScore - 1e-6 ||
        (Math.abs(score - bestScore) <= 0.2 && d < bestD - 1e-6)
      ) {
        best = c;
        bestScore = score;
        bestD = d;
      }
    }

    if (this.lastSnap) {
      const lastS = worldToScreen(this.canvas, this.lastSnap);
      const dLast = distPx(lastS, pointerScreen);

      if (dLast <= thresholdPx + this.lastSnapHoldPx) {
        if (!best) return { best: this.lastSnap };

        const lastP = kindPriority(this.lastSnap.kind);
        const lastScore = dLast + lastP * priorityBiasPx;

        if (bestScore + 0.35 >= lastScore) {
          return { best: this.lastSnap };
        }
      }
    }

    return { best };
  }

  applySnapToPointer(pointerWorld) {
    if (!this.enabled) return { snapped: false, point: pointerWorld };

    const { best } = this.pickBestCandidate(pointerWorld);

    if (!best) {
      this.hideIndicators();
      this.lastSnap = null;
      return { snapped: false, point: pointerWorld };
    }

    const snappedPt = { x: best.x, y: best.y };
    const screenPt = worldToScreen(this.canvas, snappedPt);

    if (best.kind === "half") {
      this.showIndicator(this.midIndicatorEl, screenPt, "half");
      if (this.snapIndicatorEl) this.snapIndicatorEl.style.display = "none";
      if (this.edgeIndicatorEl) this.edgeIndicatorEl.style.display = "none";
    } else {
      this.showIndicator(this.snapIndicatorEl, screenPt, best.kind);
      if (this.edgeIndicatorEl) this.edgeIndicatorEl.style.display = "none";
      if (this.midIndicatorEl) this.midIndicatorEl.style.display = "none";
    }

    this.lastSnap = best;
    return { snapped: true, point: snappedPt, target: best };
  }

  applyAngleSnap(originWorld, pointerWorld, opts = {}) {
    const stepDeg = opts.stepDeg ?? this.angleSnapStepDeg;
    const stepRad = (stepDeg * Math.PI) / 180;

    const shiftKey = !!opts.shiftKey;
    const enabled = opts.enabled ?? this.shouldAngleSnap(shiftKey);
    if (!enabled) return pointerWorld;

    const ang = normaliseAngleRad(angleRadBetween(originWorld, pointerWorld));
    const snappedAng = snapAngleRadians(ang, stepRad);

    const len = Math.hypot(pointerWorld.x - originWorld.x, pointerWorld.y - originWorld.y);
    return {
      x: originWorld.x + Math.cos(snappedAng) * len,
      y: originWorld.y + Math.sin(snappedAng) * len
    };
  }

  setReferenceLine(startPt, endPt) {
    if (startPt && endPt) {
      this.referenceLine = { start: { x: startPt.x, y: startPt.y }, end: { x: endPt.x, y: endPt.y } };
    } else {
      this.referenceLine = null;
    }
  }

  clearReferenceLine() {
    this.referenceLine = null;
  }
}
