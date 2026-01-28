# Lightweight Web CAD

A modular, browser-based CAD-style drawing app with polyline (line) and select tools, snapping, zoom-to-pointer, and selection box / drag / grip handles.

## Project structure

```
├── index.html          # Single page, canvas + toolbar
├── index.js             # Entry: creates engine, wires toolbar
├── core/
│   ├── engine.js     # Document state, tool delegation, snap, render loop
│   └── viewport.js   # Canvas, scale, offset, zoom, world ↔ screen
├── tools/
│   ├── index.js      # Tool registry – add new tools here
│   ├── types.js      # Tool and context JSDoc types
│   ├── line.js       # Polyline tool (click to add points, close on first point)
│   └── select.js     # Select tool (click, box, drag, handles)
└── utils/
    ├── math.js       # distance, pointToSegmentDistance, lineInBox, constants
    └── transform.js  # worldToScreen, screenToWorld
```

## Adding a new tool

1. **Create a new file** in `tools/`, e.g. `tools/rectangle.js`:

```js
/**
 * @param {{ viewport, getState }} engine
 * @returns {import('./types.js').Tool}
 */
export function createRectangleTool(engine) {
  return {
    id: 'rectangle',
    name: 'Rectangle',
    activate() {},
    deactivate() {},
    onMouseDown(ctx) { /* return true if event consumed */ },
    onMouseMove(ctx) {},
    onMouseUp(ctx) {},
    onClick(ctx) {},
    draw(ctx) { /* tool preview/overlay */ },
  };
}
```

2. **Register the tool** in `tools/index.js`:

```js
import { createRectangleTool } from './rectangle.js';

export function createTools(engine) {
  return [
    createLineTool(engine),
    createSelectTool(engine),
    createRectangleTool(engine),  // add here
  ];
}
```

3. **Add a toolbar button** in `index.html` and wire it in `index.js`:

```js
const rectBtn = document.getElementById('tool-rect');
rectBtn.addEventListener('click', () => engine.setTool('rectangle'));
onToolChange(id) {
  // ...
  rectBtn.classList.toggle('active', id === 'rectangle');
}
```

The engine passes a **tool context** (`ctx`) into each handler with `viewport`, `gfx` (canvas 2D context), `mouse`, `worldMouse`, `polylines`, `selectedLines`, `setSelectedLines`, `setHoveredLine`, `getSnap`, `addPolyline`, `removePolylines`. Use `viewport.toWorld()` / `viewport.toScreen()` and `getSnap()` for snapping.

## Run

- `npm install && npm run dev` — development server
- `npm run build` — production build
- `npm run preview` — preview production build
