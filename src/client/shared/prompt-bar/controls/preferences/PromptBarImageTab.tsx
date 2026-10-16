import React, { useState } from 'react';
import { Check, Info, Sparkles, ExternalLink } from 'lucide-react';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import type {
  ImageAspectOption,
  ImageResolutionOption,
  ImageInferenceStrength,
  PromptComposerPreferences,
} from '../../promptBarPreferencesTypes';
import type { PreferenceModelItem } from '../../hooks/usePromptBarWorkflowModels';

const INFERENCE_STRENGTH_META: Record<
  ImageInferenceStrength,
  { label: string; desc: string; badge?: string }
> = {
  low: {
    label: '低 (极速)',
    desc: '极速出图：轻量算力开销，适合快速验证灵感与画面构图',
  },
  medium: {
    label: '中 (均衡)',
    desc: '均衡推荐：兼顾画面质感与生成速度，适合多数日常创作',
  },
  high: {
    label: '高 (精修)',
    desc: '高清精修：增强细节纹理与主体结构，画面清晰层次分明',
  },
  xhigh: {
    label: '极高',
    desc: '复杂细节：强化复杂光影透视与多主体细节深度渲染',
  },
  max: {
    label: 'Max 旗舰',
    desc: '旗舰质感：投入最大算力，打造商业摄影与工艺级材质质感',
    badge: '💎',
  },
};

interface Props {
  prefs: PromptComposerPreferences;
  models: PreferenceModelItem[];
  updateImagePrefs: (patch: Partial<PromptComposerPreferences['image']>) => void;
  onOpenSettings?: () => void;
}

export function PromptBarImageTab({
  prefs,
  models,
  updateImagePrefs,
  onOpenSettings,
}: Props) {
  const currentModelId = prefs.image.modelId || 'smart';
  const [hoveredStrength, setHoveredStrength] = useState<ImageInferenceStrength | null>(null);

  const activeStrength = hoveredStrength || prefs.image.inferenceStrength || 'low';
  const strengthInfo = INFERENCE_STRENGTH_META[activeStrength] || INFERENCE_STRENGTH_META.low;

  return (
    <div className="grid grid-cols-12 gap-6 pt-1">
      {/* 左侧生图模型选择 */}
      <div className="col-span-6 border-r border-slate-100 pr-5 flex flex-col justify-between">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium pb-1">
            <span>模型选择</span>
            <span className="text-[11px] text-slate-400">已配置 {models.length} 个模型</span>
          </div>
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
            {models.map((item) => {
              const isSelected = currentModelId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => updateImagePrefs({ modelId: item.id })}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-slate-300 bg-slate-50/90 shadow-2xs'
                      : 'border-transparent hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-slate-900 stroke-[2.5]" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1 mr-1" />
                      )}
                      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                        {item.id === 'smart' ? (
                          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        ) : (
                          <ModelIcon modelId={item.id} className="w-3.5 h-3.5 rounded-xs" />
                        )}
                      </div>
                      <span className="text-xs font-semibold text-slate-900">
                        {item.name}
                      </span>
                      {item.isDiamond && (
                        <span className="text-purple-600 text-xs">💎</span>
                      )}
                      {item.isNew && (
                        <span className="px-1.5 py-0.2 text-[9px] rounded bg-slate-950 text-white font-bold">
                          NEW
                        </span>
                      )}
                      {item.tag && (
                        <span className="px-1.5 py-0.2 text-[9px] rounded bg-slate-200/80 text-slate-600 font-medium">
                          {item.tag}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-1 pl-5">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 底部设置入口 */}
        {onOpenSettings && (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>需要更多商用绘图模型？</span>
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-slate-700 hover:text-slate-950 font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>管理模型配置</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* 右侧生图参数 */}
      <div className="col-span-6 space-y-4 pl-1">
        {/* 画面比例 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
            <span>画面比例</span>
            <div className="relative group/ratio inline-flex items-center">
              <Info className="w-3 h-3 text-slate-400 cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover/ratio:flex flex-col items-center z-50 pointer-events-none">
                <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-xl shadow-xl whitespace-nowrap">
                  视频偏好和图片偏好会共用同一个画面比例
                </div>
                <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl overflow-x-auto scrollbar-none">
            {(['21:9', '16:9', '4:3', '3:4', '1:1', '9:16'] as ImageAspectOption[]).map((r) => {
              const isSelected = prefs.image.aspect === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => updateImagePrefs({ aspect: r })}
                  className={`flex-1 min-w-[42px] py-1.5 px-1.5 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="text-[10px] opacity-60">
                    {r === '1:1' ? '◻' : r === '9:16' ? '▯' : r === '3:4' ? '▯' : r === '4:3' ? '▢' : r === '21:9' ? '━' : '▭'}
                  </span>
                  <span className="text-[11px]">{r}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 图片分辨率 */}
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500 font-medium">图片分辨率</div>
          <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl">
            {(['1K', '2K', '4K'] as ImageResolutionOption[]).map((res) => {
              const isSelected = prefs.image.resolution === res;
              return (
                <button
                  key={res}
                  type="button"
                  onClick={() => updateImagePrefs({ resolution: res })}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{res}</span>
                  {res !== '1K' && <span className="text-purple-600 text-[10px]">💎</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 推理强度 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <div className="flex items-center gap-1 text-slate-500">
              <span>推理强度</span>
              <div className="relative group/strengthInfo inline-flex items-center">
                <Info className="w-3 h-3 text-slate-400 cursor-help" />
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover/strengthInfo:flex flex-col items-center z-50 pointer-events-none">
                  <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-xl shadow-xl whitespace-nowrap">
                    调高推理强度会增加画面精修步数与细节丰富度
                  </div>
                  <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
                </div>
              </div>
            </div>
            <span className="text-[11px] text-slate-400">选择生图细节与算力档位</span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-2xl">
            {(['low', 'medium', 'high', 'xhigh', 'max'] as ImageInferenceStrength[]).map((st) => {
              const isSelected = prefs.image.inferenceStrength === st;
              const meta = INFERENCE_STRENGTH_META[st];
              return (
                <button
                  key={st}
                  type="button"
                  onMouseEnter={() => setHoveredStrength(st)}
                  onMouseLeave={() => setHoveredStrength(null)}
                  onClick={() => updateImagePrefs({ inferenceStrength: st })}
                  className={`flex-1 py-1.5 px-1 rounded-xl text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-0.5 ${
                    isSelected
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{meta.label}</span>
                  {meta.badge && <span className="text-purple-600 text-[9px]">{meta.badge}</span>}
                </button>
              );
            })}
          </div>

          {/* 强度说明面板 */}
          <div className="p-2.5 bg-slate-50/90 rounded-xl border border-slate-100 text-[11px] text-slate-500 leading-relaxed transition-all">
            {strengthInfo.desc}
          </div>
        </div>
      </div>
    </div>
  );
}
