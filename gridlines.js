// gridlines.js
const fabric = globalThis.fabric;

/*
Property Grids
Four shared datums

Left and Right are vertical in plan, front, back
Front and Back are horizontal in plan, and horizontal in left, right

Rules
Left always stays left of plan centre
Right always stays right of plan centre
Back always stays above plan centre
Front always stays below plan centre

Heads sit at the top of each sheet
Top means the edge facing the plan sheet

Head centre is placed beyond the inner A4 frame

Dashed line behaviour
Dashed line attaches to the real head bubble edge
The opposite end overshoots the A4 reference by the same distance that the real head overshoots on its side
So both sides are symmetric relative to the A4 reference
*/

export class KeyReferenceManager {
  constructor(editor) {
    this.editor = editor;
    this.canvas = editor.canvas;

    this.model = {
      left: { exists: false, offsetX: 0 },
      right: { exists: false, offsetX: 0 },
      front: { exists: false, offsetY: 0 },
      back: { exists: false, offsetY: 0 }
    };

    this.instances = {
      left: {},
      right: {},
      front: {},
      back: {}
    };

    this.handles = {
      left: { primary: null, secondary: null },
      right: { primary: null, secondary: null },
      front: { primary: null, secondary: null },
      back: { primary: null, secondary: null }
    };

    this.referenceDashedLines = {
      left: null,
      right: null,
      front: null,
      back: null
    };

    this.isSyncing = false;

    this.gridLineColour = "#6f6f6f";
    this.dash = [8, 6];

    // Dimensions in mm for consistency
    this.headRadiusMM = 8;
    this.headTextSizePx = 24;
    this.headStrokeWidth = 4;

    // Dotted line overhang beyond the A4 dotted reference box
    // This is ONLY the line, not the head bubble
    this.lineOverhangMM = 3;

    // Gap between dotted line end and the nearest edge of the head bubble
    this.headGapMM = 0;

    this.handleRadiusMM = 9.5;
    this.handleTextSizePx = 26;

    this.handleColours = {
      left: "#0066ff",
      right: "#ff0000",
      front: "#00cc00",
      back: "#ffcc00"
    };

    this.labels = {
      left: "L",
      right: "R",
      front: "F",
      back: "B"
    };

    this.minSeparationMM = 10;
    this.minFromCentreMM = 2;
  }

  // Dynamic getters for pixel values
  get headRadiusPx() {
    return this.editor.mmToPx(this.headRadiusMM);
  }

  get lineOverhangPx() {
    return this.editor.mmToPx(this.lineOverhangMM);
  }

  get headGapPx() {
    return this.editor.mmToPx(this.headGapMM);
  }

  get handleRadiusPx() {
    return this.editor.mmToPx(this.handleRadiusMM);
  }

  // Under camera rotation, world geometry remains unrotated.
  // So we always use the sheet's true innerA4 directly.
  getEffectiveInnerA4(sheet) {
    return sheet?.innerA4 || null;
  }

  setEnabled(enabled) {
    const on = !!enabled;

    if (on) {
      this.addRef("left");
      this.addRef("right");
      this.addRef("front");
      this.addRef("back");
      this.renderAll();
      return;
    }

    this.clearAll();
    this.canvas.requestRenderAll();
  }

  renderAll() {
    this.rebuildEverything();
  }

  addRef(key) {
    if (!this.ensureExists(key)) return;
    this.rebuildEverything();
  }

  clearAll() {
    ["left", "right", "front", "back"].forEach((k) => {
      const instViews = this.instances[k] || {};
      Object.keys(instViews).forEach((viewId) => {
        try {
          this.canvas.remove(instViews[viewId]);
        } catch (err) {}
      });
      this.instances[k] = {};

      if (this.handles[k]) {
        if (this.handles[k].primary) {
          try {
            this.canvas.remove(this.handles[k].primary);
          } catch (err) {}
        }
        if (this.handles[k].secondary) {
          try {
            this.canvas.remove(this.handles[k].secondary);
          } catch (err) {}
        }
        this.handles[k] = { primary: null, secondary: null };
      }

      if (this.referenceDashedLines[k]) {
        try {
          this.canvas.remove(this.referenceDashedLines[k]);
        } catch (err) {}
        this.referenceDashedLines[k] = null;
      }
    });
  }

