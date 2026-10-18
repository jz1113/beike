import type { CanvasNode } from '../model/types';
import { nodeBounds } from '../model/canvasGraph';

export interface AlignmentGuide {
  type: 'horizontal' | 'vertical';
  coordinate: number;
  start: number;
  end: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: AlignmentGuide[];
}

export function computeSnapGuides(
  movingNodes: CanvasNode[],
  allNodes: CanvasNode[],
  dx: number,
  dy: number,
  zoom: number,
  thresholdPixels = 6,
): SnapResult {
  if (!movingNodes.length) return { dx, dy, guides: [] };

  const threshold = thresholdPixels / Math.max(zoom, 0.2);
  const movingIds = new Set(movingNodes.map(n => n.id));
  const otherNodes = allNodes.filter(n => !movingIds.has(n.id) && !n.layerHidden);

  if (!otherNodes.length) return { dx, dy, guides: [] };

  // Calculate moving bounding box after preliminary delta
  const boundsList = movingNodes.map(n => {
    const b = nodeBounds(n);
    return {
      x: b.x + dx,
      y: b.y + dy,
      width: b.width,
      height: b.height,
    };
  });

  const minX = Math.min(...boundsList.map(b => b.x));
  const maxX = Math.max(...boundsList.map(b => b.x + b.width));
  const midX = (minX + maxX) / 2;

  const minY = Math.min(...boundsList.map(b => b.y));
  const maxY = Math.max(...boundsList.map(b => b.y + b.height));
  const midY = (minY + maxY) / 2;

  let snapDx = 0;
  let snapDy = 0;
  let minDiffX = threshold;
  let minDiffY = threshold;
  const guides: AlignmentGuide[] = [];

  for (const other of otherNodes) {
    const ob = nodeBounds(other);
    const oMinX = ob.x;
    const oMaxX = ob.x + ob.width;
    const oMidX = ob.x + ob.width / 2;

    const oMinY = ob.y;
    const oMaxY = ob.y + ob.height;
    const oMidY = ob.y + ob.height / 2;

    // Horizontal check (comparing X coordinates)
    const xComparisons = [
      { movingVal: minX, otherVal: oMinX },
      { movingVal: minX, otherVal: oMaxX },
      { movingVal: maxX, otherVal: oMinX },
      { movingVal: maxX, otherVal: oMaxX },
      { movingVal: midX, otherVal: oMidX },
    ];

    for (const comp of xComparisons) {
      const diff = comp.otherVal - comp.movingVal;
      if (Math.abs(diff) < minDiffX) {
        minDiffX = Math.abs(diff);
        snapDx = diff;
        guides.push({
          type: 'vertical',
          coordinate: comp.otherVal,
          start: Math.min(minY, oMinY) - 20,
          end: Math.max(maxY, oMaxY) + 20,
        });
      }
    }

    // Vertical check (comparing Y coordinates)
    const yComparisons = [
      { movingVal: minY, otherVal: oMinY },
      { movingVal: minY, otherVal: oMaxY },
      { movingVal: maxY, otherVal: oMinY },
      { movingVal: maxY, otherVal: oMaxY },
      { movingVal: midY, otherVal: oMidY },
    ];

    for (const comp of yComparisons) {
      const diff = comp.otherVal - comp.movingVal;
      if (Math.abs(diff) < minDiffY) {
        minDiffY = Math.abs(diff);
        snapDy = diff;
        guides.push({
          type: 'horizontal',
          coordinate: comp.otherVal,
          start: Math.min(minX, oMinX) - 20,
          end: Math.max(maxX, oMaxX) + 20,
        });
      }
    }
  }

  // Filter guides to only those matching final snapped position
  const finalGuides = guides.filter(g => {
    if (g.type === 'vertical') {
      return Math.abs(g.coordinate - (minX + snapDx)) < 0.5 ||
             Math.abs(g.coordinate - (maxX + snapDx)) < 0.5 ||
             Math.abs(g.coordinate - (midX + snapDx)) < 0.5;
    }
    return Math.abs(g.coordinate - (minY + snapDy)) < 0.5 ||
           Math.abs(g.coordinate - (maxY + snapDy)) < 0.5 ||
           Math.abs(g.coordinate - (midY + snapDy)) < 0.5;
  });

  return {
    dx: dx + snapDx,
    dy: dy + snapDy,
    guides: finalGuides.slice(0, 4), // Keep most relevant
  };
}
