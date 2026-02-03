/**
 * Entry point: mounts the CAD engine and wires the StackBlitz-style toolbar.
 * Integrates: tools (Select, Line, Polyline, Circle, Arc, Filled Region), View, Line Settings,
 * toggles (Lineweights, 1m Grid, Building Gridlines), Selection (area + fill), Export.
 */

import { createEngine } from './core/engine.js';

const canvas = document.getElementById('canvas');
const btnSelect = document.getElementById('btn-select');
const btnLine = document.getElementById('btn-line');
const btnPolyline = document.getElementById('btn-polyline');
const btnCircle = document.getElementById('btn-circle');
const btnArc = document.getElementById('btn-arc');
const btnFilledRegion = document.getElementById('btn-filled-region');
const gridToggle = document.getElementById('grid-toggle');
const viewToggle = document.getElementById('view-toggle');
const keyrefToggle = document.getElementById('keyref-toggle');
const btnExport = document.getElementById('btn-export');
const btnRotateView = document.getElementById('btn-rotate-view');
const btnFitSheets = document.getElementById('btn-fit-sheets');
const activeViewReadout = document.getElementById('active-view-readout');
const areaDisplay = document.getElementById('area-display');
const fillControls = document.getElementById('fill-controls');
const hatchPatternSelect = document.getElementById('hatch-pattern');
const fillColorPicker = document.getElementById('fill-color-picker');
const btnFillApply = document.getElementById('btn-fill-apply');
const btnFillClear = document.getElementById('btn-fill-clear');
const lineTypeSelector = document.getElementById('line-type-selector');
const styleDash = document.getElementById('style-dash');
const angleSnapMode = document.getElementById('angle-snap-mode');
const scaleSelector = document.getElementById('scale-selector');

let lastFillUiKey = null;

const engine = createEngine(canvas, {
  initialScale: 1 / 100,
  initialOffset: { x: 50, y: 50 },
  onToolChange(id) {
    btnSelect.classList.toggle('active', id === 'select');
    btnLine.classList.toggle('active', id === 'line');
    btnPolyline.classList.toggle('active', id === 'line');
    btnCircle.classList.toggle('active', id === 'circle');
    btnArc.classList.toggle('active', id === 'arc');
    btnFilledRegion.classList.toggle('active', id === 'filledRegion');
  },
  onActiveViewChange(viewId) {
    if (activeViewReadout) {
      const label = viewId ? String(viewId).charAt(0).toUpperCase() + String(viewId).slice(1) : 'Plan';
      activeViewReadout.innerHTML = `Active view is ${label}<br />Tip: click a paper sheet to activate it`;
    }
  },
});

// Initialise engine angle snap mode from UI (default: "always")
if (angleSnapMode) {
  engine.setAngleSnapMode(angleSnapMode.value || 'always');
}

// Tool buttons: Line and Polyline both use 'line' tool
btnSelect.addEventListener('click', () => engine.setTool('select'));
btnLine.addEventListener('click', () => engine.setTool('line'));
btnPolyline.addEventListener('click', () => engine.setTool('line'));
btnCircle.addEventListener('click', () => engine.setTool('circle'));
btnArc.addEventListener('click', () => engine.setTool('arc'));
btnFilledRegion.addEventListener('click', () => engine.setTool('filledRegion'));

gridToggle.addEventListener('change', () => {
  engine.setGridEnabled(gridToggle.checked);
});

keyrefToggle.addEventListener('change', () => {
  engine.setBuildingGridlinesEnabled(keyrefToggle.checked);
});

angleSnapMode.addEventListener('change', () => {
  engine.setAngleSnapMode(angleSnapMode.value);
});

scaleSelector.addEventListener('change', () => {
  engine.setScaleFromDenom(Number(scaleSelector.value) || 100);
});

btnRotateView.addEventListener('click', () => {
  engine.rotateView(-90); // clockwise
});

btnFitSheets.addEventListener('click', () => {
  engine.fitToSheets(40);
});

