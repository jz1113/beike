import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, AudioLines, Check, FileAudio, Loader2, Music, Pause, Play, Plus, SlidersHorizontal, Sparkles, Upload, Volume2 } from 'lucide-react';
import { CanvasDrawingEditor } from '../editor/CanvasNodeMenu';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { requiresGenerationRecovery } from '@client/shared/api/generation/generationRecovery';
import { persistCanvasMedia } from '../../model/canvasNodeFactory';
import { canvasSpeechRequest } from '../../model/studioSpeech';
import { studioChannels } from '../../model/studioGeneration';
import { useCanvasStore, saveCanvasProjects } from '../../store/useCanvasStore';
import type { CanvasNode, CanvasSpecializedSettings } from '../../model/types';

export type AudioGenerationMode = 'voice' | 'music' | 'sfx';
export type AudioChannelTab = 'api' | 'fal';

export interface AudioModelOption {
  id: string;
  channelId?: string;
  modelId?: string;
  name: string;
  shortLabel: string;
  mode: AudioGenerationMode;
  channel: AudioChannelTab;
  brand: 'suno' | 'minimax' | 'sfx';
}

export const AUDIO_MODEL_CATALOG: readonly AudioModelOption[] = [
  { id: 'speech-2.8-hd', modelId: 'speech-2.8-hd', name: 'MiniMax Speech', shortLabel: 'MiniMax Speech', mode: 'voice', channel: 'api', brand: 'minimax' },
  { id: 'grok-voice', modelId: 'grok-voice', name: 'xAI Voice', shortLabel: 'xAI Voice', mode: 'voice', channel: 'api', brand: 'minimax' },
  { id: 'cosyvoice-v2', modelId: 'cosyvoice-v2', name: 'Qwen Voice', shortLabel: 'Qwen Voice', mode: 'voice', channel: 'api', brand: 'minimax' },
  { id: 'gemini-tts', modelId: 'gemini-tts', name: 'Google Voice', shortLabel: 'Google Voice', mode: 'voice', channel: 'api', brand: 'minimax' },
  { id: 'doubao-tts', modelId: 'doubao-tts', name: '字节语音', shortLabel: '字节语音', mode: 'voice', channel: 'api', brand: 'minimax' },
] as const;

function loadConfiguredAudioModels(): AudioModelOption[] {
  const voiceChannels = studioChannels().filter((item) => item.kind === 'voice');
  if (!voiceChannels.length) return [...AUDIO_MODEL_CATALOG];
  return voiceChannels.map((ch) => {
    const modelId = ch.modelId || ch.route || ch.id;
    const rawName = ch.name || modelId;
    const isMusic = /suno|music|udio|stable-audio/i.test(`${modelId} ${rawName}`);
    const isSfx = /sfx|sound-effect|mmaudio/i.test(`${modelId} ${rawName}`);
    const isFal = /fal/i.test(`${ch.id} ${modelId} ${rawName}`);
    return {
      id: ch.route || modelId || ch.id, channelId: ch.id, modelId, name: rawName, shortLabel: rawName,
      mode: isMusic ? 'music' : isSfx ? 'sfx' : 'voice', channel: isFal ? 'fal' : 'api', brand: isMusic ? 'suno' : isSfx ? 'sfx' : 'minimax',
    };
  });
}

const AUDIO_MODE_OPTIONS: ReadonlyArray<{ id: AudioGenerationMode; label: string; description: string }> = [
  { id: 'voice', label: '语音', description: '将文本转换为角色配音' },
  { id: 'music', label: '音乐', description: '根据提示词创作歌曲与纯音乐' },
  { id: 'sfx', label: '音效', description: '生成音效、环境声与氛围音频' },
];

const VOICE_PRESETS: ReadonlyArray<{ id: string; label: string; color: string }> = [
  { id: 'male-qn-qingse', label: '青涩青年', color: '#2563eb' },
  { id: 'male-qn-jingying', label: '精英青年', color: '#4f46e5' },
  { id: 'female-shaonv', label: '活泼少女', color: '#ec4899' },
  { id: 'female-yujie', label: '温柔御姐', color: '#f43f5e' },
  { id: 'presenter_male', label: '沉稳旁白', color: '#0891b2' },
  { id: 'presenter_female', label: '新闻女声', color: '#10b981' },
];

