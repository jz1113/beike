import React, { useState } from 'react';
import { Check, Info, Brain, ExternalLink } from 'lucide-react';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import {
  reasoningCapability,
  normalizeReasoningEffort,
  type ReasoningEffort,
} from '@shared/domain/assistant/reasoning';
import type { PromptComposerPreferences } from '../../promptBarPreferencesTypes';
import type { PreferenceModelItem } from '../../hooks/usePromptBarWorkflowModels';

const EFFORT_META: Record<
  string,
  { label: string; desc: string }
> = {
  low: {
    label: '低 (极速)',
    desc: '极速思考：分配轻量思考预算，响应迅速，适合轻量问答与快速修改',
  },
  medium: {
    label: '中 (均衡)',
    desc: '均衡推演：权衡推理深度与生成速度，适合提示词构思与结构规划',
  },
  high: {
    label: '高 (深度)',
    desc: '深度思考：投入更多推理步骤，适合多约束条件与高精度指令分析',
  },
  xhigh: {
    label: '极高',
    desc: '最大算力：启用模型最高思考预算，适合长链路复杂逻辑深度严密论证',
  },
};

interface Props {
  prefs: PromptComposerPreferences;
  models: PreferenceModelItem[];
  updateReasoningPrefs: (patch: Partial<PromptComposerPreferences['reasoning']>) => void;
  onOpenSettings?: () => void;
}

export function PromptBarReasoningTab({
  prefs,
  models,
  updateReasoningPrefs,
  onOpenSettings,
}: Props) {
  const currentModelId = prefs.reasoning.modelId || models[0]?.id || 'deepseek-v4-flash';
  const capability = reasoningCapability(currentModelId);
  const supportedLevels = capability.levels;
  const currentEffort = normalizeReasoningEffort(currentModelId, prefs.reasoning.reasoningEffort);

  const [hoveredEffort, setHoveredEffort] = useState<ReasoningEffort | null>(null);
  const activeEffort = hoveredEffort || currentEffort;
  const effortInfo = EFFORT_META[activeEffort] || EFFORT_META.medium;

  return (
    <div className="grid grid-cols-12 gap-6 pt-1">
      {/* 左侧推理模型选择 */}
      <div className="col-span-6 border-r border-slate-100 pr-5 flex flex-col justify-between">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium pb-1">
            <span>多模态与推理模型</span>
            <span className="text-[11px] text-slate-400">已配置 {models.length} 个模型</span>
          </div>
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
            {models.map((item) => {
              const isSelected = currentModelId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    const nextEffort = normalizeReasoningEffort(item.id, prefs.reasoning.reasoningEffort);
                    updateReasoningPrefs({ modelId: item.id, reasoningEffort: nextEffort });
                  }}
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
                        <ModelIcon modelId={item.id} className="w-3.5 h-3.5 rounded-xs" />
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
            <span>需要配置更多 API 服务或渠道？</span>
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

      {/* 右侧参数与模式 */}
      <div className="col-span-6 space-y-4 pl-1">
        {/* 推理思考强度 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Brain className="w-3.5 h-3.5 text-slate-600" />
              <span>思考强度 (Reasoning Effort)</span>
            </div>
            <span className="text-[11px] text-slate-400">
              {supportedLevels.length > 0 ? `支持 ${supportedLevels.length} 档思考` : '模型默认'}
            </span>
          </div>

          {supportedLevels.length > 0 ? (
            <>
              <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-2xl">
                {supportedLevels.map((lvl) => {
                  const isSelected = currentEffort === lvl;
                  const meta = EFFORT_META[lvl] || { label: lvl, desc: '' };
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onMouseEnter={() => setHoveredEffort(lvl)}
                      onMouseLeave={() => setHoveredEffort(null)}
                      onClick={() => updateReasoningPrefs({ reasoningEffort: lvl })}
                      className={`flex-1 py-1.5 px-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-0.5 ${
                        isSelected
                          ? 'bg-white text-slate-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* 说明面板 */}
              <div className="p-2.5 bg-slate-50/90 rounded-xl border border-slate-100 text-[11px] text-slate-500 leading-relaxed space-y-1">
                <div>{effortInfo.desc}</div>
                <div className="text-[10px] text-slate-400">{capability.description}</div>
              </div>
            </>
          ) : (
            <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-100 space-y-1.5">
              <div className="text-xs font-semibold text-slate-700">
                由模型自动分配思考预算
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {capability.description || '当前模型使用默认思考参数与采样温度。'}
              </p>
            </div>
          )}
        </div>

        {/* 生成模式 */}
        <div className="space-y-1.5 pt-2">
          <div className="text-xs text-slate-500 font-medium">生成模式</div>
          <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl">
            {/* 正常模式 */}
            <div className="relative group/normal flex-1">
              <button
                type="button"
                onClick={() => updateReasoningPrefs({ generationMode: 'normal' })}
                className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  prefs.reasoning.generationMode === 'normal'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>正常模式</span>
                <Info className="w-3 h-3 opacity-50" />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/normal:flex flex-col items-center z-50 pointer-events-none">
                <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-xl shadow-xl whitespace-nowrap">
                  生成前会打断确认，适合需要核对参数和消耗的场景
                </div>
                <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
              </div>
            </div>

            {/* 自动模式 */}
            <div className="relative group/auto flex-1">
              <button
                type="button"
                onClick={() => updateReasoningPrefs({ generationMode: 'auto' })}
                className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  prefs.reasoning.generationMode === 'auto'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>自动模式</span>
                <Info className="w-3 h-3 opacity-50" />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/auto:flex flex-col items-center z-50 pointer-events-none">
                <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-xl shadow-xl whitespace-nowrap">
                  全程无打断，由 Agent 链式自主执行并直出结果
                </div>
                <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
