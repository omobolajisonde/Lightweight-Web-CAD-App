/**
 * Tool registry: central export for all tools.
 * To add a new tool:
 * 1. Create tools/<name>.js exporting createTool(engine) → { id, name, onMouseDown, onMouseMove, onMouseUp, onClick, draw, activate?, deactivate? }
 * 2. Import and add it to the array below.
 */

import { createLineTool } from './line.js';
import { createSelectTool } from './select.js';

/**
 * @param {import('../core/engine.js').Engine} engine
 * @returns {import('./types.js').Tool[]}
 */
export function createTools(engine) {
  return [createLineTool(engine), createSelectTool(engine)];
}