  rebuildEverything() {
    this.clearAll();

    ["left", "right", "front", "back"].forEach((key) => {
      if (!this.model[key].exists) return;
      this.buildKeyIfMissing(key);
      this.updateKeyPositions(key);
    });

    this.reorderLayers();
    this.canvas.requestRenderAll();
  }

  ensureExists(key) {
    if (!this.model[key]) return false;
    if (this.model[key].exists) return true;

    const plan = this.editor.sheets?.plan;
    if (!plan || !plan.centre || !plan.innerA4) return false;

    const inner = this.getEffectiveInnerA4(plan);

    if (key === "left") this.model.left.offsetX = (inner.left - plan.centre.x) * 0.65;
    if (key === "right") this.model.right.offsetX = (inner.right - plan.centre.x) * 0.65;
    if (key === "back") this.model.back.offsetY = (inner.top - plan.centre.y) * 0.65;
    if (key === "front") this.model.front.offsetY = (inner.bottom - plan.centre.y) * 0.65;

    this.model[key].exists = true;

    this.enforceIdentityAndOrdering();
    return true;
  }

  getViewsForKey(key) {
    if (key === "left" || key === "right") return ["plan", "front", "back"];
    if (key === "front" || key === "back") return ["plan", "left", "right"];
    return ["plan"];
  }

  buildKeyIfMissing(key) {
    const views = this.getViewsForKey(key);

    views.forEach((viewId) => {
      if (this.instances[key]?.[viewId]) return;

      const inst = this.createInstance(key, viewId);
      if (!inst) return;

      this.instances[key][viewId] = inst;
      this.canvas.add(inst);
    });

    if (!this.handles[key] || !this.handles[key].primary) {
      const primary = this.createHandle(key, false);
      const secondary = this.createHandle(key, true);
      if (primary && secondary) {
        this.handles[key] = { primary, secondary };
        this.canvas.add(primary);
        this.canvas.add(secondary);
      }
    }

    if (!this.referenceDashedLines[key]) {
      const dashedLine = this.createReferenceDashedLine(key);
      if (dashedLine) {
        this.referenceDashedLines[key] = dashedLine;
        this.canvas.add(dashedLine);
      }
    }
  }

  createInstance(key, viewId) {
    const sheets = this.editor.sheets || {};
    const sheet = sheets[viewId];
    const plan = sheets.plan;

    if (!sheet || !sheet.centre || !sheet.innerA4) return null;
    if (!plan || !plan.centre || !plan.innerA4) return null;

    const label = this.labels[key] || "?";

    if (viewId === "plan") {
      if (key === "left" || key === "right") return this.makeVerticalGridGroup(key, viewId, sheet, label);
      return this.makeHorizontalGridGroup(key, viewId, sheet, label);
    }

    if (viewId === "front" || viewId === "back") {
      if (key !== "left" && key !== "right") return null;
      return this.makeVerticalGridGroup(key, viewId, sheet, label);
    }

    if (viewId === "left" || viewId === "right") {
      if (key !== "front" && key !== "back") return null;
      return this.makeHorizontalGridGroup(key, viewId, sheet, label);
    }

    return null;
  }

