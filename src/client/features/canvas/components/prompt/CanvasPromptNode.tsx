import { batchCoverLayouts, batchCoverSkill, coverLayoutInstructions, coverPromptFormat, formatCoverSkillReply, isCurrentCoverTextOperation, newCoverTextOperationId, validateCoverPromptFormat } from '../../model/coverBatch';
import { sortStudioMediaReferences } from '../../model/studioConnections';
import { mediaReferenceSlots } from '@client/shared/media/videoReferences';
import { NativeStudioCommandsContext } from '../../hooks/useNativeStudioCommands';
import { loadCanvasChatModels, mediaData, resolveCanvasChatModel } from '../../model/canvasNodeFactory';
import { commerceBriefPlaceholder, validateNativeCommerceInputs } from '../../model/creativeWorkflowProjects';
import { CanvasDrawingEditor, CanvasRichTextEditor } from '../editor/CanvasNodeMenu';
import { CanvasModelPicker } from '../tools/CanvasGridSplit';
import { CanvasPromptInput, CanvasPromptReferenceThumbnail, uploadCanvasPromptReferences, type CanvasMentionCandidate, type CanvasPromptInputRef } from './CanvasPromptInput';
import { useContext, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlignLeft, ArrowUp, Eye, EyeOff,
  Plus, Sparkles, SlidersHorizontal, X,
} from 'lucide-react';
import { requestCanvasText } from '../../model/canvasTextRequest';
import { saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { PromptBarReasoningPill } from '@client/shared/prompt-bar/controls/PromptBarReasoningPill';
import { DEFAULT_MULTIMODAL_MODEL_ID } from '@shared/domain/models/modelCatalog';
import { canReference, canReferenceVideo, isTextSource } from '../../model/canvasGraph';
import type { CanvasNode } from '../../model/types';

function formatCoverPrompt(text: string) {
  return text.trim().replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
}

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
  const [action, setAction] = useState<'generate' | 'recover' | null>(null);
  const busy = action !== null;
  const [error, setError] = useState('');
  const [showUpstream, setShowUpstream] = useState(false);
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

  const isCoverWriter = node.studioSubType === 'cover-prompt-writer';
  const isOptimizer = node.studioSubType === 'video-prompt-optimizer';
  const plain = !isOptimizer;
  const generateLabel = node.textRecoveryRequired
    ? (isCoverWriter ? '查询封面提示词回执' : '查询回执')
    : (isCoverWriter ? '撰写封面提示词' : '生成文本');
  const busyLabel = action === 'recover' ? '查询回执中…' : '生成中…';
  const upstream = textSources.map(source => source.content?.trim()).filter(value => value && (!isCoverWriter || value !== commerceBriefPlaceholder)).join('\n\n');
  const { mediaSources, styleReference } = useMemo(() => {
    const ordered = sortStudioMediaReferences(
      sources.filter(source => canReference(source) || canReferenceVideo(source)),
      node.studioRaw?.settings,
      source => source.videoUrl || source.imageUrl,
    );
    const style = isCoverWriter ? ordered.find(source => Boolean(source.imageUrl) && !source.videoUrl &&
      (source.id === projectId + '-reference' || (source.id.endsWith('-reference') &&
        sources.some(item => item.id === source.id.replace(/-reference$/, '-product'))))) : undefined;
    return { styleReference: style, mediaSources: style ? [...ordered.filter(source => source !== style), style] : ordered };
  }, [isCoverWriter, projectId, node.studioRaw?.settings, sources]);
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

  const generate = async () => {
    if (request.current || busy || node.layerLocked) return;
    const controller = new AbortController();
    request.current = controller;
    const original = node.content;
    setAction(node.textRecoveryRequired ? 'recover' : 'generate');
    setError('');
    try {
      const project = useCanvasStore.getState().projects.find(item => item.id === projectId);
      const workflow = project?.studioScene?.nodes.find(item => item.id === node.id)?.settings as Record<string, unknown> | undefined;
      if (workflow?.beikeBatchCoverWriter === true ||
          (workflow?.beikeTextResultRequired && (workflow.beikeStoryboardSceneSourceId || node.id.endsWith('-analysis')))) {
        if (!studioCommands?.runText) throw new Error('画布运行器尚未就绪，请重新打开画布');
        await studioCommands.runText(node.id, controller.signal, node.textRecoveryRequired);
        return;
      }
      const promptPrefix = isOptimizer
        ? `[视频提示词编译器 · 目标分镜数:${shotCount} · 单镜时长:${shotDuration}s]\n`
        : '';
      const instruction = [upstream && `上游文本：\n${upstream}`, node.textPrompt || ''].filter(Boolean).join('\n\n');
      const coverSkill = isCoverWriter ? batchCoverSkill : undefined;
      const previousLayout = isCoverWriter && isCurrentCoverTextOperation(node.coverPromptOperationId) && (!node.coverSourceUrl || node.coverSourceUrl === mediaSources[0]?.imageUrl)
        ? original?.match(/^画幅与构图[：:][^\n]*\b(PHONE-\d{2})\b/im)?.[1]?.toUpperCase()
        : undefined;
      const requestedLayout = node.textPrompt?.match(/(?:^|\n)\s*(?:版式[：:]|(?:请)?(?:使用|用|指定))\s*(PHONE-\d{2})\b/im)?.[1]?.toUpperCase();
      if (isCoverWriter && requestedLayout && !batchCoverLayouts.some(layout => layout.id === requestedLayout)) {
        throw new Error('没有找到这个手机版式编号');
      }
      const selection = { offset: 0, preferred: requestedLayout, previous: previousLayout };
      let resolvedOperationId: string | undefined;
      const lockedTitle = [node.textPrompt, upstream].filter(Boolean).map(source => (source || '').split(/\r?\n/)
        .flatMap(line => /^(?:主标题|副标题)[：:]\s*(.+)$/.exec(line.trim())?.[1] ?? []).join('')).find(Boolean);
      const data = await requestCanvasText(
        async () => {
          validateNativeCommerceInputs(useCanvasStore.getState().projects.find(item => item.id === projectId), node.id);
          const overrides = getMultimodalClientOverrides(model);
          if (!plain && !isCoverWriter) return { model: upstreamModel, prompt: `${promptPrefix}${instruction}`, ...overrides };
          if (isCoverWriter && (!coverSkill || mediaSources.length !== (styleReference ? 2 : 1) ||
              !mediaSources[0].imageUrl || mediaSources[0].videoUrl)) {
            throw new Error('请连接一张目标商品图');
          }
          const content: Array<Record<string, unknown>> = [
            { type: 'text', text: `根据以下要求生成可直接使用的文字，仅返回正文。\n\n${instruction || '描述所连接的素材。'}${coverSkill && mediaSources[0].originalFileName ? `\n商品原文件名（仅作原标题线索）：${mediaSources[0].originalFileName}` : ''}` },
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
            messages: [
              ...(coverSkill ? [{ role: 'system', content: [
                coverSkill.prompt,
                coverPromptFormat,
                coverLayoutInstructions(selection.offset, selection.preferred, selection.previous),
                styleReference && '第二张图片是用户提供的风格参考，只观察排版、光线和色调。商品品类、可见面和外观一律以第一张商品图为准。在正文只用 @图片1 指代商品，生成阶段将另行接入目录中选定的版式样张。',
                '当前仅执行画布提示词撰写。按上面的 JSON 字段填写完整的绘图设计。titleLines 按实际排版逐行填写，每行只列一次。以 @图片1 指代本次商品图。优先沿用用户提供的原标题主题，其次从文件名提取主题线索。体验或售后只有被选为本次唯一主线时才可写成中性问题，不当成事实。自动改写时副标题只补充同一主题，缺少关联信息就省略。不要用构图中的拍摄方式替换原标题主题。若用户以「主标题：」或「副标题：」指定上图文字，逐字保留相应文案。自动改写时用主题短句作为主标题，型号优先放小字，不补「性能旗舰」等无依据标签。输入不足或商品有歧义时，在 JSON 的 error 字段说明原因。在 layout 字段填写实际选择的 PHONE 编号，供下次换版识别，编号不是上图文字。禁止输出文件名或代码围栏。',
              ].filter(Boolean).join('\n\n') }] : []),
              { role: 'user', content },
            ],
            ...(coverSkill ? { response_format: { type: 'json_object' }, max_tokens: 8192 } : {}),
            ...(activeEffort ? { reasoning_effort: activeEffort } : {}),
            ...((usesResponses || node.textWebSearch) && node.textWebSearch ? { canvasWebSearch: true } : {}),
          };
        },
        {
          usageModel: model,
          projectId, nodeId: node.id, runId: coverSkill ? newCoverTextOperationId() : crypto.randomUUID(),
          previousOperationId: node.textOperationId, recoveryOnly: node.textRecoveryRequired,
          acceptSettledIncomplete: isCoverWriter,
          closeMissingReceipt: isCoverWriter,
          onOperation: async (id) => {
            resolvedOperationId = id;
            if (node.textOperationId === id && node.textRecoveryRequired) return;
            onChange({ textOperationId: id, textRecoveryRequired: true });
            await saveCanvasProjects();
          },
        },
        controller.signal,
      );
      onChange({ textRecoveryRequired: false });
      if (latest.current.content !== original || latest.current.layerLocked) {
        throw new Error('正文已修改或节点已锁定，未覆盖当前内容');
      }
      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      const result = typeof data.text === 'string' ? data.text : choices?.[0]?.message?.content;
      if (!result?.trim()) throw new Error('模型没有返回可显示的正文');
      if (isCoverWriter && result.trim().startsWith('NEED_INPUT:')) {
        onChange({ textRecoveryRequired: false });
        throw new Error(result.trim().slice('NEED_INPUT:'.length).trim());
      }
      const formatted = isCoverWriter ? formatCoverSkillReply(result, lockedTitle, selection) : result;
      if (isCoverWriter) {
        if (!isCurrentCoverTextOperation(resolvedOperationId)) {
          await saveCanvasProjects();
          throw new Error('旧版提示词回执已核对，请重新撰写以使用新版素材');
        }
        validateCoverPromptFormat(formatted, lockedTitle);
      }
      const coverPrompt = isCoverWriter && !/@图片1(?!\d)/.test(formatted)
        ? `以 @图片1 为商品外观基准，保留实物结构和配色。\n\n${formatted}` : formatted;
      onChange({ content: coverPrompt, status: 'success', ...(isCoverWriter ? { coverSourceUrl: mediaSources[0]?.imageUrl, coverPromptOperationId: resolvedOperationId } : {}), textHtml: undefined, textRecoveryRequired: false });
      await saveCanvasProjects();
    } catch (cause) {
      if (cause instanceof Error && ('submissionRejected' in cause || 'submissionSettled' in cause)) {
        onChange({ textRecoveryRequired: false, status: 'error', errorMessage: cause.message });
        await saveCanvasProjects();
      }
      if (!controller.signal.aborted) setError(cause instanceof Error ? (isCoverWriter ? cause.message.replace('原文本或05分析结果', '封面提示词结果') : cause.message) : '文本生成失败');
    } finally {
      request.current = null;
      setAction(null);
    }
  };

  return (
    <div
      ref={anchor}
      className="relative rounded-[18px] bg-white dark:bg-[#1f1f1f]"
    >
      <div className="absolute -top-6 left-0 right-0 z-20 flex items-center gap-1.5 px-0.5 text-xs font-medium text-zinc-600 dark:text-[rgba(245,245,245,0.6)] select-none">
        {isOptimizer || isCoverWriter ? <Sparkles size={14} className="shrink-0 text-amber-500" /> : <AlignLeft size={14} className="shrink-0 text-zinc-400" />}
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
          {isCoverWriter && node.content && formatCoverPrompt(node.content ?? "") !== node.content && (
            <button
              type="button"
              disabled={busy || node.layerLocked}
              className="mb-2 text-xs text-amber-600 hover:underline disabled:opacity-50 dark:text-amber-400"
              onClick={() => onChange({ content: formatCoverPrompt(node.content ?? ""), textHtml: undefined })}
            >
              整理提示词断行
            </button>
          )}
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
                : isCoverWriter ? '可填原标题供改写，或输入「主标题：…」「副标题：…」指定上图文案' : '描述任何你想要生成的内容；输入 @ 打开我的资产库'
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
          {action === 'recover' && <p role="status" className="mb-2 text-xs text-slate-500 dark:text-zinc-400">正在查询原任务，完成后会显示结果</p>}

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

            {isCoverWriter && (
              <span
                title={`封面提示词 Skill v${batchCoverSkill?.version || ''}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400"
              >
                <Sparkles size={12} className="shrink-0" />
                <span className="truncate">封面提示词 Skill v{batchCoverSkill?.version}</span>
              </span>
            )}
            {isCoverWriter && node.textRecoveryRequired && !busy && <span role="status" className="text-xs text-slate-500 dark:text-zinc-400">等待原请求回执</span>}

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button" aria-label={busy ? busyLabel : generateLabel}
                title={busy ? busyLabel : !isCoverWriter && !node.textRecoveryRequired && node.content ? '生成并替换正文' : generateLabel}
                disabled={busy || node.layerLocked || (!node.textRecoveryRequired && (!canRun || !model))}
                onClick={() => void generate()}
                className="flex h-9 min-w-9 items-center justify-center rounded-full bg-slate-900 dark:bg-white px-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-slate-800 dark:hover:bg-zinc-200 disabled:bg-slate-200 dark:disabled:bg-white/15 disabled:text-slate-400 dark:disabled:text-zinc-500 transition-colors cursor-pointer"
              >
                {busy ? busyLabel : isCoverWriter || node.textRecoveryRequired ? generateLabel : <ArrowUp size={17} strokeWidth={2.4} />}
              </button>
            </div>
          </div>
        </CanvasDrawingEditor>
      )}
    </div>
  );
}
export default CanvasPromptNode;
