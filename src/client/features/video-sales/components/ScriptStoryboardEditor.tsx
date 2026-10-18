import { useState } from 'react';
import {
  FileText,
  Clock,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Camera,
  Mic,
  Check,
  Copy,
} from 'lucide-react';
import type {
  VideoSalesMotion,
  VideoSalesScript,
  VideoSalesShot,
  VideoSalesVisualSource,
} from '@shared/domain/video-sales';
import { VIDEO_SALES_SHOT_TYPE_CONFIG } from '@shared/domain/video-sales';
import { SpotlightCard } from '@client/shared/ui/SpotlightCard';

interface Props {
  scripts: VideoSalesScript[];
  selectedScriptIndex: number;
  onSelectScript: (idx: number) => void;
  onUpdateShots: (shots: VideoSalesShot[]) => void;
  onNext: () => void;
  onBack: () => void;
}

const MOTION_OPTIONS: { id: VideoSalesMotion; label: string }[] = [
  { id: 'zoom_in_slow', label: '缓慢推近细节' },
  { id: 'zoom_out_slow', label: '缓慢拉远全貌' },
  { id: 'pan_left', label: '向左平移' },
  { id: 'pan_right', label: '向右平移' },
  { id: 'ken_burns', label: '肯伯恩斯经典漂移' },
  { id: 'static', label: '静止定格' },
];

