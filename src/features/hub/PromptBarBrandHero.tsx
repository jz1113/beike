'use client';
import { Sparkles } from 'lucide-react';

export default function PromptBarBrandHero() {
  return (
        <div className="flex flex-col items-center justify-center pt-8 pb-5 sm:pt-11 sm:pb-7 select-none animate-fade-in text-center relative">
          {/* 顶层精致微胶囊 (极简高定，无杂色无粉斑) */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/[0.04] border border-slate-900/[0.08] text-slate-600 text-[11px] sm:text-xs font-medium tracking-wide mb-3 shadow-2xs hover:bg-slate-900/[0.07] transition-all cursor-default">
            <Sparkles className="w-3.5 h-3.5 text-rose-500" />
            <span className="font-semibold text-slate-700">4K 旗舰多模态视觉智能平台</span>
          </div>

          {/* 主标题与 Logo 标志性品牌组合 */}
          <div className="flex items-center justify-center gap-3.5 sm:gap-4 relative z-10">
            {/* 贝壳 Logo 实体原生融入 */}
            <div className="w-11 h-11 sm:w-13 sm:h-13 flex items-center justify-center flex-shrink-0">
              <img 
                src="/app_logo.png" 
                alt="贝壳云图 Logo" 
                draggable={false}
                className="w-full h-full object-contain filter drop-shadow-[0_4px_16px_rgba(239,68,68,0.22)] hover:scale-105 transition-transform duration-300"
              />
            </div>

            {/* 品牌名称排版：纯粹黑曜石大字，克制有力 */}
            <h1 
              className="select-none antialiased tracking-tight font-black text-slate-900 flex items-center"
              style={{
                fontSize: 'clamp(32px, 3.8vw, 46px)',
                lineHeight: 1.15,
                letterSpacing: '-0.03em',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
                textRendering: 'optimizeLegibility',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale'
              }}
            >
              贝壳云图
            </h1>
          </div>

          {/* 纯净通透副标题 */}
          <p className="mt-2.5 relative z-10 text-xs sm:text-sm text-slate-500 font-medium tracking-wide max-w-xl mx-auto">
            全渠道电商爆款视觉策划 · 4K 超清生图与成套分镜 · 真实手机实拍闭环
          </p>
        </div>
  );
}
