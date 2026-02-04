// grid.js
const fabric = globalThis.fabric;
import { reorderGuideLayers } from "./sheetLayout.js";

/*
  1 meter grid at 1:100 scale

  Important rules
  - Must appear on top of the white paper sheets
  - Must be fully non interactive
  - Grid should align to each sheet's local axis (paper.angle)
  - Camera rotation still rotates the whole view (viewportTransform)
*/

function clearOldGrid(editor) {
  const canvas = editor.canvas;

  if (editor.sheetGrids && editor.sheetGrids.length) {
    editor.sheetGrids.forEach((o) => {
      try {
        canvas.remove(o);
      } catch (err) {}
    });
    editor.sheetGrids = [];
  }
}

function createGridForPaper(editor, paper) {
  const gridStepPx = editor.mmToPx(10);

  const width = paper.width;
  const height = paper.height;

  const lines = [];

  const startX = -width / 2;
  const endX = width / 2;
  const startY = -height / 2;
  const endY = height / 2;

  for (let x = 0; x <= endX; x += gridStepPx) {
    const line = new fabric.Line([x, startY, x, endY], {
      stroke: "#e0e0e0",
      strokeWidth: 1,
      strokeUniform: true,
      selectable: false,
      evented: false,
      objectCaching: false,
      perPixelTargetFind: false
    });
    line.isPaperGrid = true;
    lines.push(line);
  }
  for (let x = -gridStepPx; x >= startX; x -= gridStepPx) {
    const line = new fabric.Line([x, startY, x, endY], {
      stroke: "#e0e0e0",
      strokeWidth: 1,
      strokeUniform: true,
      selectable: false,
      evented: false,
      objectCaching: false,
      perPixelTargetFind: false
    });
    line.isPaperGrid = true;
    lines.push(line);
  }

  for (let y = 0; y <= endY; y += gridStepPx) {
    const line = new fabric.Line([startX, y, endX, y], {
      stroke: "#e0e0e0",
      strokeWidth: 1,
      strokeUniform: true,
      selectable: false,
      evented: false,
      objectCaching: false,
      perPixelTargetFind: false
    });
    line.isPaperGrid = true;
    lines.push(line);
  }
  for (let y = -gridStepPx; y >= startY; y -= gridStepPx) {
    const line = new fabric.Line([startX, y, endX, y], {
      stroke: "#e0e0e0",
      strokeWidth: 1,
      strokeUniform: true,
      selectable: false,
      evented: false,
      objectCaching: false,
      perPixelTargetFind: false
    });
    line.isPaperGrid = true;
    lines.push(line);
  }

  // ✅ Grid group sits at paper center and rotates with the paper (local sheet axis).
  const gridGroup = new fabric.Group(lines, {
    left: paper.left,
    top: paper.top,
    originX: "center",
    originY: "center",
    angle: typeof paper.angle === "number" ? paper.angle : 0,
    selectable: false,
    evented: false,
    objectCaching: false,
    noScaleCache: true,
    hasControls: false,
    hasBorders: false,
    lockMovementX: true,
    lockMovementY: true,
    lockRotation: true,
    lockScalingX: true,
    lockScalingY: true,
    hoverCursor: "default",
    perPixelTargetFind: false
  });

  gridGroup.isPaperGrid = true;

  return gridGroup;
}

export function drawGrid(editor) {
  if (!editor || !editor.canvas) return;

  if (!editor.sheetGrids) {
    editor.sheetGrids = [];
  }

  clearOldGrid(editor);

  if (!editor.showGrid) {
    reorderGuideLayers(editor);
    editor.canvas.requestRenderAll();
    return;
  }

  const canvas = editor.canvas;

  const papers = editor.sheetGuides
    ? editor.sheetGuides.filter((o) => o && o.isPaper === true)
    : [];

  const gridGroups = [];

  papers.forEach((paper) => {
    const gridGroup = createGridForPaper(editor, paper);
    canvas.add(gridGroup);
    gridGroups.push(gridGroup);
  });

  editor.sheetGrids = gridGroups;

  reorderGuideLayers(editor);

  canvas.requestRenderAll();
}
