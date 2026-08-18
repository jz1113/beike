'use client';
import React, { useMemo } from 'react';
import { Film, Sparkles, Camera, Layers, Wand2 } from 'lucide-react';
import { formatDisplayModel } from '@/lib/drawing';

interface AIGeneratingCardProps {
  task: {
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
 * 🌟 现代摄影工坊 AI 渲染动效 (Modern Light Studio AI Generator)
 * 采用与主程序高度一致的极简白系、透光毛玻璃光晕、优雅流动进度条与阶段状态反馈
 */
export default function AIGeneratingCard({
  task,
  progressNumber: customProgress,
  isVideo: customIsVideo,
  className = '',
  embedded = true
}: AIGeneratingCardProps) {
  const isVideo = customIsVideo !== undefined 
    ? customIsVideo 
    : (task.mediaType === 'video' || (task.model && (task.model.toLowerCase().includes('seedance') || task.model.toLowerCase().includes('veo') || task.model.toLowerCase().includes('kling') || task.model.toLowerCase().includes('minimax') || task.model.toLowerCase().includes('hunyuan'))));

  // 计算进度百分比 (1 - 99)
  const progressNumber = useMemo(() => {
    if (customProgress !== undefined) return Math.min(Math.max(customProgress, 1), 99);
    if (task.progress && task.progress.includes('%')) {
      const match = task.progress.match(/(\d+)%/);
      if (match) return Math.min(Math.max(parseInt(match[1], 10), 1), 99);
    }
    return 36;
  }, [customProgress, task.progress]);

  // 动态阶段状态反馈
  const stageInfo = useMemo(() => {
    if (isVideo) {
      if (progressNumber < 25) {
        return { step: '1/4', title: '时序分镜与构图骨架解析', icon: Camera, color: 'text-indigo-600' };
      }
      if (progressNumber < 60) {
        return { step: '2/4', title: '逐帧连续去噪与运动渲染', icon: Layers, color: 'text-purple-600' };
      }
      if (progressNumber < 88) {
        return { step: '3/4', title: '4K 光学景深与色彩调校', icon: Sparkles, color: 'text-pink-600' };
      }
      return { step: '4/4', title: '视频编码与最终封装输出', icon: Film, color: 'text-indigo-600' };
    } else {
      if (progressNumber < 25) {
        return { step: '1/4', title: '解析构图与商品物理外观', icon: Camera, color: 'text-indigo-600' };
      }
      if (progressNumber < 60) {
        return { step: '2/4', title: '潜空间高维去噪与材质重构', icon: Layers, color: 'text-purple-600' };
      }
      if (progressNumber < 88) {
        return { step: '3/4', title: '4K 超清光影与肤质精修', icon: Sparkles, color: 'text-pink-600' };
      }
      return { step: '4/4', title: '色彩校准与高保真输出', icon: Wand2, color: 'text-indigo-600' };
    }
  }, [progressNumber, isVideo]);

  const StageIcon = stageInfo.icon;
  const refImage = task.referenceImages?.[0] || task.referenceImageUrl;
  const displayModel = formatDisplayModel(task.model, Boolean(isVideo));

  return (
    <div className={`relative w-full h-full min-h-[240px] overflow-hidden bg-gradient-to-b from-white via-slate-50/90 to-indigo-50/30 text-slate-800 flex flex-col justify-between select-none ${className}`}>
      
      {/* 1. 背景柔光弥散 (Ambient Diffused Studio Glow) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* 参考图背景微弱毛玻璃模糊 */}
        {refImage && (
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-10 filter blur-2xl scale-110 transition-opacity"
            style={{ backgroundImage: `url(${refImage})` }}
          />
        )}
        
        {/* 柔和环境光晕 */}
        <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-12 -right-12 w-52 h-52 rounded-full bg-purple-500/10 blur-3xl animate-pulse" style={{ animationDelay: '1.2s' }} />
        
        {/* 极简取景器网格线 */}
        <div className="absolute inset-6 border border-slate-200/50 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-60">
          <div className="border-r border-b border-slate-200/40" />
          <div className="border-r border-b border-slate-200/40" />
          <div className="border-b border-slate-200/40" />
          <div className="border-r border-b border-slate-200/40" />
          <div className="border-r border-b border-slate-200/40" />
          <div className="border-b border-slate-200/40" />
          <div className="border-r border-slate-200/40" />
          <div className="border-r border-slate-200/40" />
          <div />
        </div>
      </div>

      {/* 2. 四角极简取景标尺 (Clean Studio HUD Corners) */}
      <div className="absolute inset-4 pointer-events-none flex flex-col justify-between z-10 text-slate-300">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm leading-none">⌜</span>
          <span className="font-mono text-sm leading-none">⌝</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm leading-none">⌞</span>
          <span className="font-mono text-sm leading-none">⌟</span>
        </div>
      </div>

      {/* 3. 核心动效区：优雅透光渲染光核 (Luminous Studio Prism Orb) */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center py-6 w-full px-4">
        
        {/* 动态光晕与圆环 */}
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
          {/* 外圈呼吸光晕 */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500/20 via-purple-500/25 to-pink-500/20 blur-xl animate-pulse" />
          
          {/* 顺时针流光渐变细环 */}
          <div className="absolute inset-0 rounded-full p-[2px] bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 opacity-90 shadow-md">
            <div className="w-full h-full rounded-full bg-white" />
          </div>

          {/* 内部透光水晶透镜 */}
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/95 backdrop-blur-xl border border-white shadow-md flex items-center justify-center">
            <StageIcon className={`w-7 h-7 ${stageInfo.color} animate-pulse`} />
          </div>
        </div>

        {/* 动态进度与文案展示 */}
        <div className="mt-4 flex flex-col items-center space-y-2 text-center max-w-full">
          
          {/* 进度百分比与阶段徽章 */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-[10.5px] font-mono font-bold text-indigo-700 shadow-2xs">
              PHASE {stageInfo.step}
            </span>
            <span className="text-xl font-black font-mono tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600">
              {progressNumber}%
            </span>
          </div>

          {/* 阶段标题 */}
          <p className="text-xs font-bold text-slate-800 tracking-tight whitespace-nowrap truncate max-w-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
            <span>{stageInfo.title}</span>
          </p>

          {/* 优雅流动进度条 */}
          <div className="w-36 sm:w-44 h-1.5 rounded-full bg-slate-200/80 p-[1px] overflow-hidden relative shadow-inner">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 transition-all duration-300 ease-out shadow-xs"
              style={{ width: `${progressNumber}%` }}
            />
          </div>

          <div className="text-[10.5px] text-slate-400 font-mono">
            {displayModel || '4K 高保真买家秀渲染中'}
          </div>
        </div>
      </div>

      {/* 4. 底部微标 (仅非嵌入模式显示) */}
      {!embedded && (
        <div className="relative z-10 px-4 py-2.5 w-full bg-white/70 backdrop-blur-md border-t border-slate-200/60 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span className="truncate max-w-[60%] font-medium text-slate-700">
            {displayModel}
          </span>
          <span className="text-indigo-600 font-semibold shrink-0">
            {task.size || (isVideo ? '16:9' : '3:4')}
          </span>
        </div>
      )}

    </div>
  );
}
