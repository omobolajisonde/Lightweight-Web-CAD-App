// main.js
import { Editor } from "./editor.js";
import { PlanTabs } from "./planTabs.js";

function boot() {
  const wrapper = document.getElementById("canvas-wrapper");
  const canvas = document.getElementById("c");

  if (!wrapper || !canvas) {
    console.error("Missing canvas elements");
    return;
  }

  const editor = new Editor("c");
  window.__editor = editor;
  // Convenience alias (some earlier instructions used window.editor)
  window.editor = editor;

  // Mount Plan Level Tabs UI (Phase 4)
  const tabsRoot = document.getElementById("plan-tabs-root");
  if (tabsRoot) {
    editor.__planTabs = new PlanTabs(editor, tabsRoot);
  } else {
    console.warn("plan-tabs-root not found; PlanTabs not mounted");
  }

  // Keep guide line canvas sized and aligned
  const guide = document.getElementById("guide-line");
  if (guide) {
    const resizeGuide = () => {
      const w = wrapper.clientWidth || window.innerWidth;
      const h = wrapper.clientHeight || window.innerHeight;
      guide.width = w;
      guide.height = h;
      guide.style.left = "0px";
      guide.style.top = "0px";
    };

    resizeGuide();
    window.addEventListener("resize", resizeGuide);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const exportBtn = document.getElementById("btnExportJson");
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const canvas = editor.canvas;

    // Include any custom props your app uses here
    const json = canvas.toJSON([
      "viewId",
      "sheetId",
      "isPaper",
      "isLinework",
      "isOverlay",
      "snapMeta",
      "toolType"
    ]);

    downloadJson("cad-export.json", json);
  });
}