  makeVerticalGridGroup(key, viewId, sheet, label) {
    const inner = this.getEffectiveInnerA4(sheet);

    const x = 0;

    const yTopA4 = inner.top - sheet.centre.y;
    const yBotA4 = inner.bottom - sheet.centre.y;

    const head = this.getHeadPlacement(viewId, sheet, "vertical");
    const r = this.headRadiusPx;

    let y1;
    let y2;

    // Head above A4 box
    if (head.y < yTopA4) {
      const yHeadTouch = head.y + r;
      const overhang = yTopA4 - yHeadTouch;
      y1 = yHeadTouch;
      y2 = yBotA4 + overhang;
    }
    // Head below A4 box
    else if (head.y > yBotA4) {
      const yHeadTouch = head.y - r;
      const overhang = yHeadTouch - yBotA4;
      y1 = yTopA4 - overhang;
      y2 = yHeadTouch;
    }
    // Fallback
    else {
      y1 = yTopA4;
      y2 = yBotA4;
    }

    if (y2 < y1) {
      const mid = (y1 + y2) / 2;
      y1 = mid - 1;
      y2 = mid + 1;
    }

    const main = new fabric.Line([x, y1, x, y2], {
      stroke: this.gridLineColour,
      strokeWidth: 1,
      strokeDashArray: this.dash,
      selectable: false,
      evented: false,
      objectCaching: false,
      perPixelTargetFind: false
    });

    const bubble = new fabric.Circle({
      left: head.x,
      top: head.y,
      originX: "center",
      originY: "center",
      radius: r,
      fill: "#ffffff",
      stroke: this.gridLineColour,
      strokeWidth: this.headStrokeWidth,
      selectable: false,
      evented: false,
      objectCaching: false,
      perPixelTargetFind: false
    });

    const txt = new fabric.Text(label, {
      left: head.x,
      top: head.y,
      originX: "center",
      originY: "center",
      fontSize: this.headTextSizePx,
      fontFamily: "Segoe UI, sans-serif",
      fontWeight: "700",
      fill: this.gridLineColour,
      angle: this.getHeadTextRotation(viewId),
      selectable: false,
      evented: false,
      objectCaching: false,
      perPixelTargetFind: false
    });

    const g = new fabric.Group([main, bubble, txt], {
      left: sheet.centre.x,
      top: sheet.centre.y,
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
      objectCaching: false,
      hasControls: false,
      hasBorders: false,
      perPixelTargetFind: false,
      hoverCursor: "default",
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true
    });

    g.isKeyReference = true;
    g.keyRef = key;
    g.keyRefView = viewId;
    g.keyRefOrientation = "vertical";

    return g;
  }

  makeHorizontalGridGroup(key, viewId, sheet, label) {
    const inner = this.getEffectiveInnerA4(sheet);

    const y = 0;

    const xLeftA4 = inner.left - sheet.centre.x;
    const xRightA4 = inner.right - sheet.centre.x;

    const head = this.getHeadPlacement(viewId, sheet, "horizontal");
    const r = this.headRadiusPx;

    let x1;
    let x2;

    // Head left of A4 box
    if (head.x < xLeftA4) {
      const xHeadTouch = head.x + r;
      const overhang = xLeftA4 - xHeadTouch;
      x1 = xHeadTouch;
      x2 = xRightA4 + overhang;
    }
    // Head right of A4 box
    else if (head.x > xRightA4) {
      const xHeadTouch = head.x - r;
      const overhang = xHeadTouch - xRightA4;
      x1 = xLeftA4 - overhang;
      x2 = xHeadTouch;
    }
    // Fallback
    else {
      x1 = xLeftA4;
      x2 = xRightA4;
    }

    if (x2 < x1) {
      const mid = (x1 + x2) / 2;
      x1 = mid - 1;
      x2 = mid + 1;
    }

    const main = new fabric.Line([x1, y, x2, y], {
      stroke: this.gridLineColour,
      strokeWidth: 1,
      strokeDashArray: this.dash,
      selectable: false,
      evented: false,
      objectCaching: false,
      perPixelTargetFind: false
    });

    const bubble = new fabric.Circle({
      left: head.x,
      top: head.y,
      originX: "center",
      originY: "center",
      radius: r,
      fill: "#ffffff",
      stroke: this.gridLineColour,
      strokeWidth: this.headStrokeWidth,
      selectable: false,
      evented: false,
      objectCaching: false,
      perPixelTargetFind: false
    });

    const txt = new fabric.Text(label, {
      left: head.x,
      top: head.y,
      originX: "center",
      originY: "center",
      fontSize: this.headTextSizePx,
      fontFamily: "Segoe UI, sans-serif",
      fontWeight: "700",
      fill: this.gridLineColour,
      angle: this.getHeadTextRotation(viewId),
      selectable: false,
      evented: false,
      objectCaching: false,
      perPixelTargetFind: false
    });

    const g = new fabric.Group([main, bubble, txt], {
      left: sheet.centre.x,
      top: sheet.centre.y,
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
      objectCaching: false,
      hasControls: false,
      hasBorders: false,
      perPixelTargetFind: false,
      hoverCursor: "default",
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true
    });

    g.isKeyReference = true;
    g.keyRef = key;
    g.keyRefView = viewId;
    g.keyRefOrientation = "horizontal";

    return g;
  }

