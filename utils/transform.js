export function worldToScreen(p, scale, offset) {
  return {
    x: p.x * scale + offset.x,
    y: p.y * scale + offset.y,
  };
}

export function screenToWorld(p, scale, offset) {
  return {
    x: (p.x - offset.x) / scale,
    y: (p.y - offset.y) / scale,
  };
}
