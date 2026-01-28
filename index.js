/**
 * Entry point: mounts the CAD engine and wires the toolbar.
 */

import { createEngine } from './core/engine.js';

const canvas = document.getElementById('canvas');
const lineBtn = document.getElementById('tool-line');
const selectBtn = document.getElementById('tool-select');

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