  getHeadTextRotation(viewId) {
    if (viewId === "front") return 180;
    if (viewId === "back") return 0;
    if (viewId === "left") return 90;
    if (viewId === "right") return -90;
    return 0;
  }

  getHeadPlacement(viewId, sheet, orientation) {
    const inner = this.getEffectiveInnerA4(sheet);

    const extraPush = 3 * this.headRadiusPx; // 2/3 of diameter
    const pushFromA4 = this.lineOverhangPx + this.headGapPx + this.headRadiusPx + extraPush;

    const innerLeft = inner.left - sheet.centre.x;
    const innerRight = inner.right - sheet.centre.x;
    const innerTop = inner.top - sheet.centre.y;
    const innerBottom = inner.bottom - sheet.centre.y;

    if (viewId === "plan") {
      if (orientation === "vertical") return { x: 0, y: innerTop - pushFromA4 };
      return { x: innerLeft - pushFromA4, y: 0 };
    }

    if (viewId === "front") {
      if (orientation === "vertical") return { x: 0, y: innerBottom + pushFromA4 };
      return { x: innerLeft - pushFromA4, y: 0 };
    }

    if (viewId === "back") {
      if (orientation === "vertical") return { x: 0, y: innerTop - pushFromA4 };
      return { x: innerLeft - pushFromA4, y: 0 };
    }

    if (viewId === "left") {
      if (orientation === "horizontal") return { x: innerRight + pushFromA4, y: 0 };
      return { x: 0, y: innerTop - pushFromA4 };
    }

    if (viewId === "right") {
      if (orientation === "horizontal") return { x: innerLeft - pushFromA4, y: 0 };
      return { x: 0, y: innerTop - pushFromA4 };
    }

    if (orientation === "vertical") return { x: 0, y: innerTop - pushFromA4 };
    return { x: innerLeft - pushFromA4, y: 0 };
  }

  createHandle(key, isSecondary = false) {
    const plan = this.editor.sheets?.plan;
    if (!plan || !plan.centre) return null;

    const label = this.labels[key] || "?";
    const colour = this.handleColours[key] || "#ff0000";

    const hit = new fabric.Circle({
      left: 0,
      top: 0,
      originX: "center",
      originY: "center",
      radius: this.handleRadiusPx * 1.6,
      fill: "rgba(0,0,0,0)",
      strokeWidth: 0,
      selectable: false,
      evented: false,
      objectCaching: false
    });

    const bubble = new fabric.Circle({
      left: 0,
      top: 0,
      originX: "center",
      originY: "center",
      radius: this.handleRadiusPx,
      fill: colour,
      stroke: "#ffffff",
      strokeWidth: 4,
      selectable: false,
      evented: false,
      objectCaching: false
    });

    const txt = new fabric.Text(label, {
      left: 0,
      top: 0,
      originX: "center",
      originY: "center",
      fontSize: this.handleTextSizePx,
      fontFamily: "Segoe UI, sans-serif",
      fontWeight: "800",
      fill: "#ffffff",
      selectable: false,
      evented: false,
      objectCaching: false
    });

    const g = new fabric.Group([hit, bubble, txt], {
      left: plan.centre.x,
      top: plan.centre.y,
      originX: "center",
      originY: "center",

      selectable: true,
      evented: true,
      objectCaching: false,

      hasControls: false,
      hasBorders: false,
      perPixelTargetFind: true,
      hoverCursor: "move",

      // IMPORTANT:
      // Do NOT use lockMovementX/Y here.
      // Those lock to screen axes, which becomes wrong under camera rotation.
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true
    });

    g.isKeyReferenceHandle = true;
    g.keyRef = key;
    g.isSecondary = isSecondary;

    return g;
  }