btnExport.addEventListener('click', () => {
  const json = engine.exportDrawing();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'drawing.json';
  a.click();
  URL.revokeObjectURL(url);
});

function updateAreaDisplay() {
  const info = engine.getSelectionAreaInfo();
  if (info) {
    areaDisplay.textContent = `Area: ${info.area.toFixed(2)} m²`;
    areaDisplay.classList.remove('empty');
  } else {
    areaDisplay.textContent = 'Select a closed shape for area';
    areaDisplay.classList.add('empty');
  }
}

function updateFillControls() {
  const selectedSegments = engine.getSelectedSegments();
  const uniquePolylines = [...new Set(selectedSegments.map((s) => s.polyline))];

  if (uniquePolylines.length === 1) {
    const polyline = uniquePolylines[0];
    const isClosed =
      polyline.length >= 3 &&
      Math.hypot(
        polyline[0].x - polyline[polyline.length - 1].x,
        polyline[0].y - polyline[polyline.length - 1].y
      ) < 1;

    if (isClosed) {
      fillControls.classList.add('visible');

      const hatch = engine.getPolylineHatch(polyline);
      const currentHatchPattern = hatch?.pattern || 'SOLID';
      const currentHatchColor =
        hatch?.color || engine.getPolylineFillColor(polyline) || fillColorPicker.value;

      const polyIndex = engine.getPolylines().indexOf(polyline);
      const key = `${polyIndex}:${currentHatchPattern}:${currentHatchColor}`;

      if (key !== lastFillUiKey) {
        hatchPatternSelect.value = currentHatchPattern;
        fillColorPicker.value = currentHatchColor;
        lastFillUiKey = key;
      }

      return;
    }
  }

  fillControls.classList.remove('visible');
  lastFillUiKey = null;
}

btnFillApply.addEventListener('click', () => {
  const selectedSegments = engine.getSelectedSegments();
  const uniquePolylines = [...new Set(selectedSegments.map((s) => s.polyline))];
  if (uniquePolylines.length === 1) {
    const polyline = uniquePolylines[0];
    const pattern = hatchPatternSelect.value || 'SOLID';
    const color = fillColorPicker.value;
    if (pattern === 'SOLID') {
      engine.setPolylineFillColor(polyline, color);
      engine.setPolylineHatch(polyline, null, null);
    } else {
      engine.setPolylineFillColor(polyline, null);
      engine.setPolylineHatch(polyline, pattern, color);
    }
  }
});

btnFillClear.addEventListener('click', () => {
  const selectedSegments = engine.getSelectedSegments();
  const uniquePolylines = [...new Set(selectedSegments.map((s) => s.polyline))];
  if (uniquePolylines.length === 1) {
    const polyline = uniquePolylines[0];
    engine.setPolylineFillColor(polyline, null);
    engine.setPolylineHatch(polyline, null, null);
  }
});

// Line type / dash: optional future use (engine could use for stroke style)
lineTypeSelector.addEventListener('change', () => {});
styleDash.addEventListener('change', () => {});

// Lineweights toggle: optional visual (e.g. thicker strokes when on)
viewToggle.addEventListener('change', () => {});

if (activeViewReadout) {
  const viewId = engine.getActiveViewId();
  const label = viewId ? String(viewId).charAt(0).toUpperCase() + String(viewId).slice(1) : 'Plan';
  activeViewReadout.innerHTML = `Active view is ${label}<br />Tip: click a paper sheet to activate it`;
}
const canvasWrapper = document.getElementById('canvas-wrapper');
if (canvasWrapper && canvas) {
  const resize = () => {
    const w = canvasWrapper.clientWidth || 800;
    const h = canvasWrapper.clientHeight || 600;
    canvas.width = w;
    canvas.height = h;
  };
  resize();
  window.addEventListener('resize', resize);
}
engine.fitToSheets(40);

setInterval(() => {
  updateAreaDisplay();
  updateFillControls();
}, 150);
