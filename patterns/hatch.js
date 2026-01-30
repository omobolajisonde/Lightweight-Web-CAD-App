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

  // BRICK: horizontal courses + vertical joints (staggered)
  // Reference: acadiso.pat *BRICK - horizontal lines 6.35mm apart, vertical dashed lines 12.7mm apart
  BRICK: {
    type: 'lines',
    lines: [
      { angleDeg: 0, spacingMm: 6.35, dashMm: [Infinity] }, // horizontal courses
      { angleDeg: 90, spacingMm: 12.7, dashMm: [6.35, 6.35], offsetX: 0 }, // vertical joints
      { angleDeg: 90, spacingMm: 12.7, dashMm: [6.35, 6.35], offsetX: 6.35 }, // offset vertical joints
    ],
  },

  // CONCRETE: random dot pattern (simplified approximation)
  CONCRETE: {
    type: 'lines',
    lines: [
      { angleDeg: 45, spacingMm: 500, dashMm: [100, 100, 10, 100] },
      { angleDeg: 135, spacingMm: 500, dashMm: [50, 150] },
    ],
  },

  // EARTH: multiple horizontal dashed lines at different offsets
  // Reference: acadiso.pat *EARTH - horizontal lines with dashes, multiple offsets
  EARTH: {
    type: 'lines',
    lines: [
      { angleDeg: 0, spacingMm: 6.35, dashMm: [6.35, 6.35], offsetY: 0 },
      { angleDeg: 0, spacingMm: 6.35, dashMm: [6.35, 6.35], offsetY: 2.38125 },
      { angleDeg: 0, spacingMm: 6.35, dashMm: [6.35, 6.35], offsetY: 4.7625 },
      { angleDeg: 90, spacingMm: 6.35, dashMm: [6.35, 6.35], offsetX: 0.79375, offsetY: 5.55625 },
      { angleDeg: 90, spacingMm: 6.35, dashMm: [6.35, 6.35], offsetX: 3.175, offsetY: 5.55625 },
    ],
  },

  WOOD: {
    type: 'lines',
    lines: [
      { angleDeg: 0, spacingMm: 400, dashMm: [Infinity] },
      { angleDeg: 0, spacingMm: 80, dashMm: [40, 160] },
    ],
  },

  // STEEL: two diagonal lines offset vertically
  // Reference: acadiso.pat *STEEL - 45° lines spaced 3.175mm, second line offset 1.5875mm
  STEEL: {
    type: 'lines',
    lines: [
      { angleDeg: 45, spacingMm: 3.175, dashMm: [Infinity], offsetY: 0 },
      { angleDeg: 45, spacingMm: 3.175, dashMm: [Infinity], offsetY: 1.5875 },
    ],
  },

  // DOTS: grid of dots (not lines!)
  // Reference: acadiso.pat *DOTS - horizontal spacing 0.79375mm, vertical spacing 1.5875mm
  DOTS: {
    type: 'dots',
    spacingX: 0.79375, // horizontal spacing in mm
    spacingY: 1.5875, // vertical spacing in mm
    dotRadius: 0.5, // dot radius in mm
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
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  const scale = viewport.getScale();

  // Minimum spacing in screen pixels to avoid billions of primitives at small scale
  const MIN_SPACING_PX = 4;
  const MAX_DOTS = 8000;
  const MAX_LINES_PER_FAMILY = 800;

  // Special handling for DOTS pattern
  if (pattern.type === 'dots') {
    let spacingXScreen = pattern.spacingX * scale;
    let spacingYScreen = pattern.spacingY * scale;
    if (spacingXScreen < MIN_SPACING_PX) spacingXScreen = MIN_SPACING_PX;
    if (spacingYScreen < MIN_SPACING_PX) spacingYScreen = MIN_SPACING_PX;

    const dotRadiusScreen = Math.max(pattern.dotRadius * scale, 1);

    const startX = Math.floor(minX / spacingXScreen) * spacingXScreen;
    const endX = Math.ceil(maxX / spacingXScreen) * spacingXScreen;
    const startY = Math.floor(minY / spacingYScreen) * spacingYScreen;
    const endY = Math.ceil(maxY / spacingYScreen) * spacingYScreen;

    const countX = Math.round((endX - startX) / spacingXScreen) + 1;
    const countY = Math.round((endY - startY) / spacingYScreen) + 1;
    if (countX * countY > MAX_DOTS) {
      // Skip dots if region too large; avoid freeze
      ctx.restore();
      ctx.setLineDash([]);
      return;
    }

    for (let y = startY; y <= endY; y += spacingYScreen) {
      for (let x = startX; x <= endX; x += spacingXScreen) {
        let inside = false;
        for (let i = 0, j = screenPts.length - 1; i < screenPts.length; j = i++) {
          const xi = screenPts[i].x;
          const yi = screenPts[i].y;
          const xj = screenPts[j].x;
          const yj = screenPts[j].y;
          if (yi === yj) continue;
          const intersect =
            yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
          if (intersect) inside = !inside;
        }

        if (inside) {
          ctx.beginPath();
          ctx.arc(x, y, dotRadiusScreen, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else {
    // Line-based patterns
    for (const lineDef of pattern.lines) {
      const angleRad = (lineDef.angleDeg * Math.PI) / 180;
      const dx = Math.cos(angleRad);
      const dy = Math.sin(angleRad);
      const nx = -dy;
      const ny = dx;

      let spacingScreen = lineDef.spacingMm * scale;
      if (spacingScreen < MIN_SPACING_PX) spacingScreen = MIN_SPACING_PX;

      const offsetX = (lineDef.offsetX || 0) * scale;
      const offsetY = (lineDef.offsetY || 0) * scale;

      let minProj = Infinity;
      let maxProj = -Infinity;
      for (const s of screenPts) {
        const proj = (s.x - offsetX) * nx + (s.y - offsetY) * ny;
        if (proj < minProj) minProj = proj;
        if (proj > maxProj) maxProj = proj;
      }

      const start = Math.floor(minProj / spacingScreen) * spacingScreen;
      const end = Math.ceil(maxProj / spacingScreen) * spacingScreen;
      const lineCount = Math.round((end - start) / spacingScreen) + 1;
      if (lineCount > MAX_LINES_PER_FAMILY) continue; // skip this line family to avoid freeze

      const centerProj = (cx - offsetX) * nx + (cy - offsetY) * ny;

      const dash = lineDef.dashMm || [];
      if (dash.length && !dash.includes(Infinity)) {
        ctx.setLineDash(dash.map((mm) => mm * scale));
      } else {
        ctx.setLineDash([]);
      }

      for (let p = start; p <= end; p += spacingScreen) {
        const offset = p - centerProj;
        const px = cx + nx * offset + offsetX;
        const py = cy + ny * offset + offsetY;

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
  }

  ctx.restore();
  ctx.setLineDash([]);
}

