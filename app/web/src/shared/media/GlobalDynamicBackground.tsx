import React from 'react';
import DotGrid from './DotGrid';
import type { AppView } from '@/store/useAppStore';

interface Props {
  currentView?: AppView;
}

export const GlobalDynamicBackground: React.FC<Props> = () => {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none"
      aria-hidden="true"
    >
      {/* 🌟 交互式点阵背景 DotGrid (极简中性克制设计，无彩色光斑污染) */}
      <DotGrid
        dotSize={3}
        gap={28}
        baseColor="#CBD5E1"
        activeColor="#94A3B8"
        proximity={130}
        speedTrigger={70}
        shockRadius={220}
        shockStrength={4}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
};

export default GlobalDynamicBackground;
