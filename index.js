/**
 * Entry point: mounts the CAD engine and wires the toolbar.
 * Phase 1: Export JSON. Phase 2: Grid snap, rooms/area.
 */

import { createEngine } from './core/engine.js';

const canvas = document.getElementById('canvas');
const lineBtn = document.getElementById('tool-line');
const selectBtn = document.getElementById('tool-select');
const gridToggle = document.getElementById('grid-toggle');
const btnExport = document.getElementById('btn-export');
const areaDisplay = document.getElementById('area-display');
const fillControls = document.getElementById('fill-controls');
const hatchPatternSelect = document.getElementById('hatch-pattern');
const fillColorPicker = document.getElementById('fill-color-picker');
const btnFillApply = document.getElementById('btn-fill-apply');
const btnFillClear = document.getElementById('btn-fill-clear');

// Track last UI state so we don't keep overwriting user selection every 150ms
let lastFillUiKey = null;

const engine = createEngine(canvas, {
  initialScale: 1 / 100,
  initialOffset: { x: 50, y: 50 },
  onToolChange(id) {
    lineBtn.classList.toggle('active', id === 'line');
    selectBtn.classList.toggle('active', id === 'select');
  },
});

lineBtn.addEventListener('click', () => engine.setTool('line'));
selectBtn.addEventListener('click', () => engine.setTool('select'));

gridToggle.addEventListener('change', () => {
  engine.setGridEnabled(gridToggle.checked);
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
  
  // Show fill controls if exactly one closed polyline is selected
  if (uniquePolylines.length === 1) {
    const polyline = uniquePolylines[0];
    const isClosed = polyline.length >= 3 && 
      Math.hypot(
        polyline[0].x - polyline[polyline.length - 1].x,
        polyline[0].y - polyline[polyline.length - 1].y
      ) < 1; // Closed tolerance
    
    if (isClosed) {
      fillControls.style.display = 'flex';

      const hatch = engine.getPolylineHatch(polyline);
      const currentHatchPattern = hatch?.pattern || 'SOLID';
      const currentHatchColor =
        hatch?.color || engine.getPolylineFillColor(polyline) || fillColorPicker.value;

      // Use polyline index as a simple stable id for the session
      const polyIndex = engine.getPolylines().indexOf(polyline);
      const key = `${polyIndex}:${currentHatchPattern}:${currentHatchColor}`;

      // Only update the controls when underlying state changed
      if (key !== lastFillUiKey) {
        hatchPatternSelect.value = currentHatchPattern;
        fillColorPicker.value = currentHatchColor;
        lastFillUiKey = key;
      }

      return;
    }
  }
  
  fillControls.style.display = 'none';
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

setInterval(() => {
  updateAreaDisplay();
  updateFillControls();
}, 150);