  createReferenceDashedLine(key) {
    const plan = this.editor.sheets?.plan;
    if (!plan || !plan.centre) return null;

    const line = new fabric.Line([-1, 0, 1, 0], {
      left: plan.centre.x,
      top: plan.centre.y,
      originX: "center",
      originY: "center",

      stroke: "#ffffff",
      strokeWidth: 2,
      strokeDashArray: [8, 8],
      selectable: false,
      evented: false,
      objectCaching: false,
      strokeUniform: true,
      perPixelTargetFind: false
    });

    line.isReferenceDashedLine = true;
    line.keyRef = key;
    return line;
  }

  // ✅ Camera-rotation-safe movement constraint (world axes)
  onObjectMoving(target) {
    if (!target) return;
    if (this.isSyncing) return;

    const isHandle = target.isKeyReferenceHandle === true;
    const isInstance = target.isKeyReference === true;
    if (!isHandle && !isInstance) return;

    const key = target.keyRef;
    if (!key || !this.model[key] || !this.model[key].exists) return;

    // Enforce world-axis constraint for handles.
    // Left/Right: move only in X, keep Y pinned to plan centre.
    // Front/Back: move only in Y, keep X pinned to plan centre.
    if (isHandle) {
      const plan = this.editor.sheets?.plan;
      if (plan && plan.centre) {
        if (key === "left" || key === "right") {
          target.set({ top: plan.centre.y });
        } else if (key === "front" || key === "back") {
          target.set({ left: plan.centre.x });
        }
        try {
          target.setCoords();
        } catch (err) {}
      }
    }

    this.isSyncing = true;

    try {
      if (isHandle) this.applyHandleMoveToModel(target, key);
      else this.applyInstanceMoveToModel(target, key);

      this.enforceIdentityAndOrdering();

      ["left", "right", "front", "back"].forEach((k) => {
        if (this.model[k].exists) this.updateKeyPositions(k);
      });

      this.canvas.requestRenderAll();
    } finally {
      this.isSyncing = false;
    }
  }

  applyHandleMoveToModel(handleGroup, key) {
    const plan = this.editor.sheets?.plan;
    if (!plan || !plan.centre) return;

    const c = handleGroup.getCenterPoint
      ? handleGroup.getCenterPoint()
      : { x: handleGroup.left, y: handleGroup.top };

    // Under camera rotation, this is already world space.
    if (key === "left" || key === "right") {
      this.model[key].offsetX = c.x - plan.centre.x;
      return;
    }

    if (key === "front" || key === "back") {
      this.model[key].offsetY = c.y - plan.centre.y;
    }
  }

  applyInstanceMoveToModel(instanceGroup, key) {
    const viewId = instanceGroup.keyRefView;
    const sheets = this.editor.sheets || {};
    const plan = sheets.plan;
    const sheet = sheets[viewId];

    if (!plan || !plan.centre || !sheet || !sheet.centre) return;

    const c = instanceGroup.getCenterPoint
      ? instanceGroup.getCenterPoint()
      : { x: instanceGroup.left, y: instanceGroup.top };

    // Under camera rotation, this is already world space.
    if (key === "left" || key === "right") {
      const baseX = viewId === "plan" ? plan.centre.x : sheet.centre.x;
      this.model[key].offsetX = c.x - baseX;
      return;
    }

    if (key === "front" || key === "back") {
      const baseY = viewId === "plan" ? plan.centre.y : sheet.centre.y;
      this.model[key].offsetY = c.y - baseY;
    }
  }

