// planTabs.js
// Phase 4: Plan Level Tabs UI (screen-space HTML anchored to Plan sheet)
// - Two rows: Overlay + Level switcher
// - Always below the plan (outside the sheet)
// - Width equals the visual bottom edge length of the plan (so it stays correct on rotation/landscape)
// - Does not rotate or scale with zoom (HTML overlay)
// - Hides during rotate animation and re-anchors after

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function getFabric() {
  // Safe access (prevents import-time crashes if fabric isn't ready yet)
  return globalThis.fabric || null;
}

function worldToScreen(canvas, pt) {
  const fabric = getFabric();
  if (!fabric) return { x: 0, y: 0 };

  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const p = fabric.util.transformPoint(new fabric.Point(pt.x, pt.y), vpt);
  return { x: p.x, y: p.y };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Uses your editor's plan sheet description (world-space axis-aligned rect).
function getPlanPaperWorldRect(editor) {
  const sheet = editor?.sheets?.plan;
  if (!sheet) return null;

  const pad = Number(editor.paperEdgePad || 0);
  const w = Number(sheet.wPx || 0) + pad * 2;
  const h = Number(sheet.hPx || 0) + pad * 2;
  const cx = sheet.centre?.x ?? 0;
  const cy = sheet.centre?.y ?? 0;

  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null;
  return { cx, cy, w, h };
}

// Find the visually-lowest edge after viewport transform (this is the "bottom" on screen).
function getBottomEdgeScreen(editor) {
  const canvas = editor?.canvas;
  const r = getPlanPaperWorldRect(editor);
  if (!canvas || !r) return null;

  const hw = r.w / 2;
  const hh = r.h / 2;

  const cornersWorld = [
    { x: r.cx - hw, y: r.cy - hh }, // TL
    { x: r.cx + hw, y: r.cy - hh }, // TR
    { x: r.cx + hw, y: r.cy + hh }, // BR
    { x: r.cx - hw, y: r.cy + hh }  // BL
  ];

  const cornersScreen = cornersWorld.map((p) => worldToScreen(canvas, p));

  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0]
  ];

  let best = null;
  for (const [a, b] of edges) {
    const p0 = cornersScreen[a];
    const p1 = cornersScreen[b];
    const avgY = (p0.y + p1.y) / 2;
    if (!best || avgY > best.avgY) best = { p0, p1, avgY };
  }

  if (!best) return null;

  const minX = Math.min(best.p0.x, best.p1.x);
  const maxX = Math.max(best.p0.x, best.p1.x);
  const maxY = Math.max(best.p0.y, best.p1.y);
  const edgeLen = dist(best.p0, best.p1);

  return { minX, maxX, maxY, edgeLen };
}

function ensureLevels(pl) {
  // Guarantee 5 tabs to match your reference strip.
  let levels = Array.isArray(pl?.levels) ? pl.levels.map(String) : ["L0", "L1", "L2", "L3", "L4"];
  if (levels.length < 5) {
    const base = levels.length ? levels[levels.length - 1] : "L0";
    for (let i = levels.length; i < 5; i++) levels.push(`L${i}`);
  }
  if (levels.length > 5) levels = levels.slice(0, 5);
  return levels;
}

function tabColorClass(i) {
  // 5 segment colors (you can swap these in CSS)
  return `plan-tab--c${i}`;
}

function buildButton(text, role, levelId, colorIndex) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `plan-tab ${tabColorClass(colorIndex)}`;
  b.textContent = text;
  b.dataset.role = role;
  b.dataset.levelId = levelId;
  return b;
}

export class PlanTabs {
  constructor(editor, rootEl) {
    this.editor = editor;
    this.rootEl = rootEl;

    this._raf = 0;
    this._lastKey = "";
    this._mounted = false;

    this._onPrimaryClick = this._onPrimaryClick.bind(this);
    this._onOverlayClick = this._onOverlayClick.bind(this);

    this._mount();
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.rootEl.innerHTML = "";
    this._mounted = false;
  }

  _mount() {
    if (this._mounted) return;

    this.rootEl.classList.add("plan-tabs-root");
    this.rootEl.innerHTML = "";

    // Row 1: Overlay
    const overlayRow = document.createElement("div");
    overlayRow.className = "plan-tabs-row plan-tabs-row--overlay";

    const overlayLabel = document.createElement("div");
    overlayLabel.className = "plan-tabs-rowlabel";
    overlayLabel.textContent = "Overlay";

    const overlayTabs = document.createElement("div");
    overlayTabs.className = "plan-tabs";

    overlayRow.appendChild(overlayLabel);
    overlayRow.appendChild(overlayTabs);

    // Row 2: Plan Levels
    const primaryRow = document.createElement("div");
    primaryRow.className = "plan-tabs-row plan-tabs-row--primary";

    const primaryLabel = document.createElement("div");
    primaryLabel.className = "plan-tabs-rowlabel";
    primaryLabel.textContent = "Plan";

    const primaryTabs = document.createElement("div");
    primaryTabs.className = "plan-tabs";

    primaryRow.appendChild(primaryLabel);
    primaryRow.appendChild(primaryTabs);

    this.rootEl.appendChild(overlayRow);
    this.rootEl.appendChild(primaryRow);

    this._overlayTabsEl = overlayTabs;
    this._primaryTabsEl = primaryTabs;

    this._mounted = true;
    this._raf = requestAnimationFrame(() => this._tick());
  }

