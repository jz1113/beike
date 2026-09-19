import type { CSSProperties } from 'react';

export function CanvasDotGridStatic({
  pan,
  zoom,
  dotSize = 3,
  gap = 28,
  baseColor = '#CBD5E1',
  className = '',
  style,
}: {
  pan: { x: number; y: number };
  zoom: number;
  dotSize?: number;
  gap?: number;
  baseColor?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const step = (dotSize + gap) * zoom;
  const radius = Math.max(0.8, (dotSize / 2) * Math.sqrt(Math.max(zoom, 0.01)));
  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
      style={{
        ...style,
        backgroundImage: `radial-gradient(circle, ${baseColor} ${radius}px, transparent ${radius + 0.5}px)`,
        backgroundSize: `${step}px ${step}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      aria-hidden="true"
    />
  );
}
