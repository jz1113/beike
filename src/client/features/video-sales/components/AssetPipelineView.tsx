import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Film,
  Sparkles,
  Upload,
  RotateCcw,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type { VideoSalesShot } from '@shared/domain/video-sales';
import { VIDEO_SALES_SHOT_TYPE_CONFIG } from '@shared/domain/video-sales';
import { SpotlightCard } from '@client/shared/ui/SpotlightCard';
import { generateSalesShotAsset, shotWantsVideo } from '../model/generateShotAsset';
import { firstAvatarAssets, renderSalesAvatarShot } from '../api/avatarShot';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';

interface Props {
  shots: VideoSalesShot[];
  productImages: string[];
  videoModel?: string;
  imageModel?: string;
  voiceModel?: string;
  onUpdateShots: (shots: VideoSalesShot[] | ((shots: VideoSalesShot[]) => VideoSalesShot[])) => void;
  onNext: () => void;
  onBack: () => void;
}

export function AssetPipelineView({
  shots,
  productImages,
  videoModel,
  imageModel,
  voiceModel,
  onUpdateShots,
  onNext,
  onBack,
}: Props) {
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => () => {
    aliveRef.current = false;
    abortRef.current?.abort();
  }, []);

  const readyCount = shots.filter(
    (s) => s.status === 'done' || s.visualSource === 'product_image' || Boolean(s.assetUrl)
  ).length;

  const patchShot = useCallback((idx: number, patch: Partial<VideoSalesShot>) => {
    onUpdateShots((current) => current.map((shot, i) => (i === idx ? { ...shot, ...patch } : shot)));
  }, [onUpdateShots]);

  const handleGenerateOne = useCallback(
    async (idx: number, shot: VideoSalesShot) => {
      const stopped = () => !aliveRef.current || Boolean(abortRef.current?.signal.aborted);
      if (stopped()) return;
      if (shot.visualSource === 'product_image') {
        const url = shot.assetUrl || productImages[idx % Math.max(1, productImages.length)] || '';
        patchShot(idx, url ? { status: 'done', assetUrl: url } : { status: 'failed' });
        return;
      }
      patchShot(idx, { status: 'generating' });
      try {
        if (shot.visualSource === 'avatar_presenter') {
          const assets = shot.characterId && shot.avatarVoiceId
            ? { avatarId: shot.characterId, voiceId: shot.avatarVoiceId }
            : await firstAvatarAssets();
          if (!assets) throw new Error('请先在数字人工作室准备可用形象和音色');
          const voiceRoute = resolveModalityModelRoute('voice', voiceModel);
          const driverRoute = resolveModalityModelRoute('video', videoModel);
          const url = await renderSalesAvatarShot({
            script: shot.voiceover || shot.description,
            avatarId: assets.avatarId,
            voiceId: assets.voiceId,
            voiceModel: voiceRoute.modelId,
            driverModel: driverRoute.modelId,
            voiceBaseUrl: voiceRoute.baseUrl,
            voiceApiKey: voiceRoute.apiKey,
            driverBaseUrl: driverRoute.baseUrl,
            driverApiKey: driverRoute.apiKey,
          });
          if (stopped()) return;
          patchShot(idx, { status: 'done', assetUrl: url, audioUrl: undefined });
          return;
        }
        const url = await generateSalesShotAsset({
          prompt: shot.prompt || shot.description,
          video: shotWantsVideo(shot.transition),
          model: shotWantsVideo(shot.transition) ? videoModel : undefined,
          imageModel,
          referenceImages: productImages,
          duration: shot.duration,
          isAborted: stopped,
        });
        if (stopped()) return;
        patchShot(idx, { status: 'done', assetUrl: url });
      } catch {
        if (stopped()) return;
        patchShot(idx, { status: 'failed' });
      }
    },
    [patchShot, productImages, videoModel, imageModel, voiceModel]
  );

  const handleBatchGenerate = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsBatchGenerating(true);
    try {
      await Promise.all(shots.map((shot, idx) => (
        shot.status === 'done' || shot.assetUrl ? Promise.resolve() : handleGenerateOne(idx, shot)
      )));
    } finally {
      if (!controller.signal.aborted) setIsBatchGenerating(false);
    }
  }, [shots, handleGenerateOne]);

  const handleManualUpload = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        const next = [...shots];
        next[idx] = {
          ...next[idx],
          visualSource: 'user_upload',
          assetUrl: event.target.result,
          status: 'done',
        };
        onUpdateShots(next);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-6">
      {/* 顶部统计与一键生成全部卡片 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-black/[0.06] dark:border-white/[0.08] shadow-sm">
        <div>
          <span className="text-base font-bold text-slate-800 dark:text-[#EDEDED] flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-indigo-500" />
            分镜素材管线状态
          </span>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            已就绪 {readyCount} / {shots.length} 个镜头素材。支持 AI 多模型生图生视频、商品原图 5 种运镜与自摄素材替换。
          </p>
        </div>

        <button
          type="button"
          onClick={handleBatchGenerate}
          disabled={isBatchGenerating || readyCount === shots.length}
          className="px-5 py-2.5 rounded-xl brand-gradient text-white text-xs font-bold shadow-md hover:shadow-indigo-500/30 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isBatchGenerating ? 'animate-spin' : ''}`} />
          {isBatchGenerating ? '多流并行渲染中...' : '一键生成全部未完成素材'}
        </button>
      </div>

      {/* 镜头素材卡片栅格流 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {shots.map((shot, idx) => {
          const typeConf = VIDEO_SALES_SHOT_TYPE_CONFIG[shot.type] || VIDEO_SALES_SHOT_TYPE_CONFIG.demo;
          const displayUrl =
            shot.assetUrl ||
            (shot.visualSource === 'product_image' ? productImages[0] : null);

          return (
            <SpotlightCard
              key={shot.shotId || idx}
              className="p-4 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-black/[0.06] dark:border-white/[0.08] shadow-sm flex flex-col justify-between space-y-3"
            >
              {/* 卡片头部 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[11px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${typeConf.badgeClass}`}>
                    {typeConf.label}
                  </span>
                </div>
                <span className="text-[11px] font-medium text-slate-400">
                  {shot.duration}s
                </span>
              </div>

              {/* 视觉画面预览区 */}
              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-black/40 border border-black/[0.04] dark:border-white/[0.06] group flex items-center justify-center">
                {displayUrl ? (
                  <img
                    src={displayUrl}
                    alt={shot.description}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="text-center p-3 text-slate-400">
                    <Film className="w-6 h-6 mx-auto mb-1 opacity-40" />
                    <span className="text-[11px] block">待生成视觉素材</span>
                  </div>
                )}

                {/* 覆盖状态角标 */}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[10px] font-medium">
                  {shot.visualSource === 'product_image'
                    ? `原图动效 (${shot.motion || '缓慢推近'})`
                    : shot.visualSource === 'avatar_presenter'
                    ? '数字人口播'
                    : shot.visualSource === 'user_upload'
                    ? '自摄上传'
                    : 'AI 画面生成'}
                </div>

                {shot.status === 'generating' && (
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2">
                    <Sparkles className="w-5 h-5 animate-spin text-indigo-400" />
                    <span className="text-xs font-medium">渲染生成中...</span>
                  </div>
                )}
              </div>

              {/* 画面与文案摘要 */}
              <div className="space-y-1 text-xs">
                <p className="text-slate-700 dark:text-slate-200 line-clamp-2 leading-relaxed font-medium">
                  {shot.description}
                </p>
                <p className="text-slate-400 line-clamp-1 text-[11px]">
                  口播：{shot.voiceover}
                </p>
              </div>

              {/* 底部动作工具栏 */}
              <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => { void handleGenerateOne(idx, shot); }}
                  disabled={shot.status === 'generating'}
                  className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-medium text-[11px]"
                >
                  <RotateCcw className="w-3 h-3" />
                  {displayUrl ? '重新渲染' : '立即生成'}
                </button>

                <button
                  type="button"
                  onClick={() => patchShot(idx, { visualSource: shot.visualSource === 'avatar_presenter' ? 'ai_generate' : 'avatar_presenter' })}
                  className="text-[11px] font-medium text-slate-500"
                >
                  {shot.visualSource === 'avatar_presenter' ? '改回画面镜头' : '改为数字人口播'}
                </button>
                <label className="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[11px] flex items-center gap-1">
                  <Upload className="w-3 h-3" />
                  <span>换图</span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => handleManualUpload(idx, e)}
                  />
                </label>
              </div>
            </SpotlightCard>
          );
        })}
      </div>

      {/* 底部导航 */}
      <div className="flex items-center justify-between pt-6 border-t border-slate-200/60 dark:border-white/10">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        >
          返回分镜脚本编辑
        </button>

        <button
          type="button"
          onClick={onNext}
          className="px-8 py-3.5 rounded-2xl brand-gradient text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <span>下一步：多轨道时间轴与视频合成</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
