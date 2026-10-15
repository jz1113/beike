import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@client/shared/i18n';

interface PromptOptimizeButtonProps {
  prompt: string;
  onOptimized: (optimizedPrompt: string) => void;
  onShowToast?: (msg: string) => void;
}

export default function PromptOptimizeButton({
  prompt,
  onOptimized,
  onShowToast,
}: PromptOptimizeButtonProps) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleOptimize = async () => {
    const raw = prompt.trim();
    if (!raw) {
      onShowToast?.('请先输入简要想法或需求，助手帮你一键优化提示词');
      return;
    }

    setIsOptimizing(true);
    try {
      // 智能扩写增强规则：加入景深、顶级材质、光影氛围与电影构图
      await new Promise((r) => setTimeout(r, 600)); // 轻微反馈动效
      let enhanced = raw;
      if (!enhanced.includes('超高清') && !enhanced.includes('8k') && !enhanced.includes('电影级')) {
        enhanced = `${raw}，电影级景深，大师级光影氛围，顶级材质与细腻纹理，超高清8k，极具视觉冲击力与艺术美感`;
      } else {
        enhanced = `${raw}，柔和全局漫反射光线，精致轮廓光，自然光影折射，真实细节质感呈现`;
      }
      onOptimized(enhanced);
      onShowToast?.('提示词已优化扩写完成');
    } catch {
      onShowToast?.('优化失败，请稍后重试');
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        onClick={handleOptimize}
        disabled={isOptimizing}
        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200/90 text-slate-700 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 disabled:opacity-60"
        title={t('promptBar.optimize')}
        aria-label={t('promptBar.optimize')}
      >
        {isOptimizing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-800" />
        ) : (
          <div className="relative flex items-center justify-center">
            {/* 图12同款：三条横线 + 右上角微火花 */}
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="7" x2="16" y2="7" />
              <line x1="4" y1="12" x2="13" y2="12" />
              <line x1="4" y1="17" x2="10" y2="17" />
              <path d="M19 11l.5 1.5L21 13l-1.5.5L19 15l-.5-1.5L17 13l1.5-.5z" fill="currentColor" />
            </svg>
          </div>
        )}
      </button>

      {/* 🌟 图12同款黑色椭圆胶囊 Tooltip */}
      {isHovered && (
        <div className="absolute right-full mr-2 px-2.5 py-1 rounded-full bg-black text-white text-[11px] font-medium tracking-tight shadow-lg whitespace-nowrap animate-fade-in pointer-events-none z-30">
          一键优化提示词
        </div>
      )}
    </div>
  );
}
