'use client';
import { ShotPrompt } from '@/lib/vision';
import { proxyMediaUrl } from '@/lib/apiClient';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import {
  Check,
  Copy,
  RotateCw,
  Sparkles,
  Trash2,
} from 'lucide-react';

export interface PromptStudioShotListProps {
  generatedPrompts: ShotPrompt[];
  workshopMode: string;
  selectedClonedList: { url: string }[];
  effectiveImages: { url: string }[];
  anchorFaceImageUrl: string | null;
  copiedIndex: number | null;
  toggleShotSelection: (idx: number) => void;
  updateShotPrompt: (idx: number, patch: Partial<ShotPrompt>) => void;
  deleteShotPrompt: (idx: number) => void;
  handleCopy: (text: string, index: number) => void;
  handleRerollSingleShot: (index: number) => void;
  handlePolishSingleShot: (index: number) => void;
}

export default function PromptStudioShotList({
  generatedPrompts,
  workshopMode,
  selectedClonedList,
  effectiveImages,
  anchorFaceImageUrl,
  copiedIndex,
  toggleShotSelection,
  updateShotPrompt,
  deleteShotPrompt,
  handleCopy,
  handleRerollSingleShot,
  handlePolishSingleShot,
}: PromptStudioShotListProps) {
  return (
<div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
  {generatedPrompts.map((shot, idx) => {
    const isSelected = shot.selected !== false;
    return (
      <div
        key={idx}
        className={`rounded-3xl border bg-white p-4 sm:p-5 space-y-3 transition-all shadow-xs ${
          isSelected 
            ? 'border-indigo-200 ring-2 ring-indigo-500/10 hover:shadow-md' 
            : 'border-slate-200 opacity-60'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleShotSelection(idx)}
              className="rounded accent-indigo-600 cursor-pointer w-4 h-4 shrink-0"
            />
            <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100 shrink-0">
              SHOT {shot.shot_no || idx + 1}
            </span>
            
            {/* 智能主体微胶囊 */}
            {shot.has_human === false ? (
              <button
                type="button"
                onClick={() => updateShotPrompt(idx, { has_human: true, shot_type: 'model_shot' })}
                className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                title="点击切换为模特出镜模式"
              >
                <span>📦 纯静物</span>
              </button>
            ) : shot.shot_type === 'hand_held_only' ? (
              <button
                type="button"
                onClick={() => updateShotPrompt(idx, { has_human: false, shot_type: 'pure_product' })}
                className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-200 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                title="点击切换为纯静物模式"
              >
                <span>🖐️ 局部手持</span>
              </button>
            ) : anchorFaceImageUrl ? (
              <button
                type="button"
                onClick={() => updateShotPrompt(idx, { has_human: false, shot_type: 'pure_product' })}
                className="px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold border border-indigo-200 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                title="点击切换为纯静物模式"
              >
                <span>👑 专属模特</span>
              </button>
            ) : idx === 0 ? (
              <button
                type="button"
                onClick={() => updateShotPrompt(idx, { has_human: false, shot_type: 'pure_product' })}
                className="px-2 py-0.5 rounded-md bg-pink-100 hover:bg-pink-200 text-pink-700 text-[10px] font-bold border border-pink-200 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                title="点击切换为纯静物模式"
              >
                <span>🎯 定脸首图</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => updateShotPrompt(idx, { has_human: false, shot_type: 'pure_product' })}
                className="px-2 py-0.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10px] font-bold border border-purple-200 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                title="点击切换为纯静物模式"
              >
                <span>🔒 继承首图</span>
              </button>
            )}

            <input
              type="text"
              value={shot.title || `分镜 ${idx + 1}`}
              onChange={e => updateShotPrompt(idx, { title: e.target.value })}
              placeholder={`分镜 ${idx + 1}`}
              className="text-xs font-bold text-slate-800 bg-transparent hover:text-indigo-600 focus:text-indigo-600 outline-none truncate flex-1 min-w-0"
            />
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              onClick={() => handleCopy(shot.prompt, idx)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="复制分镜提示词"
            >
              {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => deleteShotPrompt(idx)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="删除此分镜"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {workshopMode !== 'social_face_product_swap' && (shot.expression || shot.action || shot.angle) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {shot.expression ? (
              <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-100">
                表情 · {shot.expression}
              </span>
            ) : null}
            {shot.action ? (
              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-100">
                动作 · {shot.action}
              </span>
            ) : null}
            {shot.angle || shot.camera_focal_length ? (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                机位 · {[shot.camera_focal_length, shot.angle].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </div>
        )}

        {/* 🌟 本镜实物商品图精准绑定选择器 (精准指定当前分镜使用的正面/背面/侧面/细节实物图) */}
        {effectiveImages.length > 0 && (() => {
          const defaultUrl = effectiveImages[idx % effectiveImages.length]?.url || effectiveImages[0]?.url;
          const currentShotImgUrl = shot.productImageUrl || defaultUrl;
          const activeImgIndex = effectiveImages.findIndex(img => img.url === currentShotImgUrl);
          const effectiveIndex = activeImgIndex >= 0 ? activeImgIndex : (idx % effectiveImages.length);
          const activeImgItem = effectiveImages[effectiveIndex] || effectiveImages[0];

          // 视角标签
          const isBackShot = /背壳|背面|后背|背部|后侧|背面装甲/i.test((shot.title || '') + ' ' + (shot.scene || ''));
          const isSideShot = /45度|斜侧|侧面|侧视|俯角|侧方/i.test((shot.title || '') + ' ' + (shot.scene || ''));
          const angleLabel = isBackShot ? '背面视角' : isSideShot ? '45°斜侧视角' : effectiveIndex === 0 ? '正面主图视角' : `底图视角 #${effectiveIndex + 1}`;

          return (
            <div className="flex items-center justify-between gap-2 p-2 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-[11px]">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={normalizeImageUrlToStandardJpg(activeImgItem.url)}
                  alt="本镜商品实物图"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.dataset.hasRetried && activeImgItem.url) {
                      target.dataset.hasRetried = 'true';
                      target.src = proxyMediaUrl(activeImgItem.url);
                    }
                  }}
                  className="w-8 h-8 rounded-lg object-cover bg-white border border-indigo-200 flex-shrink-0 shadow-2xs"
                />
                <div className="min-w-0">
                  <span className="font-bold text-indigo-950 flex items-center gap-1.5 truncate">
                    <span>🎯 本镜实物垫图:</span>
                    <span className="text-indigo-700 font-bold bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-[10px]">
                      底图 #{effectiveIndex + 1} · {angleLabel}
                    </span>
                  </span>
                </div>
              </div>

              {/* 快速选择商品图片切换按钮组 (仅展示用户勾选的 1~N 张底图) */}
              {effectiveImages.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto max-w-[240px] scrollbar-none flex-shrink-0">
                  <span className="text-[10px] text-slate-500 font-medium">指定:</span>
                  {effectiveImages.map((imgItem, imgIdx) => {
                    const isCur = imgItem.url === activeImgItem.url;
                    return (
                      <button
                        key={imgIdx}
                        type="button"
                        onClick={() => updateShotPrompt(idx, { productImageUrl: imgItem.url })}
                        className={`relative w-7 h-7 rounded-lg overflow-hidden border transition-all cursor-pointer flex-shrink-0 ${
                          isCur 
                            ? 'ring-2 ring-indigo-600 border-indigo-600 scale-105 shadow-xs' 
                            : 'opacity-50 hover:opacity-100 border-slate-300 hover:border-indigo-400'
                        }`}
                        title={`点击将分镜 ${idx + 1} 绑定为勾选的素材底图 #${imgIdx + 1}`}
                      >
                        <img src={imgItem.url} alt="" className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 right-0 bg-slate-900/80 text-white text-[8px] font-bold px-0.5 rounded-tl leading-none">
                          #{imgIdx + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Social Reference Thumbnail for this shot (only when in clone mode) */}
        {workshopMode === 'social_face_product_swap' && selectedClonedList[idx] && (
          <div className="flex items-center gap-2.5 p-2 rounded-2xl bg-pink-50/60 border border-pink-100">
            <img
              src={normalizeImageUrlToStandardJpg(selectedClonedList[idx].url)}
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.currentTarget;
                const u = selectedClonedList[idx].url;
                if (!target.dataset.hasRetried && u) {
                  target.dataset.hasRetried = 'true';
                  target.src = proxyMediaUrl(u);
                }
              }}
              className="w-10 h-10 rounded-xl object-cover bg-white border border-pink-200 flex-shrink-0"
            />
            <div className="text-[11px] text-pink-900 leading-tight">
              <span className="font-bold">📸 对标社媒参考图 #{idx + 1}：</span>
              <span className="text-pink-700">
                {shot.has_human === false 
                  ? '继承构图与光影，替换为目标商品'
                  : shot.shot_type === 'hand_held_only'
                  ? '继承持物动线，替换为目标商品'
                  : '继承机位与姿态，替换为新模特与目标商品'}
              </span>
            </div>
          </div>
        )}

        {/* Prompt Textarea */}
        <textarea
          value={shot.prompt}
          onChange={e => updateShotPrompt(idx, { prompt: e.target.value })}
          rows={4}
          placeholder="请输入此分镜的 AI 提示词..."
          className="w-full p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/80 text-slate-800 text-xs leading-relaxed outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-mono resize-y shadow-2xs"
        />

        {/* 🌟 单分镜快捷操作栏 (独立换视角 / 智能润色 / 字符统计) */}
        <div className="flex items-center justify-between pt-0.5 text-[11px]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleRerollSingleShot(idx)}
              className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 font-semibold border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
              title="换个视角与机位重构此分镜"
            >
              <RotateCw className="w-3 h-3 text-indigo-500" />
              <span>换视角</span>
            </button>
            <button
              type="button"
              onClick={() => handlePolishSingleShot(idx)}
              className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 font-semibold border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
              title="增强光影细节与8K写实感"
            >
              <Sparkles className="w-3 h-3 text-emerald-500" />
              <span>智能润色</span>
            </button>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {shot.prompt?.length || 0} 字符
          </span>
        </div>
      </div>
    );
  })}
</div>
  );
}
