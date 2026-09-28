import React from 'react';
import PromptActionBar from '@client/shared/prompt-bar';
import { CanvasRecentProjects } from './CanvasRecentProjects';

interface CanvasHomeFeedProps {
  onEnterCanvas?: (projectId: string) => void;
}

export const CanvasHomeFeed: React.FC<CanvasHomeFeedProps> = ({ onEnterCanvas }) => {
  return (
    <div className="flex-1 w-full min-w-0 overflow-y-auto px-4 sm:px-6 lg:px-8 2xl:px-12 pt-6 pb-20 select-none bg-transparent">
      {/* 🌟 1. 顶部大标题 */}
      <div className="pt-6 sm:pt-10 pb-6 text-center max-w-4xl mx-auto">
        <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-black text-slate-900 tracking-tight">
          今天想在无限画布创作什么？
        </h1>
      </div>

      {/* 🌟 2. 主输入框区域 */}
      <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto pb-10 relative z-20">
        <PromptActionBar />
      </div>

      {/* 🌟 3. 最近项目模块 */}
      <div className="w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto pt-4">
        <CanvasRecentProjects onEnterCanvas={onEnterCanvas} />
      </div>
    </div>
  );
};

export default CanvasHomeFeed;
