import React, { useState } from 'react';
import { Sparkles, Maximize2, Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { GPT_IMAGE_2_GENERATED_ITEMS } from '../data/gptImageGeneratedItems';
import type { InspirationItem, InspirationUseOptions } from './inspiration/InspirationModal';

interface Props {
  onSelect: (item: InspirationItem) => void;
  onUsePrompt: (prompt: string, refMedia?: string, opts?: InspirationUseOptions) => void;
}

export default function GeneratedArtShowcase({ onSelect, onUsePrompt }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <section className="w-full bg-gradient-to-b from-white/90 via-white/60 to-transparent backdrop-blur-md rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs transition-all">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3.5 select-none">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-sm shadow-amber-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-800 tracking-tight">
                GPT-Image-2 旗舰画作展台
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/70">
                5 张新作品已入库
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                3:4 比例 · 超清
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              由程序中 gpt-image-2 接口生成，包含商业海报、萌宠特写、食谱与科普百科
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          {isCollapsed ? (
            <>
              展开展台 <ChevronDown className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              收起 <ChevronUp className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {/* 画作展示区域 */}
      {!isCollapsed && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5 pt-1">
          {GPT_IMAGE_2_GENERATED_ITEMS.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              className="group relative flex flex-col bg-white rounded-xl border border-slate-200/70 overflow-hidden shadow-2xs hover:shadow-xl hover:border-amber-300/80 -translate-y-0 hover:-translate-y-1.5 transition-all duration-300 cursor-pointer"
            >
              {/* 3:4 比例图片容器 */}
              <div className="relative w-full aspect-[3/4] overflow-hidden bg-slate-100">
                <img
                  src={item.image}
                  alt={item.title}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />

                {/* 悬停微渐变遮罩 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 text-white">
                  <p className="text-[11px] line-clamp-2 text-slate-200 leading-snug mb-2 font-normal">
                    {item.prompt}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUsePrompt(item.prompt);
                      }}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1 transition-colors shadow-sm"
                    >
                      <Wand2 className="w-3 h-3" /> 使用词
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(item);
                      }}
                      className="p-1.5 rounded-lg bg-white/25 hover:bg-white/40 text-white transition-colors"
                      title="查看高清大图"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 顶角角标 */}
                <div className="absolute top-2 left-2 flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-black/60 backdrop-blur-md text-white border border-white/20">
                    #{idx + 1}
                  </span>
                </div>
                <div className="absolute top-2 right-2">
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/90 text-slate-950 shadow-sm">
                    GPT-Image-2
                  </span>
                </div>
              </div>

              {/* 底部信息 */}
              <div className="p-2.5 flex flex-col justify-between flex-1 bg-white">
                <h3 className="text-xs font-semibold text-slate-800 line-clamp-1 group-hover:text-amber-700 transition-colors">
                  {item.title}
                </h3>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="truncate max-w-[110px] font-medium text-slate-500">
                    {item.tag.split('·')[0].trim()}
                  </span>
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded font-mono font-medium">
                    3:4
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
