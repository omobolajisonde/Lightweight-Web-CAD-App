/**
 * Tool contract (for documentation and optional JSDoc).
 * A tool implements optional handlers and draw; the engine calls them when the tool is active.
 *
 * @typedef {Object} ToolContext
 * @property {import('../core/viewport.js').Viewport} viewport
 * @property {{x: number, y: number}} mouse - screen coords
 * @property {{x: number, y: number}} worldMouse
 * @property {Object[][]} polylines
 * @property {Object[][]} selectedLines
 * @property {function(Object[][]): void} setSelectedLines
 * @property {function(): {point: {x,y}, type: string}|null} getSnap
 * @property {function(Object): void} addPolyline
 * @property {function(Object[]): void} removePolylines
 *
 * @typedef {Object} Tool
 * @property {string} id
 * @property {string} name
 * @property {function(): void} [activate]
 * @property {function(): void} [deactivate]
 * @property {function(ToolContext): boolean} [onMouseDown] - return true if consumed
 * @property {function(ToolContext): void} [onMouseMove]
 * @property {function(ToolContext): void} [onMouseUp]
 * @property {function(ToolContext): boolean} [onClick] - return true if consumed
 * @property {function(ToolContext): void} [draw] - draw tool-specific overlay/preview
 */

export default {};