const MUSIC_LYRIC_MODES: ReadonlyArray<{ id: string; label: string; description: string }> = [
  { id: 'auto', label: '自动', description: '根据提示词自动生成人声或纯音乐' },
  { id: 'instrumental', label: '纯音乐', description: '仅生成无伴唱的纯器乐曲目' },
  { id: 'custom', label: '自定义歌词', description: '按输入文本作为歌词演唱' },
];

const VOICE_SUB_MODES: ReadonlyArray<{ id: 'tts' | 'clone'; label: string; description: string }> = [
  { id: 'tts', label: '文字转语音', description: '生成具有情感控制的语音' },
  { id: 'clone', label: '音色复刻', description: '上传音频克隆音色并试听' },
];

function triggerProps(action: () => void, role: 'button' | 'menuitem' | 'tab' = 'button') {
  return {
    role,
    tabIndex: 0,
    onClick: action,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') action();
    },
  };
}

function SunoGlyph({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M10.8 2.2c-2.1 0-3.8 1.5-4.1 3.5-.3 1.7-1.6 3-3.3 3-1.2 0-2.2.9-2.2 2.1 0 1.6 1.3 3 3 3 2.1 0 3.8-1.5 4.1-3.5.3-1.7 1.6-3 3.3-3 1.2 0 2.2-.9 2.2-2.1 0-1.6-1.3-3-3-3Z" />
    </svg>
  );
}

/** 1:1 桥豆麻衣倾斜手持麦克风图标（用于「音色复刻」） */
function HandheldMicGlyph({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <circle cx="16.5" cy="7.5" r="3.5" />
      <path d="M14 10 6.5 17.5a1.8 1.8 0 0 0 2.5 2.5L16.5 12.5" />
      <path d="m5 19-2 2" />
    </svg>
  );
}

function CenterWaveformGlyph() {
  const heights = [10, 16, 12, 24, 32, 20, 26, 14, 10];
  return (
    <div className="flex items-center gap-[3px]" aria-hidden="true">
      {heights.map((h, idx) => (
        <span key={idx} className="w-[2.5px] rounded-full bg-zinc-500/75" style={{ height: `${h}px` }} />
      ))}
    </div>
  );
}

interface Props {
  node: CanvasNode;
  nodes: CanvasNode[];
  projectId: string;
  selected: boolean;
}

