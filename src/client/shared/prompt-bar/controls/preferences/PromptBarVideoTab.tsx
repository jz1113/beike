import React from 'react';
import { Check, Info } from 'lucide-react';
import type {
  VideoAspectOption,
  VideoResolutionOption,
  PromptComposerPreferences,
} from '../../promptBarPreferencesTypes';

const VIDEO_MODELS = [
  {
    id: 'kling-2.6-pro',
    name: 'Kling 2.6 Pro (运动强化版)',
    desc: '运动镜头表现优异，画质超清，微表情逼真生动',
    isDiamond: true,
    isNew: true,
  },
  {
    id: 'smart-video-v3.5',
    name: '智能视频 V3.5',
    desc: '视频生成能力更强，超快生成，高质量水准',
    isDiamond: true,
    isNew: true,
  },
  {
    id: 'smart-video-v3',
    name: '智能视频 V3',
    desc: '高质量视频生成，生成效果稳定',
    isDiamond: true,
    isNew: true,
  },
  {
    id: 'kling-2.5-turbo',
    name: 'Kling 2.5 Turbo 极速版',
    desc: '快速出片利器，兼顾超低等待与高稳定性',
    isDiamond: true,
  },
  {
    id: 'hailuo-v2',
    name: '海螺 MiniMax Video 01',
    desc: '物理动态世界模型，动作真实自然流畅',
    tag: '限免中',
  },
];

interface Props {
  prefs: PromptComposerPreferences;
  updateVideoPrefs: (patch: Partial<PromptComposerPreferences['video']>) => void;
}

export function PromptBarVideoTab({ prefs, updateVideoPrefs }: Props) {
  return (
    <div className="grid grid-cols-12 gap-6 pt-1">
      {/* 左侧模型选择 */}
      <div className="col-span-6 border-r border-slate-100 pr-5 space-y-2">
        <div className="text-xs text-slate-400 font-medium pb-1">模型选择</div>
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
          {VIDEO_MODELS.map((item) => {
            const isSelected = prefs.video.modelId === item.id;
            return (
              <div
                key={item.id}
                onClick={() => updateVideoPrefs({ modelId: item.id })}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-slate-300 bg-slate-50/90 shadow-2xs'
                    : 'border-transparent hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
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

      {/* 右侧参数配置 */}
      <div className="col-span-6 space-y-4 pl-1">
        {/* 画面比例 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
            <span>画面比例</span>
            <Info className="w-3 h-3 text-slate-400" />
          </div>
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl overflow-x-auto scrollbar-none">
            {(['smart', '16:9', '21:9', '9:16', '4:3'] as VideoAspectOption[]).map((r) => {
              const isSelected = prefs.video.aspect === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => updateVideoPrefs({ aspect: r })}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="text-[10px] opacity-60">
                    {r === '16:9' ? '▭' : r === '9:16' ? '▯' : r === '21:9' ? '━' : r === '4:3' ? '▢' : '⛶'}
                  </span>
                  <span>{r === 'smart' ? '智能' : r}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 视频分辨率 */}
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500 font-medium">视频分辨率</div>
          <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl">
            {(['480P', '720P', '1080P'] as VideoResolutionOption[]).map((res) => {
              const isSelected = prefs.video.resolution === res;
              return (
                <button
                  key={res}
                  type="button"
                  onClick={() => updateVideoPrefs({ resolution: res })}
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

        {/* 时长 */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
            <span>时长</span>
            <Info className="w-3 h-3 text-slate-400" />
          </div>
          <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl">
            <button
              type="button"
              onClick={() => updateVideoPrefs({ durationMode: 'smart' })}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                prefs.video.durationMode === 'smart'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              智能时长
            </button>
            <button
              type="button"
              onClick={() => updateVideoPrefs({ durationMode: 'custom' })}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                prefs.video.durationMode === 'custom'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>自定义时长</span>
              {prefs.video.durationMode === 'custom' && (
                <span className="font-bold text-slate-900">{prefs.video.customDurationSec} 秒</span>
              )}
            </button>
          </div>

          {prefs.video.durationMode === 'custom' && (
            <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-100 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>4秒</span>
                <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  <input
                    type="number"
                    min={4}
                    max={180}
                    value={prefs.video.customDurationSec}
                    onChange={(e) => {
                      const val = Math.max(4, Math.min(180, Number(e.target.value) || 4));
                      updateVideoPrefs({ customDurationSec: val });
                    }}
                    className="w-10 text-center font-bold text-slate-900 focus:outline-none"
                  />
                  <span>秒</span>
                </div>
                <span>180秒</span>
              </div>
              <input
                type="range"
                min={4}
                max={180}
                step={1}
                value={prefs.video.customDurationSec}
                onChange={(e) => updateVideoPrefs({ customDurationSec: Number(e.target.value) })}
                className="w-full accent-slate-900 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
              />
            </div>
          )}
        </div>

        {/* 生成模式 */}
        <div className="space-y-1.5 pt-1">
          <div className="text-xs text-slate-500 font-medium">生成模式</div>
          <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl">
            <button
              type="button"
              onClick={() => updateVideoPrefs({ generationMode: 'normal' })}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                prefs.video.generationMode === 'normal'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>正常模式</span>
              <Info className="w-3 h-3 opacity-50" />
            </button>
            <button
              type="button"
              onClick={() => updateVideoPrefs({ generationMode: 'auto' })}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                prefs.video.generationMode === 'auto'
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