  enforceIdentityAndOrdering() {
    const plan = this.editor.sheets?.plan;
    if (!plan || !plan.centre || !plan.innerA4) return;

    const inner = this.getEffectiveInnerA4(plan);

    const minSepPx = this.editor.mmToPx(this.minSeparationMM);
    const minFromCentrePx = this.editor.mmToPx(this.minFromCentreMM);

    const minX = inner.left - plan.centre.x;
    const maxX = inner.right - plan.centre.x;
    const minY = inner.top - plan.centre.y;
    const maxY = inner.bottom - plan.centre.y;

    if (this.model.left.exists) {
      this.model.left.offsetX = Math.min(this.model.left.offsetX, -minFromCentrePx);
      this.model.left.offsetX = Math.max(this.model.left.offsetX, minX);
    }

    if (this.model.right.exists) {
      this.model.right.offsetX = Math.max(this.model.right.offsetX, minFromCentrePx);
      this.model.right.offsetX = Math.min(this.model.right.offsetX, maxX);
    }

    if (this.model.back.exists) {
      this.model.back.offsetY = Math.min(this.model.back.offsetY, -minFromCentrePx);
      this.model.back.offsetY = Math.max(this.model.back.offsetY, minY);
    }

    if (this.model.front.exists) {
      this.model.front.offsetY = Math.max(this.model.front.offsetY, minFromCentrePx);
      this.model.front.offsetY = Math.min(this.model.front.offsetY, maxY);
    }

    if (this.model.left.exists && this.model.right.exists) {
      if (this.model.left.offsetX > this.model.right.offsetX - minSepPx) {
        this.model.left.offsetX = this.model.right.offsetX - minSepPx;
      }
      this.model.left.offsetX = Math.min(this.model.left.offsetX, -minFromCentrePx);
      this.model.right.offsetX = Math.max(this.model.right.offsetX, minFromCentrePx);
    }

    if (this.model.back.exists && this.model.front.exists) {
      if (this.model.back.offsetY > this.model.front.offsetY - minSepPx) {
        this.model.back.offsetY = this.model.front.offsetY - minSepPx;
      }
      this.model.back.offsetY = Math.min(this.model.back.offsetY, -minFromCentrePx);
      this.model.front.offsetY = Math.max(this.model.front.offsetY, minFromCentrePx);
    }
  }

  updateKeyPositions(key) {
    const sheets = this.editor.sheets || {};
    const plan = sheets.plan;
    if (!plan || !plan.centre) return;

    const views = this.getViewsForKey(key);

    views.forEach((viewId) => {
      const inst = this.instances[key]?.[viewId];
      if (!inst) return;

      const sheet = sheets[viewId];
      if (!sheet || !sheet.centre) return;

      let targetX, targetY;

      if (viewId === "plan") {
        if (key === "left" || key === "right") {
          targetX = Math.round((plan.centre.x + this.model[key].offsetX) * 100) / 100;
          targetY = sheet.centre.y;
        } else {
          targetX = sheet.centre.x;
          targetY = Math.round((plan.centre.y + this.model[key].offsetY) * 100) / 100;
        }
      } else if (viewId === "front" || viewId === "back") {
        targetX = Math.round((sheet.centre.x + this.model[key].offsetX) * 100) / 100;
        targetY = sheet.centre.y;
      } else if (viewId === "left" || viewId === "right") {
        targetX = sheet.centre.x;
        targetY = Math.round((sheet.centre.y + this.model[key].offsetY) * 100) / 100;
      }

      if (targetX !== undefined && targetY !== undefined) {
        inst.set({ visible: true, left: targetX, top: targetY, angle: 0 });
        inst.setCoords();
      }
    });

    const h = this.handles[key];
    if (h) {
      const p = this.getHandlePosition(key);
      const p2 = this.getSecondaryHandlePosition(key);

      if (p && h.primary) {
        const x = Math.round(p.x * 100) / 100;
        const y = Math.round(p.y * 100) / 100;
        h.primary.set({ visible: true, left: x, top: y, angle: 0 });
        h.primary.setCoords();
      }

      if (p2 && h.secondary) {
        const x = Math.round(p2.x * 100) / 100;
        const y = Math.round(p2.y * 100) / 100;
        h.secondary.set({ visible: true, left: x, top: y, angle: 0 });
        h.secondary.setCoords();
      }
    }

    const dashedLine = this.referenceDashedLines[key];
    if (dashedLine) {
      const lineCoords = this.getDashedLineCoords(key);
      if (lineCoords) this.setLinePositionWorld(dashedLine, lineCoords);
    }
  }

