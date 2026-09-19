import { handleWindowDrag, handleWindowDoubleClick } from '@/lib/windowDrag';
import { TrueFocus } from '@/shared/ui/TrueFocus';

export default function PromptBarBrandHero() {
  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
      onDoubleClick={handleWindowDoubleClick}
      className="flex flex-col items-center justify-center pt-1 pb-4 sm:pt-2 sm:pb-5 lg:pt-3 lg:pb-5 xl:pt-4 xl:pb-6 select-none animate-fade-in text-center relative cursor-default"
    >
      <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 relative z-10">
        <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-15 md:h-15 lg:w-16 lg:h-16 xl:w-18 xl:h-18 flex items-center justify-center flex-shrink-0">
          <img
            src="/app_logo.png"
            alt="贝壳云图 Logo"
            draggable={false}
            className="w-full h-full object-contain filter drop-shadow-[0_4px_16px_rgba(239,68,68,0.25)] hover:scale-105 transition-transform duration-300"
          />
        </div>

        {/* 🌟 首页主标题 TrueFocus 动画 (严格对齐图 3 设置与高颜值现代艺术字体) */}
        <h1 className="flex items-center">
          <TrueFocus
            sentence="贝壳 云图"
            separator=" "
            manualMode={false}
            blurAmount={4.5}
            borderColor="#ff4627"
            glowColor="rgba(255, 70, 39, 0.6)"
            animationDuration={0.5}
            pauseBetweenAnimations={1}
            style={{
              fontSize: 'clamp(28px, calc(3.9vw * var(--ui-density, 1)), 48px)',
              fontFamily: '"Smiley Sans", "Outfit", "Plus Jakarta Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
              letterSpacing: '-0.02em',
            }}
          />
        </h1>
      </div>
    </div>
  );
}
