import { useState } from 'react';
import {
  Sliders,
  Music,
  Film,
  Sparkles,
  Volume2,
  Maximize2,
  Type,
} from 'lucide-react';
import type { VideoSalesShot } from '@shared/domain/video-sales';
import { SpotlightCard } from '@client/shared/ui/SpotlightCard';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';

interface Props {
  shots: VideoSalesShot[];
  isComposing: boolean;
  composeProgress: number;
  onCompose: (options?: { bgmPath?: string; bgmVolume?: number; aspectRatio?: '9:16' | '16:9' | '3:4' }) => void;
  onBack: () => void;
}

const BGM_TRACKS = [
  { id: 'upbeat', label: '轻快卡点带货风', desc: '节奏明快，完播率拉满' },
  { id: 'lifestyle', label: '温暖治愈生活风', desc: '舒适松弛，家居美妆首选' },
  { id: 'electronic', label: '动感科技潮酷风', desc: '数码3C与潮流服饰专用' },
  { id: 'none', label: '无背景音乐 (纯原音)', desc: '仅保留口播解说' },
];

export function TimelineComposerView({
  shots,
  isComposing,
  composeProgress,
  onCompose,
  onBack,
}: Props) {
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '3:4'>('9:16');
  const [selectedBgm, setSelectedBgm] = useState('upbeat');
  const [bgmPath, setBgmPath] = useState('');
  const [bgmVolume, setBgmVolume] = useState(0.25);
  const [activeShotPreview, setActiveShotPreview] = useState(0);

  const totalSeconds = shots.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-6">
      {/* 顶部多轨道时间轴工作台 */}
      <SpotlightCard className="p-6 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-black/[0.06] dark:border-white/[0.08] shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-500" />
            <span className="text-base font-bold text-slate-800 dark:text-[#EDEDED]">
              多轨道时间轴编排（总时长 {totalSeconds} 秒）
            </span>
          </div>
          <span className="text-xs text-slate-400">
            支持视轨、音轨、字幕轨联动渲染
          </span>
        </div>

        {/* 可视化三轨道甘特图 */}
        <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200/60 dark:border-white/5 overflow-x-auto">
          {/* 轨 1：视频画面轨 */}
          <div className="flex items-center gap-3">
            <span className="w-16 text-[11px] font-semibold text-slate-400 shrink-0 flex items-center gap-1">
              <Film className="w-3.5 h-3.5" /> 画面轨
            </span>
            <div className="flex-1 flex gap-1 h-14 bg-slate-200/50 dark:bg-white/5 p-1 rounded-xl">
              {shots.map((shot, idx) => {
                const widthPercent = (shot.duration / totalSeconds) * 100;
                const active = activeShotPreview === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveShotPreview(idx)}
                    style={{ width: `${widthPercent}%` }}
                    className={`h-full rounded-lg text-left px-2 py-1 text-[10px] font-medium transition-all relative overflow-hidden flex flex-col justify-between ${
                      active
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-white dark:bg-[#28282D] text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                    }`}
                  >
                    <span className="truncate block font-bold">
                      #{idx + 1} {shot.description}
                    </span>
                    <span className="opacity-75 block text-[9px]">{shot.duration}s</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 轨 2：口播配音轨 */}
          <div className="flex items-center gap-3">
            <span className="w-16 text-[11px] font-semibold text-slate-400 shrink-0 flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5" /> 配音轨
            </span>
            <div className="flex-1 flex gap-1 h-9 bg-slate-200/50 dark:bg-white/5 p-1 rounded-xl">
              {shots.map((shot, idx) => {
                const widthPercent = (shot.duration / totalSeconds) * 100;
                return (
                  <div
                    key={idx}
                    style={{ width: `${widthPercent}%` }}
                    className="h-full rounded-lg bg-emerald-500/15 border border-emerald-500/20 px-2 flex items-center text-[10px] text-emerald-600 dark:text-emerald-400 font-medium truncate"
                    title={shot.voiceover}
                  >
                    🗣️ {shot.voiceover}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 轨 3：字幕大字轨 */}
          <div className="flex items-center gap-3">
            <span className="w-16 text-[11px] font-semibold text-slate-400 shrink-0 flex items-center gap-1">
              <Type className="w-3.5 h-3.5" /> 字幕轨
            </span>
            <div className="flex-1 flex gap-1 h-8 bg-slate-200/50 dark:bg-white/5 p-1 rounded-xl">
              {shots.map((shot, idx) => {
                const widthPercent = (shot.duration / totalSeconds) * 100;
                return (
                  <div
                    key={idx}
                    style={{ width: `${widthPercent}%` }}
                    className="h-full rounded-lg bg-amber-500/15 border border-amber-500/20 px-2 flex items-center text-[9px] text-amber-600 dark:text-amber-400 font-bold truncate"
                  >
                    {shot.textOverlay?.text || '高对比黑体字幕'}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SpotlightCard>

      {/* 参数调优配置与音频混音面板 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 画幅与分辨率规格 */}
        <SpotlightCard className="p-5 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-black/[0.06] dark:border-white/[0.08] shadow-sm space-y-4">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Maximize2 className="w-4 h-4 text-indigo-500" />
            输出画幅与分辨率
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: '9:16' as const, label: '9:16 竖屏', desc: '抖音 / 快手原生', res: '1080×1920' },
              { id: '3:4' as const, label: '3:4 比例', desc: '小红书种草笔记', res: '1080×1440' },
              { id: '16:9' as const, label: '16:9 横屏', desc: 'B站 / 视频号横屏', res: '1920×1080' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setAspectRatio(item.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  aspectRatio === item.id
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block text-[10px] text-slate-400 mt-0.5">{item.desc}</span>
                <span className="block text-[9px] opacity-75 mt-1 font-mono">{item.res}</span>
              </button>
            ))}
          </div>
        </SpotlightCard>

        {/* 智能 BGM 混音与避让 (Ducking) */}
        <SpotlightCard className="p-5 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-black/[0.06] dark:border-white/[0.08] shadow-sm space-y-4">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Music className="w-4 h-4 text-indigo-500" />
            BGM 背景音乐与人声混音
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-indigo-600">
              <input type="file" accept="audio/*" className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void uploadStudioFile(file, 'audio').then(setBgmPath).catch(() => setBgmPath(''));
              }} />
              {bgmPath ? '已上传真实配乐，点击更换' : '上传真实配乐文件'}
            </label>
            {BGM_TRACKS.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => setSelectedBgm(track.id)}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                  selectedBgm === track.id
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div>{track.label}</div>
                <div className="text-[10px] text-slate-400 line-clamp-1">{track.desc}</div>
              </button>
            ))}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>BGM 相对音量（自动避让口播）</span>
              <span className="font-mono font-bold">{(bgmVolume * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="0.8"
              step="0.05"
              value={bgmVolume}
              onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>
        </SpotlightCard>
      </div>

      {/* 合成执行状态条 */}
      {isComposing && (
        <div className="p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 animate-spin" />
              FFmpeg 工业管线正在渲染（High Profile 编码 + 智能 Ducking）...
            </span>
            <span>{composeProgress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-indigo-500/20 overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
              style={{ width: `${composeProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* 底部导航操作 */}
      <div className="flex items-center justify-between pt-6 border-t border-slate-200/60 dark:border-white/10">
        <button
          type="button"
          onClick={onBack}
          disabled={isComposing}
          className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        >
          返回素材管线
        </button>

        <button
          type="button"
          onClick={() => onCompose({
            bgmPath: selectedBgm === 'none' ? undefined : bgmPath || undefined,
            bgmVolume,
            aspectRatio,
          })}
          disabled={isComposing}
          className="px-8 py-3.5 rounded-2xl brand-gradient text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <Sparkles className={`w-4 h-4 ${isComposing ? 'animate-spin' : ''}`} />
          {isComposing ? '正在合成渲染...' : '开始合成并导出成片'}
        </button>
      </div>
    </div>
  );
}
