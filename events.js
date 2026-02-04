// events.js
import { InputRouter } from "./InputRouter.js";

function byId(id) {
  return document.getElementById(id);
}

function safeOn(el, evt, fn) {
  if (!el) return;
  el.addEventListener(evt, fn);
}

function setButtonActive(toolId) {
  const ids = ["select", "line", "polyline", "circle", "arc", "filledRegion"];

  ids.forEach((id) => {
    const b = byId(`btn-${id}`);
    if (!b) return;

    if (id === toolId) b.classList.add("active");
    else b.classList.remove("active");
  });
}

function applyDashChoiceToCurrentSelection(editor) {
  const dashSel = byId("style-dash");
  if (!dashSel) return;

  const choice = dashSel.value;
  let dashArray = null;

  if (choice === "dashed") dashArray = [8, 6];
  if (choice === "dotted") dashArray = [2, 6];

  const active = editor.canvas.getActiveObject();
  if (!active) return;

  const applyToObj = (obj) => {
    if (!obj) return;

    // Paper and sheet furniture
    if (obj.isPaper === true) return;
    if (obj.isPaperShadow === true) return;
    if (obj.isSheetGuide === true) return;
    if (obj.isInnerA4Frame === true) return;
    if (obj.isSheetLabel === true) return;

    // Background grid
    if (obj.isGridLine === true) return;
    if (obj.isGrid === true) return;
    if (obj.isPaperGrid === true) return;

    // Building grid
    if (obj.isKeyReference === true) return;
    if (obj.isKeyReferenceHandle === true) return;
    if (obj.isReferenceDashedLine === true) return;

    // Tool previews
    if (obj.isToolPreview === true) return;

    obj.set({ strokeDashArray: dashArray });
    obj.objectCaching = false;
    obj.dirty = true;
  };

  if (active.type === "activeSelection") {
    active.getObjects().forEach(applyToObj);
  } else {
    applyToObj(active);
  }

  editor.canvas.requestRenderAll();
}

export function initEvents(editor) {
  const router = new InputRouter(editor);
  router.attach();
  editor.inputRouter = router;

  // Tools
  safeOn(byId("btn-select"), "click", () => {
    editor.setMode("select");
    setButtonActive("select");
  });

  safeOn(byId("btn-line"), "click", () => {
    editor.setMode("line");
    setButtonActive("line");
  });

  safeOn(byId("btn-polyline"), "click", () => {
    editor.setMode("polyline");
    setButtonActive("polyline");
  });

  safeOn(byId("btn-circle"), "click", () => {
    editor.setMode("circle");
    setButtonActive("circle");
  });

  safeOn(byId("btn-arc"), "click", () => {
    editor.setMode("arc");
    setButtonActive("arc");
  });

  safeOn(byId("btn-filledRegion"), "click", () => {
    editor.setMode("filledRegion");
    setButtonActive("filledRegion");
  });

  // View
  safeOn(byId("btn-rotate-view"), "click", () => {
    editor.rotateView();
  });

  safeOn(byId("btn-fit-sheets"), "click", () => {
    editor.fitToSheets(editor.activeViewId || "plan");
  });

  // Style controls
  safeOn(byId("line-type-selector"), "change", (e) => {
    editor.activeStyleType = e.target.value;
    editor.updateSelectionStyles();
  });

  safeOn(byId("style-dash"), "change", () => {
    applyDashChoiceToCurrentSelection(editor);
  });

  // Angle snap mode (Off / Shift-only / Always)
    // Angle snap mode (Off / Shift-only / Always) — robust binding + optional hotkey
    const angleSnapSel = byId("angle-snap-mode");

    function setAngleSnapMode(mode) {
      if (!editor.snapper || typeof editor.snapper.setAngleSnapMode !== "function") return;
  
      editor.snapper.setAngleSnapMode(mode);
  
      // Keep UI in sync with the real snapper state
      if (angleSnapSel && typeof editor.snapper.getAngleSnapMode === "function") {
        angleSnapSel.value = editor.snapper.getAngleSnapMode() || "shift";
      }
    }
  
    function syncAngleSnapUIFromSnapper() {
      if (!angleSnapSel) return;
      if (!editor.snapper || typeof editor.snapper.getAngleSnapMode !== "function") return;
      angleSnapSel.value = editor.snapper.getAngleSnapMode() || "shift";
    }
  
    // Initial sync (after snapper exists)
    syncAngleSnapUIFromSnapper();
  
    // UI change -> snapper
    safeOn(angleSnapSel, "change", (e) => {
      const mode = e && e.target ? e.target.value : "shift";
      setAngleSnapMode(mode);
    });
  
    // Optional: press "A" to cycle modes (off -> shift -> always -> off)
    safeOn(window, "keydown", (e) => {
      // don't hijack typing in inputs/selects/textareas
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;
  
      if (e.key === "a" || e.key === "A") {
        if (!editor.snapper || typeof editor.snapper.getAngleSnapMode !== "function") return;
  
        const cur = editor.snapper.getAngleSnapMode() || "shift";
        const next = cur === "off" ? "shift" : cur === "shift" ? "always" : "off";
        setAngleSnapMode(next);
      }
    });
  

  safeOn(byId("scale-selector"), "change", (e) => {
    const n = Number(e.target.value);
    if (isFinite(n) && n > 0) editor.currentScale = n;
    editor.updateSelectionStyles();
  });

  // Toggles
  safeOn(byId("view-toggle"), "change", (e) => {
    const isWeighted = !!e.target.checked;
    editor.isWireframe = !isWeighted;
    editor.refreshViewMode();
  });

  safeOn(byId("grid-toggle"), "change", (e) => {
    editor.showGrid = !!e.target.checked;
    editor.drawGrid();
    editor.canvas.requestRenderAll();
  });

  safeOn(byId("keyref-toggle"), "change", (e) => {
    editor.setKeyReferencesEnabled(!!e.target.checked);
  });

  // Keyboard
  safeOn(window, "keydown", (e) => {
    if (e.code === "Space") editor.isSpaceDown = true;

    const tool =
      editor.tools && editor.tools[editor.activeToolId]
        ? editor.tools[editor.activeToolId]
        : null;

    if (tool && typeof tool.onKeyDown === "function") tool.onKeyDown(e);
  });

  safeOn(window, "keyup", (e) => {
    if (e.code === "Space") editor.isSpaceDown = false;

    const tool =
      editor.tools && editor.tools[editor.activeToolId]
        ? editor.tools[editor.activeToolId]
        : null;

    if (tool && typeof tool.onKeyUp === "function") tool.onKeyUp(e);
  });
}
