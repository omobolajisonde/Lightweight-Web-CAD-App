/**
 * Hatch pattern renderer.
 * IMPORTANT: We do NOT parse or copy official AutoCAD .pat files at runtime.
 * Instead we define our own simple, CAD-style patterns here.
 *
 * All distances are in mm (world units), converted to screen via viewport scale.
 */

const PATTERNS = {
  SOLID: { type: 'solid' },

  // 45° diagonal lines, medium spacing
  ANSI31: {
    type: 'lines',
    lines: [{ angleDeg: 45, spacingMm: 300, dashMm: [Infinity] }],
  },

  // Same orientation, different densities
  ANSI32: {
    type: 'lines',
    lines: [{ angleDeg: 45, spacingMm: 200, dashMm: [Infinity] }],
  },
  ANSI33: {
    type: 'lines',
    lines: [{ angleDeg: 45, spacingMm: 100, dashMm: [Infinity] }],
  },
  ANSI34: {
    type: 'lines',
    lines: [{ angleDeg: 45, spacingMm: 50, dashMm: [Infinity] }],
  },

  // Cross hatch
  ANSI37: {
    type: 'lines',
    lines: [
      { angleDeg: 45, spacingMm: 300, dashMm: [Infinity] },
      { angleDeg: 135, spacingMm: 300, dashMm: [Infinity] },
    ],
  },

  HORIZONTAL: {
    type: 'lines',
    lines: [{ angleDeg: 0, spacingMm: 300, dashMm: [Infinity] }],
  },

  VERTICAL: {
    type: 'lines',
    lines: [{ angleDeg: 90, spacingMm: 300, dashMm: [Infinity] }],
  },

  BRICK: {
    type: 'lines',
    lines: [
      // horizontal courses
      { angleDeg: 0, spacingMm: 300, dashMm: [Infinity] },
      // vertical joints (coarser)
      { angleDeg: 90, spacingMm: 600, dashMm: [Infinity] },
    ],
  },

  CONCRETE: {
    type: 'lines',
    lines: [
      { angleDeg: 45, spacingMm: 500, dashMm: [100, 100, 10, 100] },
      { angleDeg: 135, spacingMm: 500, dashMm: [50, 150] },
    ],
  },

  EARTH: {
    type: 'lines',
    lines: [
      { angleDeg: 0, spacingMm: 400, dashMm: [200, 200] },
      { angleDeg: 0, spacingMm: 150, dashMm: [50, 250] },
    ],
  },

  WOOD: {
    type: 'lines',
    lines: [
      { angleDeg: 0, spacingMm: 400, dashMm: [Infinity] },
      { angleDeg: 0, spacingMm: 80, dashMm: [40, 160] },
    ],
  },

  STEEL: {
    type: 'lines',
    lines: [
      { angleDeg: 45, spacingMm: 200, dashMm: [100, 100] },
      { angleDeg: 135, spacingMm: 200, dashMm: [100, 100] },
    ],
  },

  DOTS: {
    type: 'lines',
    lines: [
      { angleDeg: 0, spacingMm: 200, dashMm: [1, 199] },
      { angleDeg: 90, spacingMm: 200, dashMm: [1, 199] },
    ],
  },
};

function getPattern(name) {
  return PATTERNS[name] || null;
}

/**
 * Render hatch for a closed polygon in world coordinates.
 * @param {CanvasRenderingContext2D} ctx
 * @param {*} viewport - viewport with toScreen() and getScale()
 * @param {{x:number,y:number}[]} polygonWorld
 * @param {string} patternName
 * @param {string} color
 */
export function renderHatch(ctx, viewport, polygonWorld, patternName, color) {
  if (!polygonWorld || polygonWorld.length < 3) return;
  const pattern = getPattern(patternName);
  if (!pattern || pattern.type === 'solid') return;

  const screenPts = polygonWorld.map((p) => viewport.toScreen(p));
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const s of screenPts) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
  const L = diag * 2;

  ctx.save();
  // Clip to polygon
  ctx.beginPath();
  screenPts.forEach((s, i) => {
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const scale = viewport.getScale();

  for (const lineDef of pattern.lines) {
    const angleRad = (lineDef.angleDeg * Math.PI) / 180;
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);
    const nx = -dy;
    const ny = dx;

    const spacingScreen = lineDef.spacingMm * scale;

    // projection bounds along normal
    let minProj = Infinity;
    let maxProj = -Infinity;
    for (const s of screenPts) {
      const proj = s.x * nx + s.y * ny;
      if (proj < minProj) minProj = proj;
      if (proj > maxProj) maxProj = proj;
    }

    const start = Math.floor(minProj / spacingScreen) * spacingScreen;
    const end = Math.ceil(maxProj / spacingScreen) * spacingScreen;

    const centerProj = cx * nx + cy * ny;

    const dash = lineDef.dashMm || [];
    if (dash.length && !dash.includes(Infinity)) {
      ctx.setLineDash(dash.map((mm) => mm * scale));
    } else {
      ctx.setLineDash([]);
    }

    for (let p = start; p <= end; p += spacingScreen) {
      const offset = p - centerProj;
      const px = cx + nx * offset;
      const py = cy + ny * offset;

      const x1 = px + dx * L;
      const y1 = py + dy * L;
      const x2 = px - dx * L;
      const y2 = py - dy * L;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  ctx.restore();
  ctx.setLineDash([]);
}

