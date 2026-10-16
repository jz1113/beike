import React from 'react';
import { Check, Info, Sparkles, ExternalLink } from 'lucide-react';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import type {
  VideoAspectOption,
  VideoResolutionOption,
  PromptComposerPreferences,
} from '../../promptBarPreferencesTypes';
import type { PreferenceModelItem } from '../../hooks/usePromptBarWorkflowModels';

interface Props {
  prefs: PromptComposerPreferences;
  models: PreferenceModelItem[];
  updateVideoPrefs: (patch: Partial<PromptComposerPreferences['video']>) => void;
  onOpenSettings?: () => void;
}

export function PromptBarVideoTab({
  prefs,
  models,
  updateVideoPrefs,
  onOpenSettings,
}: Props) {
  const currentModelId = prefs.video.modelId || 'smart';

  return (
    <div className="grid grid-cols-12 gap-6 pt-1">
      {/* 左侧模型选择 */}
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
            <span>缺少心仪的视频模型？</span>
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

      {/* 右侧参数配置 */}
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
            {(['smart', '16:9', '21:9', '9:16', '4:3', '3:4', '1:1'] as VideoAspectOption[]).map((r) => {
              const isSelected = prefs.video.aspect === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => updateVideoPrefs({ aspect: r })}
                  className={`flex-1 min-w-[42px] py-1.5 px-1.5 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="text-[10px] opacity-60">
                    {r === '16:9' ? '▭' : r === '9:16' ? '▯' : r === '21:9' ? '━' : r === '4:3' ? '▢' : r === '3:4' ? '▯' : r === '1:1' ? '◻' : '⛶'}
                  </span>
                  <span className="text-[11px]">{r === 'smart' ? '智能' : r}</span>
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
                  {res !== '480P' && <span className="text-purple-600 text-[10px]">💎</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 时长 */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
            <span>时长</span>
            <div className="relative group/durInfo inline-flex items-center">
              <Info className="w-3 h-3 text-slate-400 cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover/durInfo:flex flex-col items-center z-50 pointer-events-none">
                <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-xl shadow-xl whitespace-nowrap">
                  智能时长由模型依据动作节奏自适应决定；自定义时长可精确设置秒数
                </div>
                <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl">
            <div className="relative group/durSmart flex-1">
              <button
                type="button"
                onClick={() => updateVideoPrefs({ durationMode: 'smart' })}
                className={`w-full py-1.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  prefs.video.durationMode === 'smart'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                智能时长
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/durSmart:flex flex-col items-center z-50 pointer-events-none">
                <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-xl shadow-xl whitespace-nowrap">
                  由模型自动判断时长
                </div>
                <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
              </div>
            </div>
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
            <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-100 space-y-2.5 animate-fade-in">
              {/* 实时悬浮提示暗色气泡 */}
              <div className="flex justify-center">
                <div className="relative bg-slate-900 text-white text-[11px] font-medium px-3 py-1 rounded-full shadow-md animate-fade-in">
                  会在提示词里附加“视频时长：{prefs.video.customDurationSec}秒”
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-1 overflow-hidden">
                    <div className="w-2 h-2 bg-slate-900 rotate-45 -translate-y-1" />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 font-medium pt-1">
                <span>4秒</span>
                <div className="flex items-center gap-1 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
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

              {/* 滑杆 */}
              <input
                type="range"
                min={4}
                max={180}
                step={1}
                value={prefs.video.customDurationSec}
                onChange={(e) => updateVideoPrefs({ customDurationSec: Number(e.target.value) })}
                className="w-full accent-slate-900 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
              />

              {/* 刻度标尺 */}
              <div className="space-y-1 select-none">
                <div className="flex justify-between items-end px-1 h-1.5">
                  {[4, 15, 30, 60, 90, 120, 150, 180].map((t) => (
                    <div
                      key={t}
                      className={`w-0.5 rounded-full ${
                        t === 4 || t === 60 || t === 180 ? 'h-2 bg-slate-400' : 'h-1 bg-slate-300'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 px-0.5 font-medium">
                  <span>4s</span>
                  <span>15s</span>
                  <span>30s</span>
                  <span>60s</span>
                  <span>120s</span>
                  <span>180s</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 生成模式 */}
        <div className="space-y-1.5 pt-1">
          <div className="text-xs text-slate-500 font-medium">生成模式</div>
          <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl">
            {/* 正常模式 */}
            <div className="relative group/normal flex-1">
              <button
                type="button"
                onClick={() => updateVideoPrefs({ generationMode: 'normal' })}
                className={`w-full py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  prefs.video.generationMode === 'normal'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>正常模式</span>
                <Info className="w-3 h-3 opacity-50" />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/normal:flex flex-col items-center z-50 pointer-events-none">
                <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-xl shadow-xl whitespace-nowrap">
                  生成前会打断确认，适合需要核对参数和积分的场景
                </div>
                <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
              </div>
            </div>

            {/* 自动模式 */}
            <div className="relative group/auto flex-1">
              <button
                type="button"
                onClick={() => updateVideoPrefs({ generationMode: 'auto' })}
                className={`w-full py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  prefs.video.generationMode === 'auto'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>自动模式</span>
                <Info className="w-3 h-3 opacity-50" />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/auto:flex flex-col items-center z-50 pointer-events-none">
                <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-xl shadow-xl whitespace-nowrap">
                  全程无打断，直接生成最终视频
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
