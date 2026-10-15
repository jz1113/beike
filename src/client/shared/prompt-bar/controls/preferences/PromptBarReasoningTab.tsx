import React from 'react';
import { Check, Info } from 'lucide-react';
import type { PromptComposerPreferences } from '../../promptBarPreferencesTypes';

const REASONING_MODELS = [
  {
    id: 'glm-5.1',
    name: 'GLM 5.1',
    desc: '稳定均衡，日常创作快速响应',
    tag: '会员限免',
  },
  {
    id: 'kimi-k3',
    name: 'Kimi K3',
    desc: '深度思考模型，复杂问题从容应对',
    tag: '会员限免',
  },
  {
    id: 'deepseek-v4-flash',
    name: 'Deepseek V4 Flash',
    desc: '极速推理，长文思考能力出色',
    tag: '会员限免',
  },
  {
    id: 'doubao-seed-2.0-pro',
    name: 'Doubao Seed 2.0 Pro',
    desc: '中文理解强，文案生成自然流畅',
    tag: '会员限免',
  },
];

interface Props {
  prefs: PromptComposerPreferences;
  updateReasoningPrefs: (patch: Partial<PromptComposerPreferences['reasoning']>) => void;
}

export function PromptBarReasoningTab({ prefs, updateReasoningPrefs }: Props) {
  return (
    <div className="grid grid-cols-12 gap-6 pt-1">
      {/* 左侧推理模型选择 */}
      <div className="col-span-6 border-r border-slate-100 pr-5 space-y-2">
        <div className="text-xs text-slate-400 font-medium pb-1">模型选择</div>
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
          {REASONING_MODELS.map((item) => {
            const isSelected = prefs.reasoning.modelId === item.id;
            return (
              <div
                key={item.id}
                onClick={() => updateReasoningPrefs({ modelId: item.id })}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-slate-300 bg-slate-50/90 shadow-2xs'
                    : 'border-transparent hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {isSelected ? (
                      <Check className="w-4 h-4 text-slate-900 stroke-[2.5]" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1 mr-1" />
                    )}
                    <span className="text-xs font-semibold text-slate-900">
                      {item.name}
                    </span>
                    {item.tag && (
                      <span className="px-1.5 py-0.2 text-[9.5px] rounded bg-slate-200/80 text-slate-600 font-medium">
                        {item.tag}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-1 pl-4">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右侧生成模式 */}
      <div className="col-span-6 space-y-4 pl-1">
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500 font-medium">生成模式</div>
          <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl">
            <button
              type="button"
              onClick={() => updateReasoningPrefs({ generationMode: 'normal' })}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                prefs.reasoning.generationMode === 'normal'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>正常模式</span>
              <Info className="w-3 h-3 opacity-50" />
            </button>
            <button
              type="button"
              onClick={() => updateReasoningPrefs({ generationMode: 'auto' })}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                prefs.reasoning.generationMode === 'auto'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>自动模式</span>
              <Info className="w-3 h-3 opacity-50" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
