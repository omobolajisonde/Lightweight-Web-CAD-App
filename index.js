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
setInterval(updateAreaDisplay, 150);