  getDashedLineCoords(key) {
    const sheets = this.editor.sheets || {};
    const plan = sheets.plan;
    if (!plan || !plan.centre) return null;

    const pad = this.editor.paperEdgePad;

    if (key === "left" || key === "right") {
      const front = sheets.front;
      const back = sheets.back;
      if (!front || !front.centre || !back || !back.centre) return null;

      const frontDim = this.getEffectiveDimensions(front);
      const backDim = this.getEffectiveDimensions(back);
      const frontH = frontDim.h + pad * 2;
      const backH = backDim.h + pad * 2;

      const frontTop = front.centre.y - frontH / 2;
      const backBottom = back.centre.y + backH / 2;

      const x = plan.centre.x + this.model[key].offsetX;
      return { x1: x, y1: frontTop, x2: x, y2: backBottom };
    }

    const left = sheets.left;
    const right = sheets.right;
    if (!left || !left.centre || !right || !right.centre) return null;

    const leftDim = this.getEffectiveDimensions(left);
    const rightDim = this.getEffectiveDimensions(right);
    const leftW = leftDim.w + pad * 2;
    const rightW = rightDim.w + pad * 2;

    const leftRight = left.centre.x + leftW / 2;
    const rightLeft = right.centre.x - rightW / 2;

    const y = plan.centre.y + this.model[key].offsetY;
    return { x1: leftRight, y1: y, x2: rightLeft, y2: y };
  }

  // Dashed line stays in world space (camera rotates view only)
  setLinePositionWorld(line, coords) {
    if (line.originX !== "center" || line.originY !== "center") {
      const before = line.getCenterPoint();
      line.set({ originX: "center", originY: "center" });
      line.setPositionByOrigin(before, "center", "center");
      line.setCoords();
    }

    const x1w = coords.x1;
    const y1w = coords.y1;
    const x2w = coords.x2;
    const y2w = coords.y2;

    const cx = (x1w + x2w) / 2;
    const cy = (y1w + y2w) / 2;

    line.set({
      x1: x1w - cx,
      y1: y1w - cy,
      x2: x2w - cx,
      y2: y2w - cy,
      angle: 0
    });

    line.setPositionByOrigin(new fabric.Point(cx, cy), "center", "center");
    line.setCoords();
  }

  getEffectiveDimensions(sheet) {
    return { w: sheet.wPx, h: sheet.hPx };
  }

