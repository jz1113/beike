'use client';
import { Layers, Sparkles } from 'lucide-react';

export interface PromptStudioEmptyPreviewProps {
  workshopMode: string;
  clonedSocialImages: { selected?: boolean; url: string }[];
  shotCount: number;
  customRecipes: any[];
  selectedStyleId: string;
  product: { title?: string } | null;
}

export default function PromptStudioEmptyPreview({
  workshopMode,
  clonedSocialImages,
  shotCount,
  customRecipes,
  selectedStyleId,
  product,
}: PromptStudioEmptyPreviewProps) {
  return (
<div className="space-y-6 pb-20 max-w-5xl mx-auto animate-fade-in">
  {/* 1. 顶部引导看板 (统一主行动点) */}
  {(() => {
    const selectedClonedList = clonedSocialImages.filter(i => i.selected);
    const currentDisplayShotCount = workshopMode === 'social_face_product_swap' && selectedClonedList.length > 0
      ? selectedClonedList.length
      : shotCount;

    const activeCustomRecipe = customRecipes.find(r => r.id === selectedStyleId);
    const isCustomActive = Boolean(activeCustomRecipe) && workshopMode !== 'social_face_product_swap';

    return (
      <>
        <div className="p-6 sm:p-7 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100/80 shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{workshopMode === 'social_face_product_swap' ? '爆款复刻 · 多模态视觉引擎' : '原创多模态 · AI 视觉总监'}</span>
                </span>
                {isCustomActive && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 text-[11px] font-bold border border-pink-200">
                    🎨 已挂载：{activeCustomRecipe.name}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                  ● 实物材质与光影100%保真
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {workshopMode === 'social_face_product_swap'
                  ? `爆款复刻：对标 ${currentDisplayShotCount} 组社媒机位，克隆目标实物与模特`
                  : isCustomActive
                  ? `遵循【${activeCustomRecipe.name.replace(/^[✨\s]+/, '')}】生成 ${currentDisplayShotCount} 组分镜提示词`
                  : `将生成 ${currentDisplayShotCount} 组分镜提示词（同人同景同穿搭，组内差异化）`}
              </h3>
              <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                {workshopMode === 'social_face_product_swap'
                  ? `大模型将逐镜头提取参考图中的景深透视，将目标商品【${product?.title || '目标实物'}】以自然光影融入，保持全套分镜视觉连贯。`
                  : `分析后由当前架构与组级锁动态策划分镜；各镜表情、动作、机位将拉开差异，商品外观由垫图控形。`}
              </p>
            </div>

            <p className="text-xs text-slate-500 font-medium shrink-0 md:text-right">
              使用左侧「开始分析」生成提示词
            </p>
          </div>

          {/* 镜头机位预期蓝图 */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  {workshopMode === 'social_face_product_swap'
                    ? `预计对标分镜 (共 ${currentDisplayShotCount} 个镜头)`
                    : `待分析分镜占位 (共 ${currentDisplayShotCount} 镜)`}
                </span>
              </span>
              <span className="text-[11px] text-slate-400 font-normal">
                在左侧点击「开始分析」即可自动策划分镜提示词
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {Array.from({ length: currentDisplayShotCount }).map((_, sIdx) => {
                const refImg = selectedClonedList[sIdx];

                return (
                  <div
                    key={sIdx}
                    className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-indigo-200 hover:shadow-xs transition-all space-y-2 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-mono font-bold border border-indigo-100">
                          SHOT {sIdx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {workshopMode === 'social_face_product_swap'
                            ? `参考机位 #${sIdx + 1}`
                            : `分镜 ${sIdx + 1}`}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                        <Sparkles className="w-3 h-3 text-indigo-400" />
                        <span>待分析</span>
                      </span>
                    </div>

                    {workshopMode === 'social_face_product_swap' && refImg ? (
                      <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white border border-pink-100 shadow-2xs">
                        <img
                          src={refImg.url}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0 flex-1 text-[11px] text-slate-600 truncate">
                          对标参考图 #{sIdx + 1} · 替换为【{product?.title || '目标实物'}】
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 leading-snug">
                        分析后由架构与组级锁生成；本镜表情/动作/机位将与其他镜拉开。
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </>
    );
  })()}
</div>
  );
}
