'use client';

import React from 'react';
import Ferrofluid from '@/shared/media/Ferrofluid';
import ElectricBorder from '@/shared/media/ElectricBorder';

interface AIGeneratingCardProps {
  task?: {
    id?: string;
    model?: string;
    mediaType?: string;
    size?: string;
    quality?: string;
    videoDuration?: number;
    videoResolution?: string;
    progress?: string;
    prompt?: string;
    referenceImageUrl?: string;
    referenceImages?: string[];
  };
  progressNumber?: number;
  isVideo?: boolean;
  className?: string;
  embedded?: boolean;
}

/**
 * 🌟 铁磁流体 (Ferrofluid) + 电子能量边界 (Electric Border) AI 渲染生成卡片
 * 搭载高频磁流体等高线光波与电弧能量边框，呈现极具未来感与艺术张力的生成动效
 */
export default function AIGeneratingCard({
  className = '',
}: AIGeneratingCardProps) {
  return (
    <ElectricBorder
      color="#dfeaea"
      speed={0.8}
      chaos={0.13}
      borderRadius={20}
      className={`w-full h-full min-h-[260px] ${className}`.trim()}
    >
      <div className="relative w-full h-full min-h-[260px] overflow-hidden rounded-[20px] bg-[#07090e] select-none shadow-2xl">
        {/* 🌟 核心 Ferrofluid 磁流体 WebGL 渲染画布 */}
        <div className="absolute inset-0 w-full h-full z-0 pointer-events-auto">
          <Ferrofluid
            colors={['#ffffff', '#dfeaea', '#94a3b8', '#38bdf8']}
            speed={0.55}
            scale={1.6}
            turbulence={1.0}
            fluidity={0.12}
            rimWidth={0.22}
            sharpness={2.5}
            shimmer={1.6}
            glow={2.2}
            flowDirection="down"
            mouseInteraction={true}
            mouseStrength={1}
            mouseRadius={0.35}
            className="w-full h-full"
          />
        </div>
      </div>
    </ElectricBorder>
  );
}
