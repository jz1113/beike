import type { HomeCanvasNode } from '@client/shared/home-publish/homePublish';

export function fitShowcaseCanvas(nodes: HomeCanvasNode[], width: number, height: number) {
  if (!nodes.length) return { zoom: 1, pan: { x: width / 2, y: height / 2 } };
  const minX = Math.min(...nodes.map(node => node.x));
  const minY = Math.min(...nodes.map(node => node.y));
  const spanX = Math.max(...nodes.map(node => node.x + node.width)) - minX;
  const spanY = Math.max(...nodes.map(node => node.y + node.height)) - minY;
  const zoom = Math.min(Math.max(1, width - 64) / spanX, Math.max(1, height - 64) / spanY, 1);
  return { zoom, pan: { x: (width - spanX * zoom) / 2 - minX * zoom, y: (height - spanY * zoom) / 2 - minY * zoom } };
}