export function ScriptStoryboardEditor({
  scripts,
  selectedScriptIndex,
  onSelectScript,
  onUpdateShots,
  onNext,
  onBack,
}: Props) {
  const currentScript = scripts[selectedScriptIndex] || scripts[0];
  const [copiedSEO, setCopiedSEO] = useState(false);

  if (!currentScript) {
    return (
      <div className="py-20 text-center text-slate-400">
        暂无生成脚本，请返回上一步重新生成。
      </div>
    );
  }

  const handleUpdateShot = (index: number, patch: Partial<VideoSalesShot>) => {
    const nextShots = [...currentScript.shots];
    nextShots[index] = { ...nextShots[index], ...patch };
    onUpdateShots(nextShots);
  };

  const handleAddShot = () => {
    const newId = currentScript.shots.length + 1;
    const newShot: VideoSalesShot = {
      shotId: newId,
      type: 'demo',
      duration: 3,
      description: '补充镜头画面描述...',
      camera: '平视中景推近',
      visualSource: 'ai_generate',
      transition: 'direct_concat',
      voiceover: '配合镜头的口播解说词...',
      prompt: 'Clean professional product commercial video, studio lighting',
    };
    onUpdateShots([...currentScript.shots, newShot]);
  };

  const handleRemoveShot = (index: number) => {
    if (currentScript.shots.length <= 1) return;
    const nextShots = currentScript.shots
      .filter((_, i) => i !== index)
      .map((s, idx) => ({ ...s, shotId: idx + 1 }));
    onUpdateShots(nextShots);
  };

  const handleMoveShot = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentScript.shots.length) return;
    const nextShots = [...currentScript.shots];
    const temp = nextShots[index];
    nextShots[index] = nextShots[targetIdx];
    nextShots[targetIdx] = temp;
    const reindexed = nextShots.map((s, idx) => ({ ...s, shotId: idx + 1 }));
    onUpdateShots(reindexed);
  };

  const copySEO = () => {
    const text = `【标题】${currentScript.seo.title}\n【话题】${currentScript.seo.hashtags.join(' ')}\n【封面大字】${currentScript.seo.coverText}\n【文案】${currentScript.seo.description}\n【互动话术】${currentScript.seo.interactionGuide}`;
    navigator.clipboard.writeText(text);
    setCopiedSEO(true);
    setTimeout(() => setCopiedSEO(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-6">
      {/* 顶部多版本脚本对比 Tab */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-black/[0.06] dark:border-white/[0.08] shadow-sm">
        <div>
          <span className="text-xs font-semibold text-slate-400 block mb-1">
            多版本 A/B 脚本比选
          </span>
          <div className="flex items-center gap-2">
            {scripts.map((sc, i) => {
              const active = i === selectedScriptIndex;
              return (
                <button
                  key={sc.id || i}
                  type="button"
                  onClick={() => onSelectScript(i)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200/60'
                  }`}
                >
                  <span>方案 {i + 1}：{sc.title}</span>
                  <span className="text-[10px] opacity-75 font-normal">({sc.totalDuration}s)</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* SEO 物料快捷复制 */}
        <button
          type="button"
          onClick={copySEO}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors self-start sm:self-auto"
        >
          {copiedSEO ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedSEO ? '已复制全套 SEO 物料' : '复制本脚本 SEO 物料'}</span>
        </button>
      </div>

      {/* 分镜卡片列表 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-bold text-slate-800 dark:text-[#EDEDED] flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-500" />
            分镜脚本流（共 {currentScript.shots.length} 个镜头，总计 {currentScript.totalDuration} 秒）
          </span>
          <button
            type="button"
            onClick={handleAddShot}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            添加分镜
          </button>
        </div>

        {currentScript.shots.map((shot, idx) => {
          const typeConf = VIDEO_SALES_SHOT_TYPE_CONFIG[shot.type] || VIDEO_SALES_SHOT_TYPE_CONFIG.demo;
          return (
            <SpotlightCard
              key={shot.shotId || idx}
              className="p-5 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-black/[0.06] dark:border-white/[0.08] shadow-sm relative group"
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-white/5">
                {/* 镜头编号与 AIDA 阶段 */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${typeConf.badgeClass}`}>
                    {typeConf.label}
                  </span>
                  <span className="text-xs text-slate-400 font-normal">
                    {typeConf.desc}
                  </span>
                </div>

                {/* 右侧操作：时长、来源、上下移动、删除 */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-50 dark:bg-black/20 px-2 py-1 rounded-lg border border-slate-200/80 dark:border-white/10 text-xs">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={shot.duration}
                      onChange={(e) => handleUpdateShot(idx, { duration: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-10 bg-transparent text-center font-bold focus:outline-none"
                    />
                    <span className="text-slate-400">秒</span>
                  </div>

                  <select
                    value={shot.visualSource}
                    onChange={(e) => handleUpdateShot(idx, { visualSource: e.target.value as VideoSalesVisualSource })}
                    className="text-xs py-1 px-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 font-medium"
                  >
                    <option value="product_image">商品原图(运动)</option>
                    <option value="ai_generate">AI 画面生成</option>
                    <option value="user_upload">自摄素材上传</option>
                  </select>

                  <div className="flex items-center gap-1 border-l border-slate-200 dark:border-white/10 pl-2">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveShot(idx, 'up')}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === currentScript.shots.length - 1}
                      onClick={() => handleMoveShot(idx, 'down')}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveShot(idx)}
                      className="p-1 rounded-md text-rose-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 卡片主体：左右栏 */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-4">
                {/* 画面与运镜配置 */}
                <div className="md:col-span-6 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                      <Camera className="w-3.5 h-3.5 text-indigo-500" />
                      画面描述与构图
                    </label>
                    <textarea
                      rows={2}
                      value={shot.description}
                      onChange={(e) => handleUpdateShot(idx, { description: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-slate-400 mb-1 block">
                        运镜手法
                      </label>
                      <input
                        type="text"
                        value={shot.camera}
                        onChange={(e) => handleUpdateShot(idx, { camera: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 focus:outline-none"
                      />
                    </div>
                    {shot.visualSource === 'product_image' && (
                      <div>
                        <label className="text-[11px] font-medium text-slate-400 mb-1 block">
                          原图运动动效 (zoompan)
                        </label>
                        <select
                          value={shot.motion || 'zoom_in_slow'}
                          onChange={(e) => handleUpdateShot(idx, { motion: e.target.value as VideoSalesMotion })}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 focus:outline-none font-medium text-indigo-600 dark:text-indigo-400"
                        >
                          {MOTION_OPTIONS.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* 配音文案与 AI 提示词 */}
                <div className="md:col-span-6 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-indigo-500" />
                        口播配音词
                      </label>
                      <span className="text-[10px] text-slate-400">
                        {shot.voiceover.length} 字 (约 {(shot.voiceover.length / Math.max(1, shot.duration)).toFixed(1)} 字/秒)
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      value={shot.voiceover}
                      onChange={(e) => handleUpdateShot(idx, { voiceover: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-400" />
                      AI 视觉生成 Prompt (英文)
                    </label>
                    <input
                      type="text"
                      placeholder="Prompt for image/video generation..."
                      value={shot.prompt || ''}
                      onChange={(e) => handleUpdateShot(idx, { prompt: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 focus:outline-none text-slate-600 dark:text-slate-300 font-mono"
                    />
                  </div>
                </div>
              </div>
            </SpotlightCard>
          );
        })}
      </div>

      {/* 底部导航按钮 */}
      <div className="flex items-center justify-between pt-6 border-t border-slate-200/60 dark:border-white/10">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        >
          返回上一步：重新设置商品
        </button>

        <button
          type="button"
          onClick={onNext}
          className="px-8 py-3.5 rounded-2xl brand-gradient text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <span>下一步：素材调度与多模态出图</span>
        </button>
      </div>
    </div>
  );
}
