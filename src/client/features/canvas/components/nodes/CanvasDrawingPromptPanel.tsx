import { type RefObject, useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, Maximize2, Minimize2, MoreHorizontal, SlidersHorizontal, Sparkles, UserRound, X } from 'lucide-react';
import { CanvasImageControls, CanvasModelPicker } from '../tools/CanvasGridSplit';
import { CanvasCameraControl, CanvasPromptLibrarySection, hasActiveCinemaConfig } from './CanvasCameraAndPrompts';
import {
  isSeedance,
  isSeedance25,
  videoModes,
  videoDurationOptions,
  type resolveVideoMode,
} from '@shared/domain/media/videoCapabilities';
import { CanvasDrawingEditor } from '../editor/CanvasNodeMenu';
import { CanvasDrawingReferenceBar } from './CanvasDrawingReferenceBar';
import { resolveVideoResolution } from '@shared/domain/media/video';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import type { CanvasNode } from '../../model/types';
import {
  canReference,
  canReferenceVideo,
  DEFAULT_PORTRAIT_TEXTURE,
  isTextSource,
  linkedPrompt,
  PORTRAIT_TEXTURE_GROUPS,
} from '../../model/canvasGraph';
import { CanvasPromptInput } from '../prompt/CanvasPromptInput';
import { CanvasGridSkillChip, getCanvasGridSkillPreset } from '../stage/CanvasImageToolSubmenus';
import { videoPromptSkill } from '@shared/domain/assistant/skills/videoPromptSkills';
import { VideoPromptOptimizationDetails } from '../video/StudioStoryboardDialog';
import {
  CanvasUnifiedVideoControls,
  resolveImageModelCapabilities,
  resolveVideoModelCapabilities,
} from '../video/CanvasVideoPlayer';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { loadCanvasGenerationModels } from '../../model/canvasNodeFactory';
import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';

type CanvasDrawingConfig = NonNullable<CanvasNode['drawing']>;

function CanvasVideoPromptGuide({ model, mode }: { model: string; mode: string }) {
  const workflow =
    mode === 'edit'
      ? '说明要编辑哪个视频、修改哪些元素，以及哪些内容必须保留。'
      : mode === 'extend'
        ? '说明要延长哪个视频，接着写后续动作、镜头和声音；避免重新描述整段剧情。'
        : mode === 'first_frame' || mode === 'first_last_frame'
          ? '图片决定起始或结束画面，文字重点描述中间发生的动作、变化和运镜。'
          : '先写主体、场景与动作，再补镜头、风格和声音；每个参考素材明确说明用途。';
  const timing = isSeedance25(model)
    ? '多镜头可用 0–5 秒、5–10 秒等整数时间段；安排要与所选总时长一致。'
    : isSeedance(model)
      ? '多镜头按“镜头一、镜头二”描述先后关系，不依赖精确秒点控制。'
      : '一个镜头聚焦一个主要动作，避免同时给出相互矛盾的运镜要求。';
  return (
    <details className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
      <summary className="w-fit cursor-pointer select-none text-slate-400 hover:text-slate-700">提示词写法</summary>
      <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-3 dark:bg-white/5">
        <p>{workflow}</p>
        <p>{timing}</p>
        <p>图片与视频分别编号；用 @ 选择素材，例如“@图片1 提供人物外观，@视频1 提供动作参考”。台词注明说话人，并用引号包围。</p>
      </div>
    </details>
  );
}

interface Props {
  editorAnchor: RefObject<HTMLDivElement | null>;
  node: CanvasNode;
  projectId: string;
  nodes: CanvasNode[];
  isVideo: boolean;
  config: CanvasDrawingConfig;
  models: ReturnType<typeof loadCanvasGenerationModels>;
  selectedModel: string;
  videoModel: string;
  videoMode: ReturnType<typeof resolveVideoMode>;
  duration: number;
  busy: boolean;
  uploading: boolean;
  recovering: boolean;
  reviewing: boolean;
  optimizing: boolean;
  error: string;
  videoValidation: string | null;
  refs: string[];
  referenceNames: string[];
  linkedNodes: CanvasNode[];
  linkedTextNodes: CanvasNode[];
  matchingOptimization?: VideoPromptOptimization;
  onChangeConfig: (patch: Partial<CanvasDrawingConfig>) => void;
  onUploadFiles: (files: File[]) => void;
  onMoveMediaRef: (index: number, direction: -1 | 1) => void;
  onReorderMediaRef?: (fromIndex: number, toIndex: number) => void;
  onCancelOptimize: () => void;
  onGenerate: () => void;
}

