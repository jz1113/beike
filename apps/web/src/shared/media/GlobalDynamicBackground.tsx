import React from 'react';
import DotGrid from './DotGrid';

export const GlobalDynamicBackground: React.FC = React.memo(() => {
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
        proximity={96}
        speedTrigger={240}
        shockRadius={150}
        shockStrength={2}
        returnDuration={0.65}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
});

export default GlobalDynamicBackground;
