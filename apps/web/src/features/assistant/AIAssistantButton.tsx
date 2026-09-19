import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import { Sparkles } from 'lucide-react';

export default function AIAssistantButton() {
  const { isAssistantOpen, setIsAssistantOpen, currentView } = useAppStore(
    useShallow((s) => ({
      isAssistantOpen: s.isAssistantOpen,
      setIsAssistantOpen: s.setIsAssistantOpen,
      currentView: s.currentView,
    })),
  );

  const [imgError, setImgError] = useState(false);

  if (isAssistantOpen) return null;

  // 当处于对话生图工作区（底部有全宽吸底提示词输入栏与发送按钮）时，智能向上避让
  const isGenerateView = currentView === 'generate';

  return (
    <div 
      className={`fixed right-6 sm:right-8 z-50 select-none transition-all duration-300 ${
        isGenerateView
          ? 'bottom-[calc(var(--prompt-dock-h,11rem)+0.75rem)]'
          : 'bottom-6 sm:bottom-8'
      }`}
    >
      <button
        type="button"
        data-testid="ai-assistant-button"
        onClick={() => setIsAssistantOpen(true)}
        className="w-13 h-13 sm:w-14 sm:h-14 flex items-center justify-center cursor-pointer group relative p-0 transition-all duration-300 hover:scale-110 active:scale-95 focus:outline-none bg-transparent border-0"
        aria-label="打开贝壳云图 AI 助手"
      >
        {/* 🌟 纯粹透明红云贝壳 Logo 原生悬浮展示，无杂质底盘 */}
        <div className="relative w-full h-full flex items-center justify-center">
          {!imgError ? (
            <img 
              src="/app_logo.png" 
              alt="贝壳云图 AI 助手" 
              draggable={false}
              onError={() => setImgError(true)}
              className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(239,68,68,0.25)] group-hover:drop-shadow-[0_8px_24px_rgba(239,68,68,0.45)] transition-all duration-300 group-hover:rotate-6"
            />
          ) : (
            <div 
              data-testid="ai-assistant-fallback-icon"
              className="w-full h-full rounded-full bg-gradient-to-tr from-red-500 via-rose-500 to-orange-400 flex items-center justify-center text-white shadow-lg"
            >
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
          )}
        </div>

      </button>
    </div>
  );
}
