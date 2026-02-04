// toolsIndex.js
import { SelectTool } from "./tools/Tools-Select.js";
import { LineTool } from "./tools/Tools-Line.js";
import { PolylineTool } from "./tools/Tools-Polyline.js";
import { CircleTool } from "./tools/Tools-Circle.js";
import { ArcTool } from "./tools/Tools-Arc.js";
import { FilledRegionTool } from "./tools/Tools-FilledRegion.js";

export function createTools(editor) {
  return {
    select: new SelectTool(editor),
    line: new LineTool(editor),
    polyline: new PolylineTool(editor),
    circle: new CircleTool(editor),
    arc: new ArcTool(editor),
    filledRegion: new FilledRegionTool(editor)
  };
}

export const TOOL_IDS = Object.freeze([
  "select",
  "line",
  "polyline",
  "circle",
  "arc",
  "filledRegion"
]);
