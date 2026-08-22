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
        className="w-13 h-13 sm:w-14 sm:h-14 flex items-center justify-center cursor-pointer group relative p-0 transition-all duration-300 hover:scale-110 active:scale-95 focus:outline-none"
        title="打开贝壳云图 AI 助手"
      >
        {/* 🌟 纯粹红云贝壳 Logo 原生悬浮展示，色彩纯净无杂质 */}
        <div className="relative w-full h-full flex items-center justify-center">
          <img 
            src="/app_logo.png" 
            alt="贝壳云图 AI 助手" 
            draggable={false}
            className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.14)] group-hover:drop-shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition-all duration-300"
          />
        </div>

        {/* 顶部悬停微气泡提示 */}
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-bold tracking-wide shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-slate-700/50 flex items-center gap-1">
          <span>AI 助手</span>
        </div>
      </button>
    </div>
  );
}
