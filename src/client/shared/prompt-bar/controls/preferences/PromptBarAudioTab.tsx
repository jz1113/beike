import React from 'react';
import type {
  AudioFormatOption,
  PromptComposerPreferences,
} from '../../promptBarPreferencesTypes';
import type { PreferenceModelItem } from '../../hooks/usePromptBarWorkflowModels';

const AUDIO_FORMATS: { id: AudioFormatOption; label: string; desc: string }[] = [
  { id: 'mp3', label: 'MP3', desc: '体积小 兼容高' },
  { id: 'wav', label: 'WAV', desc: '无损 无压缩' },
  { id: 'aac', label: 'AAC', desc: '高效音质' },
  { id: 'flac', label: 'FLAC', desc: '无损 压缩' },
];

const SPEED_OPTIONS: { value: number; label: string }[] = [
  { value: 0.8, label: '0.8x' },
  { value: 1.0, label: '1.0x' },
  { value: 1.2, label: '1.2x' },
  { value: 1.5, label: '1.5x' },
];

interface Props {
  prefs: PromptComposerPreferences;
  models: PreferenceModelItem[];
  updateAudioPrefs: (patch: Partial<PromptComposerPreferences['audio']>) => void;
  onOpenSettings?: () => void;
}

export function PromptBarAudioTab({
  prefs,
  updateAudioPrefs,
  onOpenSettings,
}: Props) {
  const currentFormat = prefs.audio?.format || 'mp3';
  const currentSpeed = prefs.audio?.speed ?? 1.0;

  return (
    <div className="space-y-3 pt-0.5 select-none">
      {/* 1. 音频输出格式 */}
      <div className="space-y-1.5">
        <div className="text-xs text-slate-500 dark:text-[#8E8E93] font-medium">音频格式</div>
        <div className="grid grid-cols-2 gap-1.5">
          {AUDIO_FORMATS.map((f) => {
            const isSelected = currentFormat === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => updateAudioPrefs({ format: f.id })}
                className={`py-2 px-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-center ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                    : 'border-slate-200/90 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-700 dark:text-[#E5E5EA] bg-transparent'
                }`}
              >
                <span className="text-[12px] font-bold tracking-wide">{f.label}</span>
                <span className="text-[10px] text-slate-400 dark:text-[#8E8E93] leading-tight mt-0.5 font-normal">
                  {f.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 播报语速 */}
      <div className="space-y-1.5">
        <div className="text-xs text-slate-500 dark:text-[#8E8E93] font-medium">语速调节</div>
        <div className="grid grid-cols-4 gap-1.5">
          {SPEED_OPTIONS.map((opt) => {
            const isSelected = currentSpeed === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateAudioPrefs({ speed: opt.value })}
                className={`py-1.5 px-2 rounded-xl border text-center transition-all cursor-pointer text-xs ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'border-slate-200/90 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-700 dark:text-[#E5E5EA] bg-transparent'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 底部快捷跳转设置 */}
      {onOpenSettings && (
        <div className="pt-1 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">管理声音与音色</span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            去设置模态配置 →
          </button>
        </div>
      )}
    </div>
  );
}
