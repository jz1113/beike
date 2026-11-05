import type { StudioScene } from '../../model/types';

/** A local diagram preview; it never fetches media or changes the saved view. */
export function CanvasScenePreview({ scene }: { scene?: StudioScene }) {
  const nodes = scene?.nodes.slice(0, 80).map(node => ({
    id: node.id,
    type: node.type,
    x: finite(node.x, 0), y: finite(node.y, 0),
    width: Math.max(40, finite(node.width, 300)),
    height: Math.max(40, finite(node.height, 240)),
  })) ?? [];
  if (!nodes.length) return null;
  const left = Math.min(...nodes.map(n => n.x));
  const top = Math.min(...nodes.map(n => n.y));
  const width = Math.max(...nodes.map(n => n.x + n.width)) - left;
  const height = Math.max(...nodes.map(n => n.y + n.height)) - top;
  const padding = Math.max(width, height) * 0.06;
  const byId = new Map(nodes.map(n => [n.id, n]));
  return <svg aria-hidden="true" viewBox={`${left-padding} ${top-padding} ${width+padding*2} ${height+padding*2}`}
    className="absolute inset-0 h-full w-full p-2 text-slate-400 dark:text-slate-500">
    {scene?.connections.map(edge => {
      const from = byId.get(edge.from), to = byId.get(edge.to);
      if (!from || !to) return null;
      const x = from.x + from.width, y = from.y + from.height / 2;
      const endY = to.y + to.height / 2, mid = (x + to.x) / 2;
      return <path key={edge.id} d={`M${x} ${y} C${mid} ${y} ${mid} ${endY} ${to.x} ${endY}`}
        fill="none" stroke="currentColor" strokeWidth="0.6" vectorEffect="non-scaling-stroke" opacity="0.65" />;
    })}
    {nodes.map(node => <g key={node.id}>
      <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="16"
        fill="currentColor" opacity={node.type === 'text-node' ? 0.18 : 0.3} />
      <rect x={node.x+12} y={node.y+12} width={node.width-24} height="8" rx="4"
        fill={node.type === 'gen-video' ? '#d3a17f' : node.type === 'gen-image' ? '#8d9bc4' : 'currentColor'} opacity="0.8" />
    </g>)}
  </svg>;
}

function finite(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