export function CanvasDrawingPromptPanel({
  editorAnchor,
  node,
  projectId,
  nodes,
  isVideo,
  config,
  models,
  selectedModel,
  videoModel,
  videoMode,
  duration,
  busy,
  uploading,
  recovering,
  reviewing,
  optimizing,
  error,
  videoValidation,
  refs,
  referenceNames,
  linkedNodes,
  linkedTextNodes,
  matchingOptimization,
  onChangeConfig,
  onUploadFiles,
  onMoveMediaRef,
  onReorderMediaRef,
  onCancelOptimize,
  onGenerate,
}: Props) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const fileInput = useRef<HTMLInputElement>(null);
  const promptInput = useRef<{ insertReference: (index: number) => void; insertToken: (token: string) => void }>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [showUpstreamTextPreview, setShowUpstreamTextPreview] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [moreParamsOpen, setMoreParamsOpen] = useState(false);
  const isPortraitTextureMode = Boolean(
    !isVideo && (config.portraitTexture?.isActive || node.title === '人像质感调节'),
  );
  const activeGridSkill = !isVideo
    ? getCanvasGridSkillPreset(
        node.specialized?.operation?.startsWith('skill:')
          ? node.specialized.operation.slice('skill:'.length)
          : node.title,
      )
    : undefined;
  const [portraitPopoverOpen, setPortraitPopoverOpen] = useState(false);
  const [portraitChipHover, setPortraitChipHover] = useState(false);
  const portraitTexture = {
    ...DEFAULT_PORTRAIT_TEXTURE,
    ...(config.portraitTexture || {}),
    isActive: isPortraitTextureMode,
  };

  useEffect(() => {
    if (!portraitPopoverOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('[data-portrait-texture-root="true"]') && !target?.closest('[data-portrait-texture-toggle="true"]')) {
        setPortraitPopoverOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [portraitPopoverOpen]);

  const availableCanvasMediaNodes = nodes.filter(
    (candidate) =>
      candidate.id !== node.id &&
      !(node.referenceNodeIds || []).includes(candidate.id) &&
      (canReference(candidate) || (isVideo && canReferenceVideo(candidate)) || isTextSource(candidate)),
  );

  const handleApplyPromptTemplate = (text: string) => {
    updateNode(projectId, node.id, { content: text });
    setShowPromptLibrary(false);
  };

  return (
    <CanvasDrawingEditor
      anchor={editorAnchor}
      data-gen-prompt-panel="true"
      aria-label={isVideo ? '视频编辑面板' : '绘图编辑面板'}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      className="gen-prompt-panel-enter pointer-events-auto rounded-[22px] border border-slate-200/90 dark:border-white/[0.08] bg-white/98 dark:bg-[#1b1b1e]/98 px-5 pt-4 pb-3.5 shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.75)] backdrop-blur-xl text-slate-700 dark:text-zinc-200"
    >
      <CanvasDrawingReferenceBar
        isVideo={isVideo}
        videoMode={videoMode}
        uploading={uploading}
        fileInputRef={fileInput}
        refs={refs}
        referenceNames={referenceNames}
        linkedNodes={linkedNodes}
        linkedTextNodes={linkedTextNodes}
        availableCanvasMediaNodes={availableCanvasMediaNodes}
        showUpstreamTextPreview={showUpstreamTextPreview}
        onToggleUpstreamTextPreview={() => setShowUpstreamTextPreview((v) => !v)}
        promptLibraryOpen={!isVideo ? showPromptLibrary : false}
        onTogglePromptLibrary={!isVideo ? () => setShowPromptLibrary((v) => !v) : undefined}
        onUploadFiles={onUploadFiles}
        onInsertMediaRef={(idx) => promptInput.current?.insertReference(idx)}
        onInsertTextRef={(token) => promptInput.current?.insertToken(token)}
        onRemoveMediaRef={(url) => onChangeConfig({ references: refs.filter((item) => item !== url) })}
        onSwapFirstLast={() => onMoveMediaRef(0, 1)}
        onMoveMediaRef={onMoveMediaRef}
        onReorderMediaRef={onReorderMediaRef}
        onConnectCanvasNode={(sourceNodeId) => {
          addEdge(projectId, {
            sourceNodeId,
            sourceHandle: 'output-image',
            targetNodeId: node.id,
            targetHandle: isVideo ? 'input-first-frame' : 'input-ref-image',
          });
        }}
        onDisconnectTextNode={(id) =>
          updateNode(projectId, node.id, {
            referenceNodeIds: node.referenceNodeIds?.filter((refId) => refId !== id),
          })
        }
        rightSlot={
          !showPromptLibrary && Boolean((node.content || '').trim()) ? (
            <button
              type="button"
              onClick={() => setPromptExpanded((v) => !v)}
              title={promptExpanded ? '收起输入框' : '展开输入框'}
              aria-label={promptExpanded ? '收起输入框' : '展开输入框'}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white transition-colors cursor-pointer"
            >
              {promptExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          ) : undefined
        }
      />

      {showUpstreamTextPreview && linkedTextNodes.length > 0 && (
        <div
          data-upstream-text-preview="true"
          className="mt-2.5 max-h-28 overflow-y-auto rounded-xl border border-indigo-200/80 dark:border-indigo-500/25 bg-indigo-50/60 dark:bg-indigo-500/[0.07] px-3 py-2 text-xs text-slate-700 dark:text-zinc-200 space-y-1.5"
        >
          {linkedTextNodes.map((textNode, idx) => (
            <div key={textNode.id} className="leading-relaxed">
              <span className="mr-1.5 inline-flex items-center rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                @文本{idx + 1} · {textNode.title || '文本'}
              </span>
              <span className="text-slate-600 dark:text-zinc-300">
                {textNode.content?.trim() || '（上游文本节点暂无内容）'}
              </span>
            </div>
          ))}
        </div>
      )}

      {videoValidation && (
        <p role="status" className="mt-2.5 text-xs text-amber-700 dark:text-amber-400">
          {videoValidation}
        </p>
      )}

      {!isVideo && showPromptLibrary ? (
        <CanvasPromptLibrarySection
          currentPrompt={node.content}
          onSelectTemplate={(prompt) => handleApplyPromptTemplate(prompt)}
          onClose={() => setShowPromptLibrary(false)}
        />
      ) : (
        <CanvasPromptInput
          ref={promptInput}
          value={node.content || ''}
          expanded={promptExpanded}
          placeholder={
            isPortraitTextureMode
              ? '上传图片或输入描述，选择质感强度，让人物更自然、更真实'
              : isVideo
                ? '输入提示词...'
                : undefined
          }
          leadingSlot={
            isPortraitTextureMode ? (
              <div className="relative shrink-0" data-portrait-texture-root="true">
                <button
                  type="button"
                  data-portrait-texture-chip="true"
                  aria-expanded={portraitPopoverOpen}
                  onMouseEnter={() => setPortraitChipHover(true)}
                  onMouseLeave={() => setPortraitChipHover(false)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPortraitPopoverOpen((v) => !v);
                  }}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/[0.14] bg-slate-100 dark:bg-white/[0.04] px-2.5 text-xs font-medium text-slate-800 dark:text-white/92 hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-colors cursor-pointer select-none"
                >
                  {portraitPopoverOpen || portraitChipHover ? (
                    <span
                      role="button"
                      tabIndex={-1}
                      title="移除人像质感调节"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPortraitPopoverOpen(false);
                        onChangeConfig({
                          portraitTexture: {
                            ...portraitTexture,
                            isActive: false,
                          },
                        });
                      }}
                      className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-300 dark:bg-white/[0.14] text-slate-700 dark:text-white/85 hover:bg-slate-400 dark:hover:bg-white/25 transition-colors"
                    >
                      <X size={10} />
                    </span>
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-[#a855f7] to-[#ec4899] text-white">
                      <UserRound size={10} />
                    </span>
                  )}
                  <span>人像质感调节</span>
                  <SlidersHorizontal size={12} className="text-slate-400 dark:text-white/60" />
                </button>
                {portraitPopoverOpen && (
                  <div
                    data-portrait-texture-popover="true"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-12 top-full z-[160] mt-2 w-[288px] rounded-[20px] border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#252528]/96 p-4 text-xs text-slate-700 dark:text-zinc-200 shadow-[0_20px_50px_rgba(0,0,0,0.75)] backdrop-blur-xl select-none"
                  >
                    {PORTRAIT_TEXTURE_GROUPS.map((group) => {
                      const selectedVal = portraitTexture[group.key] || group.default;
                      return (
                        <div key={group.key} className="mb-3.5 last:mb-0">
                          <div className="mb-2 text-[13px] font-medium text-slate-500 dark:text-white/55">
                            {group.title}
                          </div>
                          <div className="grid grid-cols-3 gap-2.5">
                            {group.options.map((opt) => {
                              const active = selectedVal === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() =>
                                    onChangeConfig({
                                      portraitTexture: {
                                        ...portraitTexture,
                                        [group.key]: opt,
                                        isActive: true,
                                      },
                                    })
                                  }
                                  className={`h-8 rounded-[10px] border px-2 text-center text-[12px] transition-colors cursor-pointer ${
                                    active
                                      ? 'border-transparent bg-slate-200 text-slate-900 dark:bg-white/[0.18] dark:text-white font-semibold'
                                      : 'border-slate-200/90 bg-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.14] dark:text-white/85 dark:hover:border-white/25 dark:hover:bg-white/[0.06]'
                                  }`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeGridSkill ? (
              <CanvasGridSkillChip
                preset={activeGridSkill}
                onSelectPreset={(nextPreset) => {
                  updateNode(projectId, node.id, {
                    title: nextPreset.label,
                    content: nextPreset.prompt,
                    specialized: {
                      ...(node.specialized || {}),
                      operation: `skill:${nextPreset.id}`,
                    },
                  });
                  onChangeConfig({ aspect: nextPreset.aspect });
                }}
                onClear={() => {
                  updateNode(projectId, node.id, {
                    title: '图片生成',
                    specialized: undefined,
                  });
                }}
              />
            ) : undefined
          }
          references={refs}
          referenceTitles={refs.map((url) => linkedNodes.find((n) => n.videoUrl === url || n.imageUrl === url)?.title)}
          textReferences={linkedTextNodes.map((item, idx) => ({
            id: item.id,
            token: `@文本${idx + 1}`,
            title: item.title || '文本',
          }))}
          canvasCandidates={availableCanvasMediaNodes.map((cand, idx) => ({
            nodeId: cand.id,
            isText: isTextSource(cand),
            title: cand.title || (isTextSource(cand) ? `文本 ${idx + 1}` : `素材 ${idx + 1}`),
            url: cand.videoUrl || cand.imageUrl,
          }))}
          onConnectCandidate={(cand) => {
            addEdge(projectId, {
              sourceNodeId: cand.nodeId,
              sourceHandle: cand.isText ? 'output-text' : 'output-image',
              targetNodeId: node.id,
              targetHandle: isVideo ? 'input-first-frame' : 'input-ref-image',
            });
          }}
          onRequestUpload={() => fileInput.current?.click()}
          onChange={(content) => updateNode(projectId, node.id, { content })}
          onSubmit={onGenerate}
        />
      )}

      {isVideo && (() => {
        const connectedOptimizer = linkedNodes.find((item) => item.studioSubType === 'video-prompt-optimizer');
        if (connectedOptimizer) return null;
        const spawnOptimizerNode = () => {
          const state = useCanvasStore.getState();
          const optimizerId = `node-${crypto.randomUUID()}`;
          const existingRefIds = node.referenceNodeIds || [];
          state.addNode(projectId, {
            id: optimizerId,
            type: 'prompt',
            studioSubType: 'video-prompt-optimizer',
            title: '提示词 Skill',
            content: node.content || '',
            textPrompt: node.content || '',
            referenceNodeIds: existingRefIds,
            drawing: {
              model: selectedModel || 'wan3.0-video',
              quality: config.quality || '720P',
              aspect: config.aspect || '16:9',
              count: 1,
              duration: duration || 5,
              refMode: videoMode,
              audio: config.audio !== false,
              references: config.references || [],
            },
            x: node.x - 360,
            y: node.y,
            width: 300,
            height: 260,
            status: 'idle',
          });
          existingRefIds.forEach((srcId) => {
            state.addEdge(projectId, { sourceNodeId: srcId, targetNodeId: optimizerId });
          });
          updateNode(projectId, node.id, {
            referenceNodeIds: [optimizerId],
            drawing: { ...config, optimizePrompt: false },
          });
          state.addEdge(projectId, { sourceNodeId: optimizerId, targetNodeId: node.id });
          state.selectNode(optimizerId);
          window.dispatchEvent(new CustomEvent('canvas:select-node', { detail: { nodeId: optimizerId } }));
        };
        if (!(moreParamsOpen || reviewing || optimizing || Boolean(node.promptOptimization))) return null;
        return (
          <div className="mb-2 rounded-xl border border-slate-200/70 bg-slate-50/60 p-2.5 text-xs text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-400">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium text-slate-700 dark:text-zinc-200">
                  提示词 Skill 节点 · {videoPromptSkill(videoModel, videoMode)?.displayName || '模型专属提示词优化'}
                </span>
                <p className="mt-0.5 text-[11px] text-slate-400 dark:text-zinc-500">
                  独立节点可连接文本与参考素材，调用大模型与专属 Skill 并对比优化前后差异
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={spawnOptimizerNode}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors cursor-pointer"
              >
                <Sparkles size={12} />
                <span>+ 创建并连接提示词 Skill</span>
              </button>
            </div>
            {optimizing && (
              <button type="button" className="mt-1 min-h-7 underline cursor-pointer" onClick={onCancelOptimize}>
                取消优化
              </button>
            )}
            <VideoPromptOptimizationDetails historical={!matchingOptimization} value={node.promptOptimization} />
            <CanvasVideoPromptGuide model={selectedModel} mode={videoMode} />
          </div>
        );
      })()}

      <div
        data-qiaodoumayi-gen-toolbar="true"
        data-qiaodoumayi-gen-node-type={isVideo ? 'gen-video' : 'gen-image'}
        className="qiaodoumayi-gen-toolbar flex min-h-9 items-center gap-2 pt-1"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <CanvasModelPicker
            label={isVideo ? '视频模型' : '绘图模型'}
            models={models}
            value={selectedModel}
            onChange={(model) => {
              if (!isVideo) {
                const imgCaps = resolveImageModelCapabilities(model);
                const nextAspect = imgCaps.ratios.includes(config.aspect) ? config.aspect : imgCaps.ratios[0] || '1:1';
                const nextQuality =
                  imgCaps.resolutions.length === 0
                    ? config.quality
                    : imgCaps.resolutions.some((r) => r.id === config.quality || r.short === config.quality)
                      ? config.quality
                      : imgCaps.resolutions[Math.min(1, imgCaps.resolutions.length - 1)].id;
                const nextGenQuality =
                  imgCaps.qualities.length === 0
                    ? undefined
                    : imgCaps.qualities.some((q) => q.id === config.generationQuality)
                      ? config.generationQuality
                      : 'high';
                const nextBg = imgCaps.supportsBackground ? config.backgroundMode : 'auto';
                onChangeConfig({
                  model,
                  aspect: nextAspect,
                  quality: nextQuality,
                  generationQuality: nextGenQuality,
                  backgroundMode: nextBg,
                });
                return;
              }
              const upstream = upstreamModalityModelId('video', model);
              const baseUrl = getGatewayClientBaseUrl(model);
              const vidCaps = resolveVideoModelCapabilities(upstream, videoMode, config.quality, baseUrl);
              const quality = resolveVideoResolution(config.quality, vidCaps.resolutions);
              const supportedModes = videoModes(upstream, baseUrl);
              const refMode = vidCaps.modes.some((item) => item.id === videoMode)
                ? videoMode
                : vidCaps.modes[vidCaps.modes.length - 1]?.id || supportedModes[0]?.id || 'omni';
              const nextDurations = videoDurationOptions(upstream, quality, refMode, baseUrl);
              onChangeConfig({
                model,
                aspect: vidCaps.ratios.includes(config.aspect) ? config.aspect : vidCaps.ratios[0] || '16:9',
                quality,
                refMode,
                duration: nextDurations.includes(duration) ? duration : nextDurations[0],
              });
            }}
            disabled={busy}
          />

          {isVideo ? (
            node.studioSubType === 'motion-control' ? (
              <>
                <label className="text-xs">
                  画质{' '}
                  <select
                    aria-label="动作迁移画质"
                    value={config.quality}
                    disabled={busy}
                    onChange={(event) => onChangeConfig({ quality: event.target.value })}
                  >
                    <option>720P</option>
                    <option>1080P</option>
                  </select>
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={config.audio !== false}
                    disabled={busy}
                    onChange={(event) => onChangeConfig({ audio: event.target.checked })}
                  />
                  保留原声
                </label>
              </>
            ) : (
              <>
                <CanvasUnifiedVideoControls
                  config={{ ...config, references: refs, refMode: videoMode, duration }}
                  model={selectedModel}
                  onChange={onChangeConfig}
                />
                <span className="qiaodoumayi-gen-model-size-divider" aria-hidden="true" />
                <button
                  type="button"
                  aria-label="展开生成参数"
                  aria-expanded={moreParamsOpen}
                  title="展开 / 收起更多视频参数与提示词优化"
                  onClick={() => setMoreParamsOpen((v) => !v)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                    moreParamsOpen
                      ? 'bg-black/[0.06] text-zinc-950 dark:bg-white/[0.12] dark:text-white'
                      : 'text-zinc-500 hover:bg-black/5 hover:text-zinc-800 dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white'
                  }`}
                >
                  <MoreHorizontal size={14} />
                </button>
                {moreParamsOpen && (
                  <button
                    type="button"
                    aria-label="生成数量快捷切换"
                    title="点击切换生成视频数量（1x / 2x / 4x）"
                    onClick={() => {
                      const nextCount = config.count === 1 ? 2 : config.count === 2 ? 4 : 1;
                      onChangeConfig({ count: nextCount });
                    }}
                    className="rounded-[8px] px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/[0.08] cursor-pointer"
                  >
                    {config.count || 1}x
                  </button>
                )}
              </>
            )
          ) : (
            <>
              <CanvasImageControls config={config} model={selectedModel} onChange={onChangeConfig} />
              <span className="qiaodoumayi-gen-model-size-divider" aria-hidden="true" />
              {!showPromptLibrary && (
                <button
                  type="button"
                  onClick={() => setShowPromptLibrary(true)}
                  aria-expanded={showPromptLibrary}
                  aria-label="词库"
                  title="常用提示词库"
                  className="rounded-[9px] px-2 py-1 text-[12px] font-medium whitespace-nowrap text-zinc-600 hover:bg-black/5 hover:text-zinc-900 dark:text-white/85 dark:hover:bg-white/[0.08] dark:hover:text-white transition-colors cursor-pointer"
                >
                  词库
                </button>
              )}
              <button
                type="button"
                aria-label="展开生成参数"
                aria-expanded={moreParamsOpen}
                title="展开 / 收起更多生成参数"
                onClick={() => setMoreParamsOpen((v) => !v)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  moreParamsOpen
                    ? 'bg-black/[0.06] text-zinc-950 dark:bg-white/[0.12] dark:text-white'
                    : 'text-zinc-500 hover:bg-black/5 hover:text-zinc-800 dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white'
                }`}
              >
                <MoreHorizontal size={14} />
              </button>
              {moreParamsOpen && (
                <button
                  type="button"
                  aria-label="生成张数快捷切换"
                  title="点击切换生成张数（1x / 2x / 4x）"
                  onClick={() => {
                    const nextCount = config.count === 1 ? 2 : config.count === 2 ? 4 : 1;
                    onChangeConfig({ count: nextCount });
                  }}
                  className="rounded-[8px] px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/[0.08] cursor-pointer"
                >
                  {config.count || 1}x
                </button>
              )}
              {(moreParamsOpen || hasActiveCinemaConfig(config.cinemaConfig)) && (
                <CanvasCameraControl
                  value={config.cinemaConfig}
                  onChange={(cinemaConfig) => onChangeConfig({ cinemaConfig })}
                />
              )}
            </>
          )}
        </div>
        <div className="qiaodoumayi-gen-submit-wrap ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label={node.studioSubType === 'motion-control' ? '开始动作迁移' : isVideo ? '开始生成视频' : '开始绘图'}
            title={recovering ? '查询原优化回执' : undefined}
            disabled={
              busy ||
              uploading ||
              (!recovering &&
                (Boolean(videoValidation) ||
                  (!linkedPrompt(node, nodes) &&
                    !(isVideo && refs.length) &&
                    !(isPortraitTextureMode && refs.length) &&
                    !(!isVideo && hasActiveCinemaConfig(config.cinemaConfig)))))
            }
            onClick={onGenerate}
            className="qiaodoumayi-gen-submit flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 transition hover:bg-slate-700 dark:hover:bg-slate-200 disabled:bg-slate-100 dark:disabled:bg-white/10 disabled:text-slate-400 dark:disabled:text-zinc-600 cursor-pointer"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2.5 text-xs text-amber-700 dark:text-amber-400">
          {error}
        </p>
      )}
    </CanvasDrawingEditor>
  );
}
