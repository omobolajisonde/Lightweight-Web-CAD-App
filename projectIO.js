// projectIO.js
/*
  Minimal save and load scaffolding

  This does NOT yet export DWG or true vector formats
  It provides
  - Save to JSON in localStorage
  - Load from JSON in localStorage
  - Export PNG snapshot for the active view

  All tool files remain self contained
  This file is optional, but useful for early testing
*/

const fabric = globalThis.fabric;

function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (err) {
    return null;
  }
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (err) {
    return null;
  }
}

function isGuideObject(obj) {
  if (!obj) return true;

  return (
    obj.isPaper === true ||
    obj.isPaperShadow === true ||
    obj.isGridLine === true ||
    obj.isPaperGrid === true ||
    obj.isSheetGuide === true ||
    obj.isSheetLabel === true ||
    obj.isInnerA4Frame === true ||
    obj.isKeyReference === true ||
    obj.isKeyReferenceHandle === true ||
    obj.isReferenceDashedLine === true ||
    obj.isEndpointMarker === true ||
    obj.isToolPreview === true
  );
}

function getExportableObjects(editor) {
  const objs = editor.canvas.getObjects() || [];
  return objs.filter((o) => !isGuideObject(o));
}

function setExportableObjects(editor, objects) {
  const canvas = editor.canvas;

  // Remove old exportables
  const existing = getExportableObjects(editor);
  existing.forEach((o) => canvas.remove(o));

  // Add new ones
  objects.forEach((o) => canvas.add(o));

  // Bring paper guides back down
  // Grid redraw will also send itself behind
  editor.drawGrid();
  if (editor.keyRefs && typeof editor.keyRefs.renderAll === "function") {
    editor.keyRefs.renderAll();
  }

  canvas.requestRenderAll();
}

function makeExportableJSON(editor) {
  const exportables = getExportableObjects(editor);

  // Allow custom properties to persist
  const json = editor.canvas.toDatalessJSON([
    "objectType",
    "__styleKey",
    "sheetId",
    "isRegionBoundary"
  ]);

  // Filter out guides from JSON too
  json.objects = (json.objects || []).filter((o) => {
    return !(
      o.isPaper === true ||
      o.isPaperShadow === true ||
      o.isGridLine === true ||
      o.isPaperGrid === true ||
      o.isSheetGuide === true ||
      o.isSheetLabel === true ||
      o.isInnerA4Frame === true ||
      o.isKeyReference === true ||
      o.isKeyReferenceHandle === true ||
      o.isReferenceDashedLine === true ||
      o.isEndpointMarker === true ||
      o.isToolPreview === true
    );
  });

  return json;
}

function loadFromJSON(editor, json, onDone) {
  const canvas = editor.canvas;

  // Remove current exportables
  const existing = getExportableObjects(editor);
  existing.forEach((o) => canvas.remove(o));

  canvas.loadFromJSON(
    json,
    () => {
      // After load, reapply defaults
      const objs = getExportableObjects(editor);

      objs.forEach((o) => {
        if (!o) return;

        o.objectCaching = false;
        o.noScaleCache = true;

        // Lock movement, keep CAD edit flow consistent
        if (o.type === "line") {
          o.lockMovementX = true;
          o.lockMovementY = true;
          o.lockScalingX = true;
          o.lockScalingY = true;
          o.lockRotation = true;
        }

        // Ensure selection boxes do not appear
        o.hasBorders = false;
        o.hasControls = false;
        o.borderColor = "rgba(0,0,0,0)";
        o.cornerColor = "rgba(0,0,0,0)";
        o.cornerSize = 0;
        o.transparentCorners = true;
        o.padding = 0;
        o.borderScaleFactor = 0;
      });

      editor.drawGrid();
      if (editor.keyRefs && typeof editor.keyRefs.renderAll === "function") {
        editor.keyRefs.renderAll();
      }
      if (typeof editor.applyViewFilter === "function") {
        editor.applyViewFilter(editor.activeViewId);
      }
      
      canvas.requestRenderAll();
      if (typeof onDone === "function") onDone();
    },
    function reviver(_o, object) {
      // Ensure any missing flags are safe
      if (object) {
        object.objectCaching = false;
        object.noScaleCache = true;
      }
      return object;
    }
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportPNG(editor) {
  const canvas = editor.canvas;

  // Temporarily hide grid lines for cleaner export
  const gridLines = canvas.getObjects().filter((o) => o && o.isGridLine === true);
  const wasVisible = gridLines.map((o) => o.visible);

  gridLines.forEach((o) => {
    o.visible = false;
  });

  canvas.requestRenderAll();

  const dataUrl = canvas.toDataURL({
    format: "png",
    multiplier: 2
  });

  // Restore grid visibility
  gridLines.forEach((o, i) => {
    o.visible = wasVisible[i];
  });

  canvas.requestRenderAll();

  // Download
  fetch(dataUrl)
    .then((r) => r.blob())
    .then((blob) => {
      const name = `export-${editor.activeViewId || "view"}.png`;
      downloadBlob(blob, name);
    })
    .catch(() => {});
}

export function initProjectIO(editor) {
  // If buttons exist, wire them up
  const saveBtn = document.getElementById("btn-save");
  const loadBtn = document.getElementById("btn-load");
  const pngBtn = document.getElementById("btn-export-png");

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const json = makeExportableJSON(editor);
      const str = safeStringify(json);
      if (!str) {
        alert("Save failed");
        return;
      }

      localStorage.setItem("drafting-project-json", str);
      alert("Saved");
    });
  }

  if (loadBtn) {
    loadBtn.addEventListener("click", () => {
      const str = localStorage.getItem("drafting-project-json");
      if (!str) {
        alert("No saved project found");
        return;
      }

      const json = safeParse(str);
      if (!json) {
        alert("Load failed");
        return;
      }

      loadFromJSON(editor, json, () => {
        alert("Loaded");
      });
    });
  }

  if (pngBtn) {
    pngBtn.addEventListener("click", () => {
      exportPNG(editor);
    });
  }
}
