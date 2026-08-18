'use client';
import { useAppStore } from '@/store/useAppStore';

export default function AIAssistantButton() {
  const { isAssistantOpen, setIsAssistantOpen, currentView } = useAppStore();

  if (isAssistantOpen) return null;

  // 当处于对话生图工作区（底部有全宽吸底提示词输入栏与发送按钮）时，智能向上避让
  const isGenerateView = currentView === 'generate';

  return (
    <div 
      className={`fixed right-6 z-40 select-none transition-all duration-300 ${
        isGenerateView ? 'bottom-44' : 'bottom-8'
      }`}
    >
      <button
        onClick={() => setIsAssistantOpen(true)}
        className="w-12 h-12 rounded-full bg-white/95 backdrop-blur-xl flex items-center justify-center shadow-[0_6px_24px_rgba(239,68,68,0.22)] hover:shadow-[0_10px_30px_rgba(239,68,68,0.38)] hover:scale-110 active:scale-95 transition-all duration-300 cursor-pointer group relative border border-red-500/20 p-2"
        title="打开贝壳云图 AI 助手"
      >
        {/* 呼吸微光圈 */}
        <span className="absolute inset-0 rounded-full bg-red-500/15 animate-ping opacity-40 pointer-events-none" />

        {/* 🌟 核心程序 Logo 图标 */}
        <div className="relative w-full h-full flex items-center justify-center">
          <img 
            src="/app_logo.png" 
            alt="贝壳云图 AI 助手" 
            className="w-full h-full object-contain drop-shadow-[0_2px_6px_rgba(239,68,68,0.25)] group-hover:scale-110 transition-all duration-300"
          />
        </div>

        {/* 顶部悬停微气泡（垂直居中向上弹出，绝不遮挡左侧卡片文案） */}
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-bold tracking-wide shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-slate-700/50 flex items-center gap-1">
          <span>AI 助手</span>
        </div>
      </button>
    </div>
  );
}
