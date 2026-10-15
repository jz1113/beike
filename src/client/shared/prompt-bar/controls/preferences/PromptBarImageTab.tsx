import React from 'react';
import { Check } from 'lucide-react';
import type {
  ImageAspectOption,
  ImageResolutionOption,
  ImageInferenceStrength,
  PromptComposerPreferences,
} from '../../promptBarPreferencesTypes';

const IMAGE_MODELS = [
  {
    id: 'recraft-v3',
    name: 'Recraft V3',
    desc: '矢量设计与高质感商用生图，设计表现极佳',
    isDiamond: true,
    isNew: true,
  },
  {
    id: 'smart-image-2.5-fast',
    name: '智能图片V2.5 Fast',
    desc: '高速高质量图片生成，image 2.5水准',
    isDiamond: true,
    isNew: true,
  },
  {
    id: 'smart-image-2',
    name: '智能图片V2',
    desc: '高质量生成与编辑，image 2水准',
    isDiamond: true,
    isNew: true,
  },
  {
    id: 'flagship-v2-pro',
    name: '旗舰生图模型 V2-Pro',
    desc: '商业摄影级超写实质感与顶级光影',
    isDiamond: true,
  },
];

interface Props {
  prefs: PromptComposerPreferences;
  updateImagePrefs: (patch: Partial<PromptComposerPreferences['image']>) => void;
}

export function PromptBarImageTab({ prefs, updateImagePrefs }: Props) {
  return (
    <div className="grid grid-cols-12 gap-6 pt-1">
      {/* 左侧生图模型选择 */}
      <div className="col-span-6 border-r border-slate-100 pr-5 space-y-2">
        <div className="text-xs text-slate-400 font-medium pb-1">模型选择</div>
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
          {IMAGE_MODELS.map((item) => {
            const isSelected = prefs.image.modelId === item.id;
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
                  <div className="flex items-center gap-1.5">
                    {isSelected ? (
                      <Check className="w-4 h-4 text-slate-900 stroke-[2.5]" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1 mr-1" />
                    )}
                    <span className="text-xs font-semibold text-slate-900">
                      {item.name}
                    </span>
                    {item.isDiamond && (
                      <span className="text-purple-600 text-xs">💎</span>
                    )}
                    {item.isNew && (
                      <span className="px-1.5 py-0.2 text-[9.5px] rounded bg-slate-950 text-white font-bold">
                        NEW
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

      {/* 右侧生图参数 */}
      <div className="col-span-6 space-y-4 pl-1">
        {/* 画面比例 */}
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500 font-medium">画面比例</div>
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl overflow-x-auto scrollbar-none">
            {(['21:9', '9:16', '4:3', '3:4', '1:1'] as ImageAspectOption[]).map((r) => {
              const isSelected = prefs.image.aspect === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => updateImagePrefs({ aspect: r })}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="text-[10px] opacity-60">
                    {r === '1:1' ? '▢' : r === '9:16' ? '▯' : r === '3:4' ? '▯' : '▭'}
                  </span>
                  <span>{r}</span>
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
                  <span className="text-purple-600 text-[10px]">💎</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 推理强度 */}
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500 font-medium">推理强度</div>
          <div className="text-[11px] text-slate-400">选择模型的推理强度</div>
          <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-2xl mt-1">
            {(['low', 'medium', 'high', 'xhigh', 'max'] as ImageInferenceStrength[]).map((st) => {
              const isSelected = prefs.image.inferenceStrength === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => updateImagePrefs({ inferenceStrength: st })}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