  _tick() {
    this._raf = requestAnimationFrame(() => this._tick());
    try {
      this._renderIfNeeded();
      this._updatePositionAndVisibility();
    } catch (err) {
      // Never let UI crash the canvas
      console.error("PlanTabs error:", err);
      this.rootEl.style.display = "none";
    }
  }

  _getPlanLevelsState() {
    if (typeof this.editor.getPlanLevelsState === "function") return this.editor.getPlanLevelsState();
    return this.editor.planLevels || { primary: "L0", overlay: null, levels: ["L0", "L1", "L2", "L3", "L4"] };
  }

  _renderIfNeeded() {
    const pl = this._getPlanLevelsState();
    const levels = ensureLevels(pl);

    const key = JSON.stringify({
      view: this.editor.activeViewId,
      primary: pl.primary,
      overlay: pl.overlay,
      levels
    });

    if (key === this._lastKey) return;
    this._lastKey = key;

    this._primaryTabsEl.innerHTML = "";
    this._overlayTabsEl.innerHTML = "";

    // Overlay row: exactly 5 tabs too (no "None" button — matches your reference strip)
    levels.forEach((id, i) => {
      const b = buildButton(id, "overlay", id, i);
      b.classList.add("plan-tab--overlay");
      b.addEventListener("click", this._onOverlayClick);
      this._overlayTabsEl.appendChild(b);
    });

    // Primary row: exactly 5 tabs
    levels.forEach((id, i) => {
      const b = buildButton(id, "primary", id, i);
      b.addEventListener("click", this._onPrimaryClick);
      this._primaryTabsEl.appendChild(b);
    });

    this._syncActiveClasses();
  }

  _syncActiveClasses() {
    const pl = this._getPlanLevelsState();
    const primaryId = pl.primary ? String(pl.primary) : "L0";
    const overlayId = pl.overlay != null ? String(pl.overlay) : null;

    for (const btn of this._primaryTabsEl.querySelectorAll("button.plan-tab")) {
      btn.classList.toggle("is-active", btn.dataset.levelId === primaryId);
    }

    for (const btn of this._overlayTabsEl.querySelectorAll("button.plan-tab")) {
      btn.classList.toggle("is-active", overlayId != null && btn.dataset.levelId === overlayId);
    }
  }

  _onPrimaryClick(e) {
    const id = e?.currentTarget?.dataset?.levelId;
    if (!id) return;

    if (typeof this.editor.setPrimaryPlanLevel === "function") {
      this.editor.setPrimaryPlanLevel(id);
    } else {
      // fallback
      this.editor.planLevels = this.editor.planLevels || {};
      this.editor.planLevels.primary = id;
    }
    this._syncActiveClasses();
  }

  _onOverlayClick(e) {
    const id = e?.currentTarget?.dataset?.levelId;
    if (!id) return;

    const pl = this._getPlanLevelsState();
    const current = pl.overlay != null ? String(pl.overlay) : null;
    const next = id === current ? null : id;

    if (typeof this.editor.setOverlayPlanLevel === "function") {
      this.editor.setOverlayPlanLevel(next);
    } else {
      // fallback
      this.editor.planLevels = this.editor.planLevels || {};
      this.editor.planLevels.overlay = next;
    }
    this._syncActiveClasses();
  }

  _updatePositionAndVisibility() {
    const wrapper = document.getElementById("canvas-wrapper");
    if (!wrapper) return;

    // Only show in Plan view
    if (this.editor.activeViewId !== "plan") {
      this.rootEl.style.display = "none";
      return;
    }

    // Hide during rotation anim (your rotation.js uses editor.__rotAnimRaf)
    if (this.editor.__rotAnimRaf) {
      this.rootEl.style.display = "none";
      return;
    }

    const canvas = this.editor.canvas;
    if (!canvas) {
      this.rootEl.style.display = "none";
      return;
    }

    const edge = getBottomEdgeScreen(this.editor);
    if (!edge || !isFinite(edge.edgeLen) || edge.edgeLen < 10) {
      this.rootEl.style.display = "none";
      return;
    }

    // Place BELOW the plan (outside), not inside.
    const gap = 8; // px below the plan
    const tabBlockHeight = this.rootEl.offsetHeight || 80;

    let left = edge.minX;
    let top = edge.maxY + gap;
    let width = edge.edgeLen;

    // Clamp into wrapper viewport
    const wrapW = wrapper.clientWidth || window.innerWidth;
    const wrapH = wrapper.clientHeight || window.innerHeight;

    // Keep within visible bounds
    width = clamp(width, 120, wrapW - 16);
    left = clamp(left, 8, wrapW - width - 8);
    top = clamp(top, 8, wrapH - tabBlockHeight - 8);

    this.rootEl.style.display = "block";
    this.rootEl.style.width = `${Math.round(width)}px`;
    this.rootEl.style.left = `${Math.round(left)}px`;
    this.rootEl.style.top = `${Math.round(top)}px`;
  }
}