export const CanvasAudioNode: React.FC<Props> = ({ node, nodes, projectId, selected }) => {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const audioRef = useRef<HTMLAudioElement>(null);
  const editorAnchor = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cloneAudioInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const upstreamNodes = (node.referenceNodeIds ?? [])
    .map((id) => nodes.find((item) => item.id === id))
    .filter(Boolean) as CanvasNode[];
  const upstreamText = upstreamNodes.map((item) => item.content?.trim()).filter(Boolean).join('\n');
  const upstreamImages = upstreamNodes.map((item) => item.imageUrl || item.referenceImageUrl).filter(Boolean) as string[];
  const upstreamAudios = upstreamNodes.filter((item) => Boolean(item.audioUrl));

  const [text, setText] = useState(node.content || upstreamText || '');
  const [generating, setGenerating] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [uploadingClone, setUploadingClone] = useState(false);
  const [error, setError] = useState('');
  const [openPopover, setOpenPopover] = useState<'model' | 'mode' | 'subMode' | 'voice' | 'lyricMode' | 'settings' | null>(null);

  const [audioModels, setAudioModels] = useState<AudioModelOption[]>(loadConfiguredAudioModels());
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const refresh = () => setAudioModels(loadConfiguredAudioModels());
    window.addEventListener('models_updated', refresh);
    window.addEventListener('modality_models_updated', refresh);
    return () => { window.removeEventListener('models_updated', refresh); window.removeEventListener('modality_models_updated', refresh); };
  }, []);

  const specialized: CanvasSpecializedSettings = node.specialized ?? {};
  const rawModelId = node.model || specialized.audioModel || audioModels[0]?.id || 'speech-2.8-hd';
  const activeModel =
    audioModels.find((item) => item.id === rawModelId || item.modelId === rawModelId || item.channelId === rawModelId) ||
    audioModels[0] ||
    AUDIO_MODEL_CATALOG[0];

  const activeMode: AudioGenerationMode = specialized.audioMode || activeModel.mode || 'voice';
  const [channelTab, setChannelTab] = useState<AudioChannelTab>(activeModel.channel);
  const hasFalModels = audioModels.some((item) => item.channel === 'fal');

  const voicePresetId = specialized.voicePreset || VOICE_PRESETS[0].id;
  const activeVoicePreset = VOICE_PRESETS.find((v) => v.id === voicePresetId) || VOICE_PRESETS[0];

  const lyricModeId = specialized.lyricMode || 'auto';
  const activeLyricMode = MUSIC_LYRIC_MODES.find((m) => m.id === lyricModeId) || MUSIC_LYRIC_MODES[0];

  const voiceSubModeId = specialized.voiceSubMode === 'clone' ? 'clone' : 'tts';
  const activeVoiceSubMode = VOICE_SUB_MODES.find((m) => m.id === voiceSubModeId) || VOICE_SUB_MODES[0];

  const speechSpeed = typeof specialized.speechSpeed === 'number' ? specialized.speechSpeed : 1.0;
  const cloneVoiceId = specialized.cloneVoiceId || '';
  const cloneAudioName = specialized.cloneAudioName || '';

  const abortRef = useRef<AbortController | null>(null);
  const effectiveText = text.trim() || upstreamText;
  const recovery = node.speechRecoveryRequired || node.status === 'generating';
  const unsupported = activeMode !== 'voice' || voiceSubModeId === 'clone' || upstreamImages.length > 0 || upstreamAudios.length > 0;
  const canAdjustSpeed = !/elevenlabs/i.test(activeModel.modelId || activeModel.id);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!openPopover) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpenPopover(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [openPopover]);

  const patchSpecialized = (patch: Partial<CanvasSpecializedSettings>, nodePatch?: Partial<CanvasNode>) => {
    updateNode(projectId, node.id, { ...nodePatch, specialized: { ...specialized, ...patch } });
  };

  const handleSelectModel = (modelOption: AudioModelOption) => {
    patchSpecialized({ audioModel: modelOption.id, audioMode: modelOption.mode }, { model: modelOption.id });
    setOpenPopover(null);
  };

  const handleSelectMode = (nextMode: AudioGenerationMode) => {
    const matchingModel =
      activeModel.mode === nextMode
        ? activeModel
        : audioModels.find((item) => item.mode === nextMode && (!hasFalModels || item.channel === channelTab)) ||
          audioModels.find((item) => item.mode === nextMode) ||
          activeModel;
    patchSpecialized({ audioMode: nextMode, audioModel: matchingModel.id }, { model: matchingModel.id });
    setOpenPopover(null);
  };

  const handleUploadReferenceAudio = async (file?: File) => {
    if (!file || uploadingRef || node.layerLocked) return;
    setUploadingRef(true);
    try {
      const media = await persistCanvasMedia(file, node.x - 320, node.y);
      const refId = crypto.randomUUID();
      useCanvasStore.getState().addNode(projectId, {
        ...media,
        id: refId,
        x: Math.round(node.x - (media.width || 250) - 64),
        y: Math.round(node.y + upstreamNodes.length * 44),
      });
      const nextRefs = Array.from(new Set([...(node.referenceNodeIds || []), refId]));
      updateNode(projectId, node.id, { referenceNodeIds: nextRefs });
    } catch {
      // Upload errors are surfaced on next action if needed
    } finally {
      setUploadingRef(false);
    }
  };

  const handleUploadCloneSampleAudio = async (file?: File) => {
    if (!file || uploadingClone || node.layerLocked) return;
    setUploadingClone(true);
    const cleanName = file.name.replace(/\.[^/.]+$/, '') || '复刻样本';
    const defaultVoiceId = cloneVoiceId || `voice_${cleanName.slice(0, 8)}`;
    try {
      const media = await persistCanvasMedia(file, node.x - 320, node.y);
      patchSpecialized({ cloneAudioUrl: media.audioUrl || '', cloneAudioName: cleanName, cloneVoiceId: defaultVoiceId });
    } catch {
      patchSpecialized({ cloneAudioName: cleanName, cloneVoiceId: defaultVoiceId });
    } finally {
      setUploadingClone(false);
    }
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || !node.audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      void audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleGenerateTTS = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.layerLocked || (!recovery && (!effectiveText || unsupported)) || generating || (abortRef.current && !abortRef.current.signal.aborted)) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setError('');
    updateNode(projectId, node.id, { status: 'generating', content: effectiveText });
    try {
      const voiceChannels = studioChannels().filter((item) => item.kind === 'voice');
      const channel = voiceChannels.find(item => item.id === activeModel.channelId ||
        item.id === rawModelId || item.route === rawModelId || item.modelId === rawModelId);
      const selectedVoice =
        activeMode === 'voice'
          ? voiceSubModeId === 'clone'
            ? cloneVoiceId.trim() || activeVoicePreset.id
            : activeVoicePreset.id
          : undefined;
      const audioUrl = await canvasSpeechRequest(
        channel?.id || '',
        effectiveText,
        selectedVoice,
        'studio-' + crypto.randomUUID(),
        {
          projectId,
          nodeId: node.id,
          signal: controller.signal,
          previousOperationId: node.speechOperationId || node.taskId,
          recoveryOnly: recovery,
          speed: canAdjustSpeed ? speechSpeed : undefined,
          onOperation: async (id) => {
            updateNode(projectId, node.id, {
              speechOperationId: id,
              speechRecoveryRequired: true,
              taskId: id,
              content: effectiveText,
            });
            await saveCanvasProjects();
          },
        },
      );
      updateNode(projectId, node.id, {
        content: effectiveText,
        title: effectiveText.slice(0, 15) || '音频',
        audioUrl,
        taskId: undefined,
        speechRecoveryRequired: false,
        status: 'success',
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : '配音失败';
      setError(message);
      updateNode(projectId, node.id, {
        content: effectiveText,
        status: 'error',
        speechRecoveryRequired: requiresGenerationRecovery(err),
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted) setGenerating(false);
    }
  };

  const cardHeight = node.height || 250;
  const placeholderText =
    activeMode === 'music'
      ? '描述你想要的音乐'
      : activeMode === 'sfx'
        ? '描述你想要的音效、环境声与氛围音频'
        : voiceSubModeId === 'clone'
          ? '输入试听预览文本（复刻后将用此文本合成）'
          : '输入文本将其转换为富有表现力的语音';

  const filteredModels = hasFalModels ? audioModels.filter((item) => item.channel === channelTab) : audioModels;

  return (
    <div ref={editorAnchor} data-testid="drawing-preview" className="pointer-events-auto relative w-full select-none" style={{ height: `${cardHeight}px` }}>
      {/* 音频节点主舞台卡片（1:1 复刻桥豆麻衣深色声波卡片） */}
      <div
        style={{ height: `${cardHeight}px` }}
        className="relative flex w-full cursor-grab active:cursor-grabbing flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.14] bg-[#1f1f1f] text-zinc-400 shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition-colors"
      >
        {node.audioUrl ? (
          <div className="flex w-full max-w-[360px] items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
            <audio
              ref={audioRef}
              src={proxyMediaUrl(node.audioUrl)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            <button
              type="button"
              aria-label={isPlaying ? '暂停音频' : '播放音频'}
              onClick={togglePlay}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 shadow-sm transition hover:bg-zinc-200 cursor-pointer"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-zinc-100">{node.title || '音频'}</p>
              <div className="mt-1.5 flex items-center gap-1">
                {[4, 12, 8, 16, 6, 14, 10, 18, 5, 12, 7, 15, 9, 4, 11].map((h, i) => (
                  <span key={i} className={`w-1 rounded-full ${isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>
          </div>
        ) : generating ? (
          <div className="pointer-events-none flex flex-col items-center gap-2.5 text-xs text-zinc-300">
            <Loader2 size={26} className="animate-spin text-white/80" />
            <span>正在生成音频…</span>
          </div>
        ) : (
          <CenterWaveformGlyph />
        )}
      </div>

      {/* 悬浮音频提示词与模型控制面板 */}
      {selected && (
        <CanvasDrawingEditor
          anchor={editorAnchor}
          panelRef={panelRef}
          preferredWidth={680}
          data-gen-prompt-panel="true"
          data-audio-prompt-panel="true"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto rounded-[22px] border border-white/[0.08] bg-[#1b1b1e]/98 px-5 pt-4 pb-3.5 text-zinc-100 shadow-[0_20px_50px_rgba(0,0,0,0.75)] backdrop-blur-xl"
        >
          {/* 顶部参考音频 / 素材上传栏 */}
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*,image/*"
              className="hidden"
              onChange={(event) => {
                void handleUploadReferenceAudio(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <input
              ref={cloneAudioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => {
                void handleUploadCloneSampleAudio(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            {activeMode !== 'voice' && <span
              {...triggerProps(() => fileInputRef.current?.click())}
              title="添加参考素材或音频"
              aria-label="添加参考素材"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-white/[0.08] bg-[#2a2a2e] text-zinc-300 transition-colors hover:border-white/20 hover:bg-[#333338] hover:text-white cursor-pointer"
            >
              {uploadingRef ? <Loader2 size={16} className="animate-spin" /> : <Plus size={17} />}
            </span>}

            {activeMode === 'music' && (
              <div
                {...triggerProps(() => fileInputRef.current?.click())}
                className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-white/12 bg-[#232326] text-zinc-200">
                  <FileAudio size={17} />
                </span>
                <span>{upstreamAudios.length > 0 ? `已连参考音频 (${upstreamAudios.length})` : '参考音频 (可选)'}</span>
              </div>
            )}

            {upstreamImages.map((imgUrl, idx) => (
              <img key={`${imgUrl}-${idx}`} src={proxyMediaUrl(imgUrl)} alt="" className="h-11 w-11 rounded-[12px] border border-white/15 object-cover" />
            ))}
          </div>

          {/* 中部提示词输入区 */}
          <textarea
            aria-label="音频提示词"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              updateNode(projectId, node.id, { content: e.target.value });
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            placeholder={placeholderText}
            className="min-h-[80px] w-full resize-none bg-transparent text-[14.5px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 outline-none"
          />

          {unsupported && <p role="status" className="mt-1 text-xs text-amber-300">
            当前支持文字配音。请切回语音与文字转语音，并断开图片和音频参考。
          </p>}
          {error ? <p role="alert" className="mt-1 text-[11px] text-rose-400">{error}</p> : null}

          {/* 底部控制栏 */}
          <div className="mt-2 flex min-h-[34px] items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {/* 1. 模型选择器 (V6 / 2.8 HD 等) */}
              <div className="relative">
                <div
                  {...triggerProps(() => setOpenPopover((prev) => (prev === 'model' ? null : 'model')))}
                  aria-label="选择音频模型"
                  data-audio-model-trigger="true"
                  className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08] cursor-pointer"
                >
                  {activeModel.brand === 'suno' ? (
                    <SunoGlyph className="h-3.5 w-3.5 shrink-0 text-zinc-100" />
                  ) : (
                    <AudioLines size={14} className="shrink-0 text-zinc-300" />
                  )}
                  <span>{activeModel.shortLabel}</span>
                </div>

                {openPopover === 'model' && (
                  <div
                    role="menu"
                    aria-label="音频模型列表"
                    className="absolute bottom-full left-0 z-50 mb-2 flex w-[252px] flex-col rounded-2xl border border-white/10 bg-[#222226] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.75)]"
                  >
                    {hasFalModels && (
                      <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-[#18181b] p-1">
                        {(['api', 'fal'] as const).map((tabId) => (
                          <div
                            key={tabId}
                            {...triggerProps(() => setChannelTab(tabId), 'tab')}
                            aria-selected={channelTab === tabId}
                            className={`flex h-7 items-center justify-center rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                              channelTab === tabId ? 'bg-[#2e2e33] text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {tabId === 'api' ? 'API' : 'Fal'}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto pr-0.5">
                      {filteredModels.filter(item => item.mode === 'voice').map((item) => {
                        const active = item.id === activeModel.id;
                        return (
                          <div
                            key={item.id}
                            {...triggerProps(() => handleSelectModel(item), 'menuitem')}
                            className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                              active ? 'bg-white/[0.11] text-white' : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                            }`}
                          >
                            {item.brand === 'suno' ? (
                              <SunoGlyph className="h-3.5 w-3.5 shrink-0 text-zinc-200" />
                            ) : (
                              <AudioLines size={14} className="shrink-0 text-zinc-400" />
                            )}
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            {item.modelId && item.modelId !== item.name && (
                              <span className="max-w-[92px] shrink-0 truncate text-[10px] font-normal text-zinc-500">
                                {item.modelId}
                              </span>
                            )}
                            {active && <Check size={13} className="shrink-0 text-emerald-400" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <span className="mx-0.5 h-3.5 w-px bg-white/15" />

              {/* 2. 生成类型切换器：语音 / 音乐 / 音效 */}
              <div className="relative">
                <div
                  {...triggerProps(() => setOpenPopover((prev) => (prev === 'mode' ? null : 'mode')))}
                  aria-label="切换音频生成类型"
                  data-audio-mode-trigger="true"
                  className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08] cursor-pointer"
                >
                  {activeMode === 'music' ? (
                    <Music size={13} className="shrink-0 text-zinc-300" />
                  ) : activeMode === 'sfx' ? (
                    <Volume2 size={13} className="shrink-0 text-zinc-300" />
                  ) : (
                    <AudioLines size={13} className="shrink-0 text-zinc-300" />
                  )}
                  <span>{AUDIO_MODE_OPTIONS.find((m) => m.id === activeMode)?.label || '语音'}</span>
                </div>

                {openPopover === 'mode' && (
                  <div
                    role="menu"
                    aria-label="音频生成类型列表"
                    className="absolute bottom-full left-0 z-50 mb-2 flex w-[256px] flex-col gap-1 rounded-2xl border border-white/10 bg-[#222226] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.75)]"
                  >
                    {AUDIO_MODE_OPTIONS.filter(option => option.id === 'voice').map((option) => {
                      const active = option.id === activeMode;
                      const ModeIcon = option.id === 'music' ? Music : option.id === 'sfx' ? Volume2 : AudioLines;
                      return (
                        <div
                          key={option.id}
                          {...triggerProps(() => handleSelectMode(option.id), 'menuitem')}
                          className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer ${
                            active ? 'bg-white/[0.11] text-white' : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-zinc-100">
                            <ModeIcon size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-white">{option.label}</div>
                            <div className="truncate text-[11px] text-zinc-400">{option.description}</div>
                          </div>
                          {active && <Check size={14} className="shrink-0 text-emerald-400" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <span className="mx-0.5 h-3.5 w-px bg-white/15" />

              {/* 3. 模式专属子控件 */}
              {activeMode === 'music' ? (
                <>
                  <div className="relative">
                    <div
                      {...triggerProps(() => setOpenPopover((prev) => (prev === 'lyricMode' ? null : 'lyricMode')))}
                      aria-label="切换歌词模式"
                      className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08] cursor-pointer"
                    >
                      <Sparkles size={13} className="shrink-0 text-zinc-300" />
                      <span>{activeLyricMode.label}</span>
                    </div>

                    {openPopover === 'lyricMode' && (
                      <div role="menu" className="absolute bottom-full left-0 z-50 mb-2 flex w-[236px] flex-col gap-1 rounded-2xl border border-white/10 bg-[#222226] p-1.5 shadow-2xl">
                        {MUSIC_LYRIC_MODES.map((mode) => {
                          const active = mode.id === lyricModeId;
                          return (
                            <div
                              key={mode.id}
                              {...triggerProps(() => {
                                patchSpecialized({ lyricMode: mode.id });
                                setOpenPopover(null);
                              }, 'menuitem')}
                              className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer ${
                                active ? 'bg-white/[0.11] text-white' : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white'
                              }`}
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-zinc-100">
                                <Sparkles size={15} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-white">{mode.label}</div>
                                <div className="truncate text-[10px] text-zinc-400">{mode.description}</div>
                              </div>
                              {active && <Check size={14} className="shrink-0 text-emerald-400" />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <span className="mx-0.5 h-3.5 w-px bg-white/15" />

                  <div
                    {...triggerProps(() => setOpenPopover((prev) => (prev === 'settings' ? null : 'settings')))}
                    aria-label="音频高级参数"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                  >
                    <SlidersHorizontal size={14} />
                  </div>
                </>
              ) : activeMode === 'voice' ? (
                <>
                  {/* 语音子模式：文字转语音 / 音色复刻（1:1 桥豆麻衣双行卡片菜单） */}
                  <div className="relative">
                    <div
                      {...triggerProps(() => setOpenPopover((prev) => (prev === 'subMode' ? null : 'subMode')))}
                      aria-label="切换语音合成方式"
                      data-audio-submode-trigger="true"
                      className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08] cursor-pointer"
                    >
                      {voiceSubModeId === 'clone' ? (
                        <HandheldMicGlyph className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                      ) : (
                        <AudioLines size={13} className="shrink-0 text-zinc-300" />
                      )}
                      <span>{activeVoiceSubMode.label}</span>
                    </div>

                    {openPopover === 'subMode' && (
                      <div
                        role="menu"
                        aria-label="语音合成方式列表"
                        className="absolute bottom-full left-0 z-50 mb-2 flex w-[252px] flex-col gap-1 rounded-2xl border border-white/10 bg-[#222226] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.75)]"
                      >
                        {VOICE_SUB_MODES.filter(sub => sub.id === 'tts').map((sub) => {
                          const active = sub.id === voiceSubModeId;
                          return (
                            <div
                              key={sub.id}
                              {...triggerProps(() => {
                                patchSpecialized({ voiceSubMode: sub.id });
                                setOpenPopover(null);
                              }, 'menuitem')}
                              className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer ${
                                active ? 'bg-white/[0.11] text-white' : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white'
                              }`}
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-zinc-100">
                                {sub.id === 'clone' ? <HandheldMicGlyph className="h-4 w-4" /> : <AudioLines size={16} />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-white">{sub.label}</div>
                                <div className="truncate text-[11px] text-zinc-400">{sub.description}</div>
                              </div>
                              {active && <Check size={14} className="shrink-0 text-emerald-400" />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <span className="mx-0.5 h-3.5 w-px bg-white/15" />

                  {voiceSubModeId === 'clone' ? (
                    <>
                      {/* 音色复刻专属：上传音频 + id ... 输入框 */}
                      <div
                        {...triggerProps(() => cloneAudioInputRef.current?.click())}
                        aria-label="上传复刻音频"
                        className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08] cursor-pointer"
                      >
                        {uploadingClone ? (
                          <Loader2 size={13} className="shrink-0 animate-spin text-zinc-300" />
                        ) : (
                          <Upload size={13} className="shrink-0 text-zinc-300" />
                        )}
                        <span className="max-w-[96px] truncate">{cloneAudioName || '上传音频'}</span>
                      </div>

                      <span className="mx-0.5 h-3.5 w-px bg-white/15" />

                      <input
                        type="text"
                        aria-label="复刻音色 ID"
                        value={cloneVoiceId}
                        onChange={(e) => patchSpecialized({ cloneVoiceId: e.target.value })}
                        onMouseDown={(e) => e.stopPropagation()}
                        placeholder="id ..."
                        className="h-7 w-20 rounded-md bg-transparent px-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:bg-white/[0.06]"
                      />
                    </>
                  ) : (
                    <>
                      {/* 文字转语音专属：角色音色选择器 (🔵 青涩青年) + 高级调节 */}
                      <div className="relative">
                        <div
                          {...triggerProps(() => setOpenPopover((prev) => (prev === 'voice' ? null : 'voice')))}
                          aria-label="选择配音音色"
                          className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08] cursor-pointer"
                        >
                          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: activeVoicePreset.color }} />
                          <span>{activeVoicePreset.label}</span>
                        </div>

                        {openPopover === 'voice' && (
                          <div role="menu" aria-label="配音音色列表" className="absolute bottom-full left-0 z-50 mb-2 flex w-[164px] flex-col gap-0.5 rounded-2xl border border-white/10 bg-[#222226] p-1.5 shadow-2xl">
                            {VOICE_PRESETS.map((voice) => (
                              <div
                                key={voice.id}
                                {...triggerProps(() => {
                                  patchSpecialized({ voicePreset: voice.id });
                                  setOpenPopover(null);
                                }, 'menuitem')}
                                className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                                  voice.id === activeVoicePreset.id ? 'bg-white/[0.12] text-white' : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                                }`}
                              >
                                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: voice.color }} />
                                <span className="flex-1 truncate">{voice.label}</span>
                                {voice.id === activeVoicePreset.id && <Check size={12} className="text-emerald-400" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <span className="mx-0.5 h-3.5 w-px bg-white/15" />

                      <div
                        {...triggerProps(() => setOpenPopover((prev) => (prev === 'settings' ? null : 'settings')))}
                        aria-label="音频高级参数"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                      >
                        <SlidersHorizontal size={14} />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-100">
                    <Sparkles size={13} className="shrink-0 text-zinc-300" />
                    <span>自动时长</span>
                  </div>
                  <span className="mx-0.5 h-3.5 w-px bg-white/15" />
                  <div
                    {...triggerProps(() => setOpenPopover((prev) => (prev === 'settings' ? null : 'settings')))}
                    aria-label="音频高级参数"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                  >
                    <SlidersHorizontal size={14} />
                  </div>
                </>
              )}

              {/* 高级参数弹层 (语速 / 音调 / 情感控制) */}
              {openPopover === 'settings' && (
                <div className="absolute bottom-14 left-44 z-50 w-[240px] rounded-2xl border border-white/10 bg-[#222226] p-3.5 text-xs text-zinc-200 shadow-[0_18px_45px_rgba(0,0,0,0.75)]">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-zinc-400">语速 / 节奏</span>
                    <span className="tabular-nums font-semibold text-white">{speechSpeed.toFixed(1)}x</span>
                  </div>
                  <input aria-label="语速" type="range" min={0.5} max={2.0} step={0.1} value={speechSpeed}
                    disabled={!canAdjustSpeed} onChange={(e) => patchSpecialized({ speechSpeed: Number(e.target.value) })} className="w-full accent-white" />
                  {!canAdjustSpeed && <p className="mt-2 text-zinc-400">当前模型不支持语速调节。</p>}
                </div>
              )}
            </div>

            {/* 右侧字数统计与提交按钮 */}
            <div className="flex items-center gap-2.5">
              {activeMode === 'voice' && <span className="tabular-nums text-xs text-zinc-500">{text.length}字</span>}
              <button
                type="button"
                title="生成音频"
                aria-label="生成音频"
                disabled={node.layerLocked || generating || (!recovery && (!effectiveText || unsupported))}
                onClick={handleGenerateTTS}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-opacity hover:bg-white/90 disabled:bg-white/25 disabled:text-zinc-900 disabled:opacity-60 cursor-pointer"
              >
                {generating ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.4} />}
              </button>
            </div>
          </div>
        </CanvasDrawingEditor>
      )}
    </div>
  );
};
