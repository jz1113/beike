'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { mountAeroShards } from './aeroLifecycle';
import './AeroShards.css';
import { ROOT, PLACEMENTS, MATERIALS, MARKER_STYLES, clamp, parseColor, AeroSettings } from './aeroShardModel';

export interface AeroShardsProps {
  shardColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  lightMode?: boolean;
  placement?: 'full' | 'left' | 'right' | 'center';
  material?: 'glass' | 'chrome';
  count?: number;
  shardSize?: number;
  spread?: number;
  twist?: number;
  billow?: number;
  speed?: number;
  scale?: number;
  depthOfField?: number;
  glow?: number;
  grain?: number;
  vignette?: number;
  intro?: boolean;
  mouseInteraction?: boolean;
  mouseStrength?: number;
  markers?: 'plus' | 'dots' | 'none';
  pulseOnClick?: boolean;
  holdToGather?: boolean;
  parallax?: number;
  paused?: boolean;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
  onError?: (error: Error) => void;
}

export default function AeroShards({
  shardColor = '#896ABD',
  accentColor = '#A855F7',
  backgroundColor = 'transparent',
  lightMode = false,
  placement = 'full',
  material = 'glass',
  count = 1300,
  shardSize = 1,
  spread = 1,
  twist = 1,
  billow = 1,
  speed = 1,
  scale = 1,
  depthOfField = 0.75,
  glow = 0.35,
  grain = 0.06,
  vignette = 0.3,
  intro = true,
  mouseInteraction = true,
  mouseStrength = 0.6,
  markers = 'plus',
  pulseOnClick = true,
  holdToGather = true,
  parallax = 0.5,
  paused = false,
  dpr = 2,
  className = '',
  style,
  onError
}: AeroShardsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const settings: AeroSettings = {
    shard: parseColor(shardColor, [0.54, 0.42, 0.74]) ?? [0.54, 0.42, 0.74],
    accent: parseColor(accentColor, [0.66, 0.33, 0.97]) ?? [0.66, 0.33, 0.97],
    paper: parseColor(backgroundColor, null),
    lightMode,
    placement: Math.max(0, PLACEMENTS.indexOf(placement)),
    material: MATERIALS[material] ?? MATERIALS.glass,
    count: Math.round(clamp(count, 100, 6000)),
    shardSize: clamp(shardSize, 0.2, 4),
    spread: clamp(spread, 0, 3),
    twist: clamp(twist, 0, 3),
    billow: clamp(billow, 0, 3),
    speed: clamp(speed, 0, 4),
    scale: clamp(scale, 0.4, 2.5),
    depthOfField: clamp(depthOfField, 0, 1),
    glow: clamp(glow, 0, 2),
    grain: clamp(grain, 0, 0.5),
    vignette: clamp(vignette, 0, 1),
    intro,
    mouseInteraction,
    mouseStrength: clamp(mouseStrength, 0, 1),
    markers: MARKER_STYLES[markers] ?? -1,
    pulseOnClick,
    holdToGather,
    parallax: clamp(parallax, 0, 1),
    paused,
    dpr: Math.max(0.5, dpr)
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const container = containerRef.current;
    if (container) return mountAeroShards(container, settingsRef, onErrorRef);
  }, []);

  return <div ref={containerRef} className={[ROOT, className].filter(Boolean).join(' ')} style={style} />;
}
