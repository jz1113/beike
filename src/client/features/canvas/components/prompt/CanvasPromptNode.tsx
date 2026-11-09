import { sortStudioMediaReferences } from '../../model/studioConnections';
import { mediaReferenceSlots } from '@client/shared/media/videoReferences';
import { NativeStudioCommandsContext } from '../../hooks/useNativeStudioCommands';
import { loadCanvasChatModels, mediaData, resolveCanvasChatModel } from '../../model/canvasNodeFactory';
import { validateNativeCommerceInputs } from '../../model/creativeWorkflowProjects';
import { CanvasDrawingEditor, CanvasRichTextEditor } from '../editor/CanvasNodeMenu';
import { CanvasModelPicker } from '../tools/CanvasGridSplit';
import { CanvasPromptInput, CanvasPromptReferenceThumbnail, uploadCanvasPromptReferences, type CanvasMentionCandidate, type CanvasPromptInputRef } from './CanvasPromptInput';
import { useContext, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlignLeft, ArrowUp, Eye, EyeOff,
  Mic, Plus, Sparkles, SlidersHorizontal, X,
} from 'lucide-react';
import { requestCanvasText } from '../../model/canvasTextRequest';
import { saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { PromptBarReasoningPill } from '@client/shared/prompt-bar/controls/PromptBarReasoningPill';
import { DEFAULT_MULTIMODAL_MODEL_ID } from '@shared/domain/models/modelCatalog';
import { canReference, canReferenceVideo, isTextSource } from '../../model/canvasGraph';
import type { CanvasNode } from '../../model/types';

export function CanvasPromptNode({
  projectId, node, selected, nodes, onChange,
}: {
  projectId: string; node: CanvasNode; selected: boolean; nodes: CanvasNode[]; onChange: (patch: Partial<CanvasNode>) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<CanvasPromptInputRef>(null);
  const latest = useRef(node);
  latest.current = node;
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [error, setError] = useState('');
  const [showUpstream, setShowUpstream] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [shotCount, setShotCount] = useState(4);
  const [shotDuration, setShotDuration] = useState(5);

  const [modelOptions, setModelOptions] = useState(loadCanvasChatModels);
  useEffect(() => {
    const refresh = () => setModelOptions(loadCanvasChatModels());
    window.addEventListener('models_updated', refresh);
    window.addEventListener('modality_models_updated', refresh);
    return () => {
      window.removeEventListener('models_updated', refresh);
      window.removeEventListener('modality_models_updated', refresh);
    };
  }, []);

  const studioCommands = useContext(NativeStudioCommandsContext);

  const sources = useMemo(
    () =>
      (node.referenceNodeIds || [])
        .map((id) => nodes.find((item) => item.id === id))
        .filter((item): item is CanvasNode => !!item),
    [node.referenceNodeIds, nodes],
  );
  const textSources = sources.filter(isTextSource);
  const matchedModel = resolveCanvasChatModel(modelOptions, node.textModel, textSources.find((s) => s.textModel)?.textModel);
  const model = matchedModel?.id || node.textModel || DEFAULT_MULTIMODAL_MODEL_ID;
  const upstreamModel = matchedModel?.modelId || model;

  const isOptimizer = node.studioSubType === 'video-prompt-optimizer';
  const plain = !isOptimizer;
  const upstream = textSources.map(source => source.content?.trim()).filter(Boolean).join('\n\n');
  const mediaSources = sortStudioMediaReferences(
    sources.filter(source => canReference(source) || canReferenceVideo(source)),
    node.studioRaw?.settings,
    source => source.videoUrl || source.imageUrl,
  );
  const usesResponses = model.startsWith('openai-responses:') || getMultimodalClientOverrides(model).apiFormat === 'openai-responses';
  const canRun = Boolean(node.textPrompt?.trim() || upstream || mediaSources.length);
  const dispatchHighlightRef = (nodeId: string | null) => {
    window.dispatchEvent(new CustomEvent('canvas:highlight-ref-node', { detail: { nodeId } }));
  };

  const mediaReferenceUrls = useMemo(
    () => mediaSources.map((s) => s.videoUrl || s.imageUrl).filter((u): u is string => Boolean(u)),
    [mediaSources],
  );
  const mediaReferenceVideoFlags = useMemo(() => mediaSources.map(canReferenceVideo), [mediaSources]);
  const mixedReferenceOrder = Boolean((node.studioRaw?.settings as Record<string, unknown> | undefined)?.beikeStoryboardSceneSourceId);
  const mediaSlots = mediaReferenceSlots(mediaReferenceUrls, mediaReferenceVideoFlags, mixedReferenceOrder);
  const mediaReferenceTitles = useMemo(
    () => mediaSources.map((s) => s.title),
    [mediaSources],
  );
  const textReferenceOptions = useMemo(
    () => textSources.map((s, idx) => ({ id: s.id, token: `@文本${idx + 1}`, title: s.title || `文本 ${idx + 1}` })),
    [textSources],
  );
  const canvasCandidates = useMemo<CanvasMentionCandidate[]>(() => {
    const sourceIds = new Set(sources.map((s) => s.id));
    return nodes
      .filter((n) => n.id !== node.id && !sourceIds.has(n.id) && (canReference(n) || canReferenceVideo(n) || isTextSource(n)))
      .map((n, idx) => ({
        nodeId: n.id,
        isText: isTextSource(n),
        title: n.title || (isTextSource(n) ? `文本节点 ${idx + 1}` : `画布素材 ${idx + 1}`),
        url: n.videoUrl || n.imageUrl, isVideo: canReferenceVideo(n),
      }));
  }, [sources, nodes, node.id]);

  const removeSource = (id: string) => {
    const state = useCanvasStore.getState();
    const current = state.projects.find(project => project.id === projectId);
    const edges = current?.edges?.filter(edge => edge.sourceNodeId === id && edge.targetNodeId === node.id) || [];
    if (edges.length) edges.forEach(edge => state.deleteEdge(projectId, edge.id));
    else onChange({ referenceNodeIds: node.referenceNodeIds?.filter(source => source !== id) });
  };

  const [uploadingReferences, setUploadingReferences] = useState(false);
  const handleUploadReferenceFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || uploadingReferences) return;
    setUploadingReferences(true);
    setError('');
    try {
      await uploadCanvasPromptReferences(projectId, node, files);
    } catch (error) {
      setError(error instanceof Error ? error.message : '参考素材上传失败');
    } finally {
      setUploadingReferences(false);
    }
  };

  useEffect(() => {
    return () => {
      request.current?.abort();
    };
  }, []);

  const openCompilerModal = () => {
    window.dispatchEvent(new CustomEvent('canvas:open-prompt-compiler', { detail: { nodeId: node.id } }));
  };

  const handleVoiceInput = () => {
    type SpeechRecCtor = new () => {
      lang: string;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
    };
    const win = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) { setError('当前浏览器环境暂不支持语音听写'); return; }
    if (dictating) return;
    try {
      const recognition = new SpeechRec();
      recognition.lang = 'zh-CN';
      setDictating(true);
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          const prev = latest.current.textPrompt || '';
          onChange({ textPrompt: prev ? `${prev} ${transcript}` : transcript });
        }
      };
      recognition.onend = () => setDictating(false);
      recognition.onerror = () => setDictating(false);
      recognition.start();
    } catch {
      setDictating(false);
    }
  };

  const generate = async () => {
    if (request.current || busy || node.layerLocked) return;
    const controller = new AbortController();
    request.current = controller;
    const original = node.content;
    setBusy(true);
    setError('');
    try {
      const project = useCanvasStore.getState().projects.find(item => item.id === projectId);
      const workflow = project?.studioScene?.nodes.find(item => item.id === node.id)?.settings as Record<string, unknown> | undefined;
      if (workflow?.beikeTextResultRequired && (workflow.beikeStoryboardSceneSourceId || node.id.endsWith('-analysis'))) {
        if (!studioCommands?.runText) throw new Error('画布运行器尚未就绪，请重新打开画布');
        await studioCommands.runText(node.id, controller.signal);
        return;
      }
      const promptPrefix = isOptimizer
        ? `[视频提示词编译器 · 目标分镜数:${shotCount} · 单镜时长:${shotDuration}s]\n`
        : '';
      const instruction = [upstream && `上游文本：\n${upstream}`, node.textPrompt || ''].filter(Boolean).join('\n\n');
      const data = await requestCanvasText(
        async () => {
          validateNativeCommerceInputs(useCanvasStore.getState().projects.find(item => item.id === projectId), node.id);
          const overrides = getMultimodalClientOverrides(model);
          if (!plain) return { model: upstreamModel, prompt: `${promptPrefix}${instruction}`, ...overrides };
          const content: Array<Record<string, unknown>> = [
            { type: 'text', text: `根据以下要求生成可直接使用的文字，仅返回正文。\n\n${instruction || '描述所连接的素材。'}` },
          ];
          for (const source of mediaSources) {
            const video = canReferenceVideo(source);
            const url = video ? source.videoUrl : source.imageUrl;
            if (!url) continue;
            if (video && usesResponses) throw new Error('当前文本模型不接受视频参考，请换用支持视频的模型');
            const part = video ? 'video_url' : 'image_url';
            const sourceURL = new URL(url, location.origin);
            const forceBase64 = Boolean(node.textBase64Image && !video);
            const reference = (sourceURL.origin === location.origin || forceBase64)
              ? await mediaData(url, video ? 'video' : 'image', controller.signal)
              : sourceURL.href;
            content.push({ type: part, [part]: { url: reference } });
          }
          const activeEffort = node.textReasoningEffort && node.textReasoningEffort !== 'auto'
            ? (node.textReasoningEffort === 'xhigh' || node.textReasoningEffort === 'max' ? 'high' : node.textReasoningEffort)
            : undefined;
          return {
            model: upstreamModel, ...overrides, ...(usesResponses ? { apiFormat: 'openai-responses' } : {}),
            messages: [{ role: 'user', content }],
            ...(activeEffort ? { reasoning_effort: activeEffort } : {}),
            ...((usesResponses || node.textWebSearch) && node.textWebSearch ? { canvasWebSearch: true } : {}),
          };
        },
        {
          usageModel: model,
          projectId, nodeId: node.id, runId: crypto.randomUUID(),
          previousOperationId: node.textOperationId, recoveryOnly: node.textRecoveryRequired,
          onOperation: async (id) => { onChange({ textOperationId: id, textRecoveryRequired: true }); await saveCanvasProjects(); },
        },
        controller.signal,
      );
      if (latest.current.content !== original || latest.current.layerLocked) {
        throw new Error('正文已修改或节点已锁定，未覆盖当前内容');
      }
      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      const result = typeof data.text === 'string' ? data.text : choices?.[0]?.message?.content;
      if (!result?.trim()) throw new Error('模型没有返回可显示的正文');
      onChange({ content: result, textHtml: undefined, textRecoveryRequired: false });
      await saveCanvasProjects();
    } catch (cause) {
      if (cause instanceof Error && 'submissionRejected' in cause) onChange({ textRecoveryRequired: false });
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '文本生成失败');
    } finally {
      request.current = null;
      setBusy(false);
    }
  };

  const handlePolishPrompt = async () => {
    const raw = (node.textPrompt || '').trim();
    if (!raw || polishing || busy || node.layerLocked) return;
    setPolishing(true);
    try {
      const overrides = getMultimodalClientOverrides(model);
      const controller = new AbortController();
      const data = await requestCanvasText(
        async () => ({
          model: upstreamModel,
          ...overrides,
          prompt: `请将以下指令润色为更加清晰、具体、结构化的中文提示词，直接输出润色后的内容，不要添加额外解释：\n\n${raw}`,
        }),
        { usageModel: model, projectId, nodeId: node.id, runId: crypto.randomUUID() },
        controller.signal,
      );
      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      const result = (typeof data.text === 'string' ? data.text : choices?.[0]?.message?.content)?.trim();
      if (result) onChange({ textPrompt: result });
    } catch {
      // 静默回退
    } finally {
      setPolishing(false);
    }
  };

  return (
    <div
      ref={anchor}
      className="relative rounded-[18px] bg-white dark:bg-[#1f1f1f]"
    >
      <div className="absolute -top-6 left-0 right-0 z-20 flex items-center gap-1.5 px-0.5 text-xs font-medium text-zinc-600 dark:text-[rgba(245,245,245,0.6)] select-none">
        {isOptimizer ? <Sparkles size={14} className="shrink-0 text-amber-500" /> : <AlignLeft size={14} className="shrink-0 text-zinc-400" />}
        <span className="truncate">{node.title || (isOptimizer ? '视频提示词优化' : '文本')}</span>
        {(node.colorPins?.length ?? 0) > 0 && (
          <span className="ml-0.5 inline-flex items-center gap-1">
            {node.colorPins!.map((color) => (
              <span
                key={color}
                className="h-2 w-2 rounded-full border border-black/15 dark:border-white/25"
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
        )}
      </div>
      <CanvasRichTextEditor referenceStyle={plain} node={node} selected={selected} busy={busy} onChange={onChange} onMessage={setError} />
      {selected && (
        <CanvasDrawingEditor
          anchor={anchor}
          className="rounded-[22px] border border-slate-200/90 dark:border-white/[0.08] bg-white/98 dark:bg-[#1b1b1e]/98 px-5 pt-4 pb-3.5 shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.75)] text-slate-700 dark:text-zinc-100 backdrop-blur-xl"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {isOptimizer && (
            <div className="beike-compiler-parameters mb-2.5 border-b border-slate-100 dark:border-white/10 pb-2 text-slate-700 dark:text-zinc-200">
              <div className="beike-compiler-parameter">
                <span>分镜数</span>
                <input type="number" min={1} max={12} value={shotCount} onChange={(e) => setShotCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
              </div>
              <div className="beike-compiler-parameter">
                <span>时长(秒)</span>
                <input type="number" min={2} max={15} value={shotDuration} onChange={(e) => setShotDuration(Math.max(2, Math.min(15, Number(e.target.value) || 5)))} />
              </div>
              <button type="button" onClick={openCompilerModal} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-[#f5d0b9] hover:bg-amber-500/20 cursor-pointer">
                <SlidersHorizontal size={12} />
                <span>打开手工编译</span>
              </button>
            </div>
          )}

          {plain && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleUploadReferenceFiles} />

              {mediaSources.map((source, idx) => {
                const slot = mediaSlots[idx];
                return (
                  <div
                    key={source.id}
                    onMouseEnter={() => dispatchHighlightRef(source.id)}
                    onMouseLeave={() => dispatchHighlightRef(null)}
                    className="group relative size-11 shrink-0 rounded-[12px] border border-slate-200 dark:border-white/15 bg-slate-100 dark:bg-[#2a2a2e]"
                    title={[slot.name, source.title].filter(Boolean).join(' · ')}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-1 top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/65 px-1 text-[10px] font-semibold leading-none text-white backdrop-blur-xs"
                    >
                      {slot.name}
                    </span>
                    <button
                      type="button"
                      disabled={busy || node.layerLocked}
                      onMouseDown={(e) => e.preventDefault()}
                      aria-label={`引用${slot.name}`} onClick={() => promptInputRef.current?.insertReference(idx)}
                      className="h-full w-full overflow-hidden rounded-[9px] cursor-pointer"
                    >
                      <CanvasPromptReferenceThumbnail key={slot.url} url={slot.url} poster={source.imageUrl} isVideo={mediaReferenceVideoFlags[idx]} />
                    </button>
                    <button
                      type="button" disabled={busy || node.layerLocked} aria-label={`断开 ${source.title || '上游节点'}`}
                      onClick={() => { dispatchHighlightRef(null); removeSource(source.id); }}
                      className="absolute -right-1 -top-1 z-10 hidden h-4 w-4 items-center justify-center rounded-full bg-black/85 text-white group-hover:flex cursor-pointer"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}

              {textSources.map((source, idx) => (
                <div
                  key={source.id}
                  onMouseEnter={() => dispatchHighlightRef(source.id)}
                  onMouseLeave={() => dispatchHighlightRef(null)}
                  title={source.title || `点击引用 文本 ${idx + 1}`}
                  className="group relative flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-slate-200 dark:border-white/15 bg-slate-100 dark:bg-[#2a2a2e] text-slate-600 dark:text-zinc-200"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1 top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/65 px-1 text-[10px] font-semibold leading-none text-white backdrop-blur-xs"
                  >
                    文本{idx + 1}
                  </span>
                  <button
                    type="button"
                    disabled={busy || node.layerLocked}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label={`引用文本${idx + 1}`} onClick={() => promptInputRef.current?.insertToken(`@文本${idx + 1}`)}
                    className="flex h-full w-full items-center justify-center rounded-[9px] cursor-pointer"
                  >
                    <AlignLeft size={15} />
                    <span className="sr-only">{source.title || '上游节点'}</span>
                  </button>
                  <button
                    type="button" disabled={busy || node.layerLocked} aria-label={`断开 ${source.title || '上游节点'}`}
                    onClick={() => { dispatchHighlightRef(null); removeSource(source.id); }}
                    className="absolute -right-1 -top-1 z-10 hidden h-4 w-4 items-center justify-center rounded-full bg-black/85 text-white group-hover:flex cursor-pointer"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}

              <button
                type="button" aria-label="添加参考素材" title="上传或添加参考素材" disabled={busy || uploadingReferences || node.layerLocked}
                onClick={() => fileInputRef.current?.click()}
                className="flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-slate-200/80 dark:border-white/[0.08] bg-slate-100 dark:bg-[#2a2a2e] text-slate-500 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-[#333338] hover:text-slate-800 dark:hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Plus size={17} />
              </button>

              {upstream && (
                <button type="button" aria-label="预览上游文本" title="预览上游文本" aria-pressed={showUpstream} onClick={() => setShowUpstream(value => !value)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/10 cursor-pointer">
                  {showUpstream ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              )}
            </div>
          )}

          {plain && showUpstream && upstream && (
            <pre aria-label="上游文本" className="mb-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-100 dark:bg-white/[0.06] p-2.5 font-sans text-xs text-slate-700 dark:text-zinc-200">{upstream}</pre>
          )}

          <CanvasPromptInput
            ref={promptInputRef}
            ariaLabel="文本生成要求"
            value={node.textPrompt || ''}
            references={mediaReferenceUrls}
            referenceTitles={mediaReferenceTitles}
            referenceVideoFlags={mediaReferenceVideoFlags}
            mixedReferenceOrder={mixedReferenceOrder}
            referenceNodeIds={mixedReferenceOrder ? mediaSources.map(source => source.id) : undefined}
            textReferences={textReferenceOptions}
            canvasCandidates={canvasCandidates}
            disabled={busy || node.layerLocked}
            placeholder={
              isOptimizer
                ? '描述分镜意图或运镜要求，结合上游参考图生成专业视频提示词…'
                : '描述任何你想要生成的内容；输入 @ 打开我的资产库'
            }
            onChange={(nextValue) => onChange({ textPrompt: nextValue })}
            onSubmit={() => {
              if (canRun && !busy && !node.layerLocked) void generate();
            }}
            onConnectCandidate={(cand) => {
              useCanvasStore.getState().addEdge(projectId, { sourceNodeId: cand.nodeId, targetNodeId: node.id });
            }}
            onRequestUpload={() => fileInputRef.current?.click()}
          />

          {error && <p role="status" className="mb-2 text-xs text-rose-500 dark:text-rose-400">{error}</p>}

          <div className="mt-1 flex flex-wrap items-center gap-1.5 pt-1">
            <CanvasModelPicker
              models={modelOptions}
              value={model}
              onChange={(nextModel) => onChange({ textModel: nextModel })}
              disabled={busy || node.layerLocked}
              label="文本模型"
            />
            {plain && (
              <PromptBarReasoningPill
                assistantModel={matchedModel?.modelId || model}
                isUp={true}
                disabled={busy || node.layerLocked}
                value={node.textReasoningEffort}
                onChange={(nextEffort) => onChange({ textReasoningEffort: nextEffort })}
              />
            )}

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label="AI 润色提示词"
                title={polishing ? '正在润色…' : 'AI 润色提示词'}
                disabled={busy || polishing || node.layerLocked || !(node.textPrompt || '').trim()}
                onClick={() => void handlePolishPrompt()}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" className={polishing ? 'animate-spin' : ''}>
                  <path d="M8 2.2C8.45 5.45 10.55 7.55 13.8 8C10.55 8.45 8.45 10.55 8 13.8C7.55 10.55 5.45 8.45 2.2 8C5.45 7.55 7.55 5.45 8 2.2Z" />
                </svg>
              </button>
              <button
                type="button" aria-label="语音输入" title={dictating ? '正在听写…' : '语音输入'} aria-pressed={dictating} disabled={busy || node.layerLocked} onClick={handleVoiceInput}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer ${
                  dictating ? 'bg-rose-500/20 text-rose-400' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
                } disabled:opacity-40`}
              >
                <Mic size={15} />
              </button>
              <button
                type="button" aria-label="生成文本" title={node.content ? '生成并替换正文' : '生成文本'}
                disabled={busy || node.layerLocked || (!node.textRecoveryRequired && (!canRun || !model))}
                onClick={() => void generate()}
                className="flex h-9 min-w-9 items-center justify-center rounded-full bg-slate-900 dark:bg-white px-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-slate-800 dark:hover:bg-zinc-200 disabled:bg-slate-200 dark:disabled:bg-white/15 disabled:text-slate-400 dark:disabled:text-zinc-500 transition-colors cursor-pointer"
              >
                {busy ? '生成中…' : node.textRecoveryRequired ? '查询回执' : <ArrowUp size={17} strokeWidth={2.4} />}
              </button>
            </div>
          </div>
        </CanvasDrawingEditor>
      )}
    </div>
  );
}
export default CanvasPromptNode;