  getSecondaryHandlePosition(key) {
    const sheets = this.editor.sheets || {};
    const plan = sheets.plan;
    if (!plan || !plan.centre) return null;

    const pad = this.editor.paperEdgePad;

    const planDim = this.getEffectiveDimensions(plan);
    const planW = planDim.w + pad * 2;
    const planH = planDim.h + pad * 2;

    const planHalfW = planW / 2;
    const planHalfH = planH / 2;

    if (key === "left" || key === "right") {
      const back = sheets.back;
      if (!back || !back.centre) return null;

      const backDim = this.getEffectiveDimensions(back);
      const backH = backDim.h + pad * 2;
      const backHalfH = backH / 2;

      const planTop = plan.centre.y - planHalfH;
      const backBottom = back.centre.y + backHalfH;

      const yGapMid = (planTop + backBottom) / 2;
      return { x: plan.centre.x + this.model[key].offsetX, y: yGapMid };
    }

    if (key === "front" || key === "back") {
      const left = sheets.left;
      if (!left || !left.centre) return null;

      const leftDim = this.getEffectiveDimensions(left);
      const leftW = leftDim.w + pad * 2;
      const leftHalfW = leftW / 2;

      const planLeft = plan.centre.x - planHalfW;
      const leftRight = left.centre.x + leftHalfW;

      const xGapMid = (planLeft + leftRight) / 2;
      return { x: xGapMid, y: plan.centre.y + this.model[key].offsetY };
    }

    return null;
  }

  getHandlePosition(key) {
    const sheets = this.editor.sheets || {};
    const plan = sheets.plan;
    if (!plan || !plan.centre) return null;

    const pad = this.editor.paperEdgePad;

    const planDim = this.getEffectiveDimensions(plan);
    const planW = planDim.w + pad * 2;
    const planH = planDim.h + pad * 2;

    const planHalfW = planW / 2;
    const planHalfH = planH / 2;

    if (key === "left" || key === "right") {
      const front = sheets.front;
      if (!front || !front.centre) return null;

      const frontDim = this.getEffectiveDimensions(front);
      const frontH = frontDim.h + pad * 2;
      const frontHalfH = frontH / 2;

      const planBottom = plan.centre.y + planHalfH;
      const frontTop = front.centre.y - frontHalfH;

      const yGapMid = (planBottom + frontTop) / 2;
      return { x: plan.centre.x + this.model[key].offsetX, y: yGapMid };
    }

    if (key === "front" || key === "back") {
      const right = sheets.right;
      if (!right || !right.centre) return null;

      const rightDim = this.getEffectiveDimensions(right);
      const rightW = rightDim.w + pad * 2;
      const rightHalfW = rightW / 2;

      const planRight = plan.centre.x + planHalfW;
      const rightLeft = right.centre.x - rightHalfW;

      const xGapMid = (planRight + rightLeft) / 2;
      return { x: xGapMid, y: plan.centre.y + this.model[key].offsetY };
    }

    return null;
  }

  reorderLayers() {
    const canvas = this.canvas;
    const objs = canvas.getObjects();

    const paperish = [];
    const grids = [];
    const labels = [];
    const dashedLines = [];
    const keyRefs = [];
    const handles = [];
    const others = [];

    objs.forEach((o) => {
      if (!o) return;

      if (o.isPaperShadow || o.isPaper || o.isSheetGuide || o.isInnerA4Frame) {
        paperish.push(o);
        return;
      }

      if (o.isGrid) {
        grids.push(o);
        return;
      }

      if (o.isSheetLabel) {
        labels.push(o);
        return;
      }

      if (o.isReferenceDashedLine) {
        dashedLines.push(o);
        return;
      }

      if (o.isKeyReference) {
        keyRefs.push(o);
        return;
      }

      if (o.isKeyReferenceHandle) {
        handles.push(o);
        return;
      }

      others.push(o);
    });

    let idx = 0;
    paperish.forEach((o) => { o.moveTo(idx); idx += 1; });
    grids.forEach((o) => { o.moveTo(idx); idx += 1; });
    labels.forEach((o) => { o.moveTo(idx); idx += 1; });
    dashedLines.forEach((o) => { o.moveTo(idx); idx += 1; });
    keyRefs.forEach((o) => { o.moveTo(idx); idx += 1; });
    handles.forEach((o) => { o.moveTo(idx); idx += 1; });
    others.forEach((o) => { o.moveTo(idx); idx += 1; });

    canvas.requestRenderAll();
  }
}
