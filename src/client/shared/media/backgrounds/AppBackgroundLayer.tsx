import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { AppBackgroundStyle } from '@client/shared/media/backgrounds/backgroundCatalog';
import { buildBackgroundProps } from '@client/shared/media/backgrounds/backgroundProps';
import type { StudioRenderMode, StudioValues } from '@client/shared/media/backgrounds/studio';

const AeroShards = lazy(() => import('@client/shared/media/widgets/backgrounds/AeroShards'));
const Beams = lazy(() => import('@client/shared/media/widgets/backgrounds/Beams'));
const DotGrid = lazy(() => import('@client/shared/media/widgets/backgrounds/DotGrid'));
const Galaxy = lazy(() => import('@client/shared/media/widgets/backgrounds/Galaxy'));
const LightRays = lazy(() => import('@client/shared/media/widgets/backgrounds/LightRays'));
const Particles = lazy(() => import('@client/shared/media/widgets/backgrounds/Particles'));

export type AppBackgroundLayerProps = {
  style: AppBackgroundStyle;
  isDark: boolean;
  studio?: StudioValues;
  mode?: StudioRenderMode;
  className?: string;
};

function AmbientGlow({ isDark, preview = false }: { isDark: boolean; preview?: boolean }) {
  if (preview) {
    return (
      <div className="absolute inset-0 bg-transparent">
        <div
          className="absolute left-1/2 top-[-18%] h-[70%] w-[80%] -translate-x-1/2 rounded-full blur-2xl"
          style={{
            background: isDark
              ? 'radial-gradient(ellipse at center, rgba(129, 140, 248, 0.55), rgba(168, 85, 247, 0.22), transparent 72%)'
              : 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.38), rgba(147, 197, 253, 0.2), transparent 72%)',
          }}
        />
        <div
          className="absolute bottom-[-12%] right-[-8%] h-[46%] w-[52%] rounded-full blur-2xl"
          style={{
            background: isDark ? 'rgba(56, 189, 248, 0.28)' : 'rgba(199, 210, 254, 0.85)',
          }}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-transparent">
      <div
        className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[1200px] h-[600px] rounded-full blur-[120px] pointer-events-none opacity-40 dark:opacity-25 transition-opacity duration-700"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.12), transparent 70%)'
            : 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.12), rgba(147, 197, 253, 0.08), transparent 70%)',
        }}
      />
      <div
        className="absolute -bottom-[20%] right-[-10%] w-[800px] h-[500px] rounded-full blur-[140px] pointer-events-none opacity-25 dark:opacity-15"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse at center, rgba(14, 165, 233, 0.2), transparent 70%)'
            : 'radial-gradient(ellipse at center, rgba(224, 231, 255, 0.6), transparent 70%)',
        }}
      />
    </div>
  );
}

function WebGLGuard({
  isDark,
  resetKey,
  children,
}: {
  isDark: boolean;
  resetKey: string;
  children: React.ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [lostKey, setLostKey] = useState<string | null>(null);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return undefined;
    const onLost = (event: Event) => {
      if (!(event.target instanceof Node) || !node.contains(event.target)) return;
      event.preventDefault();
      setLostKey(resetKey);
    };
    node.addEventListener('webglcontextlost', onLost, true);
    return () => node.removeEventListener('webglcontextlost', onLost, true);
  }, [resetKey]);

  if (lostKey === resetKey) return <AmbientGlow isDark={isDark} />;
  return (
    <div ref={frameRef} className="absolute inset-0 h-full w-full">
      {children}
    </div>
  );
}

export function AppBackgroundLayer({
  style,
  isDark,
  studio,
  mode = 'live',
  className = '',
}: AppBackgroundLayerProps) {
  const sharedClass = `absolute inset-0 h-full w-full ${className}`;
  const widget = buildBackgroundProps(style, studio, { isDark, mode });

  if (!widget) {
    return <AmbientGlow isDark={isDark} preview={mode === 'thumb'} />;
  }

  const wrap = (child: React.ReactNode) => (
    <WebGLGuard isDark={isDark} resetKey={style}>
      <Suspense fallback={<AmbientGlow isDark={isDark} />}>
        {child}
      </Suspense>
    </WebGLGuard>
  );

  if (widget.kind === 'dots') return wrap(<DotGrid className={sharedClass} {...widget.props} />);
  if (widget.kind === 'shards') return wrap(<AeroShards className={sharedClass} {...widget.props} />);
  if (widget.kind === 'beams') return wrap(<Beams className={sharedClass} {...widget.props} />);
  if (widget.kind === 'rays') return wrap(<LightRays className={sharedClass} {...widget.props} />);
  if (widget.kind === 'galaxy') return wrap(<Galaxy className={sharedClass} {...widget.props} />);
  return wrap(<Particles className={sharedClass} {...widget.props} />);
}

export default AppBackgroundLayer;
