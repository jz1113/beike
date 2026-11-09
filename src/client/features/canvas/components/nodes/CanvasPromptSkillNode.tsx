import { sortStudioMediaReferences } from '../../model/studioConnections';
import { mediaReferenceSlots } from '@client/shared/media/videoReferences';
import { NativeStudioCommandsContext } from '../../hooks/useNativeStudioCommands';
import { useContext, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlignLeft, ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, Columns2, Copy,
  FileDiff, FileText, Loader2, Plus, RotateCcw, Sparkles, WandSparkles, X,
} from 'lucide-react';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { AssistantSkillCardIcon } from '@client/shared/icons/assistant/AssistantIcons';
import { PromptBarReasoningPill } from '@client/shared/prompt-bar/controls/PromptBarReasoningPill';
import {
  resolveVideoPromptSkill, videoPromptMessages, videoPromptSkill, type VideoPromptInput,
} from '@shared/domain/assistant/skills/videoPromptSkills';
import { DEFAULT_MULTIMODAL_MODEL_ID } from '@shared/domain/models/modelCatalog';
import { canReference, canReferenceVideo, isTextSource } from '../../model/canvasGraph';
import { buildQuickCanvasNode, loadCanvasChatModels, mediaData, resolveCanvasChatModel } from '../../model/canvasNodeFactory';
import { requestCanvasText } from '../../model/canvasTextRequest';
import type { CanvasNode } from '../../model/types';
import { saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import { CanvasDrawingEditor } from '../editor/CanvasNodeMenu';
import { CanvasPromptInput, CanvasPromptReferenceThumbnail, uploadCanvasPromptReferences, type CanvasMentionCandidate, type CanvasPromptInputRef } from '../prompt/CanvasPromptInput';
import { CanvasModelPicker } from '../tools/CanvasGridSplit';
import { CanvasUnifiedVideoControls } from '../video/CanvasVideoPlayer';
import { VideoPromptSkillDetails } from '../video/StudioStoryboardDialog';

export interface PromptSkillCatalogItem {
  id: string;
  label: string;
  modelId: string;
  skillId: string;
  defaultMode: 'first_frame' | 'omni' | 'text';
  tag: string;
}

export const PROMPT_SKILL_CATALOG: PromptSkillCatalogItem[] = [
  { id: 'wan3.0-video', label: 'Wan 3.0 官方提示词整理', modelId: 'wan3.0-video', skillId: 'alibaba-wan-video-prompt', defaultMode: 'omni', tag: '全能/分镜' },
  { id: 'doubao-seedance-2.0', label: 'Seedance 2.0 导演级分镜', modelId: 'doubao-seedance-2.0', skillId: 'volcengine-seedance-2-prompt', defaultMode: 'omni', tag: '多模态参考' },
  { id: 'doubao-seedance-2.5', label: 'Seedance 2.5 音画叙事编排', modelId: 'doubao-seedance-2.5', skillId: 'volcengine-seedance-2-prompt', defaultMode: 'omni', tag: '超长分镜' },
  { id: 'veo3.1', label: 'Google Veo 3.1 电影级运镜', modelId: 'veo3.1', skillId: 'google-veo-prompt', defaultMode: 'first_frame', tag: '声画同步' },
  { id: 'kling-video-v3', label: '可灵 3.0 运动与物理细化', modelId: 'kling-video-v3', skillId: 'kling-video-prompt', defaultMode: 'first_frame', tag: '运镜/物理' },
  { id: 'kling-video-v3-omni', label: '可灵 3.0 Omni 多主体参考', modelId: 'kling-video-v3-omni', skillId: 'kling-video-prompt', defaultMode: 'omni', tag: '多图/视频' },
  { id: 'viduq3-turbo', label: 'Vidu Q3 主体一致性编排', modelId: 'viduq3-turbo', skillId: 'shengshu-vidu-prompt', defaultMode: 'omni', tag: '多图参考' },
  { id: 'viduq4-preview', label: 'Vidu Q4 影视级镜头语法', modelId: 'viduq4-preview', skillId: 'shengshu-vidu-prompt', defaultMode: 'omni', tag: '高清多参' },
  { id: 'MiniMax-H3', label: '海螺 / H3 情绪与镜头调度', modelId: 'MiniMax-H3', skillId: 'minimax-hailuo-video-prompt', defaultMode: 'first_frame', tag: '微表情/表演' },
  { id: 'grok-imagine-video-1.5', label: 'Grok 1.5 动态视觉与音色', modelId: 'grok-imagine-video-1.5', skillId: 'openai-sora-2-prompt', defaultMode: 'omni', tag: '音画一体' },
  { id: 'sora-2', label: 'OpenAI Sora 2 连续时空叙事', modelId: 'sora-2', skillId: 'openai-sora-2-prompt', defaultMode: 'text', tag: '叙事镜头' },
];

export interface DiffToken {
  type: 'same' | 'added' | 'removed';
  text: string;
}

export function computePromptDiff(beforeText: string, afterText: string): DiffToken[] {
  const a = beforeText.trim();
  const b = afterText.trim();
  if (!a && !b) return [];
  if (!a) return [{ type: 'added', text: b }];
  if (!b) return [{ type: 'removed', text: a }];
  if (a === b) return [{ type: 'same', text: b }];

  const tokenize = (str: string) =>
    str.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_@]+|\s+|[^\s\u4e00-\u9fa5a-zA-Z0-9_@]+/g) || [];

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const m = tokensA.length;
  const n = tokensB.length;

  if (m * n > 90000) {
    return [
      { type: 'removed', text: a },
      { type: 'added', text: b },
    ];
  }

  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (tokensA[i] === tokensB[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const raw: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (tokensA[i] === tokensB[j]) {
      raw.push({ type: 'same', text: tokensA[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: 'removed', text: tokensA[i] });
      i++;
    } else {
      raw.push({ type: 'added', text: tokensB[j] });
      j++;
    }
  }
  while (i < m) raw.push({ type: 'removed', text: tokensA[i++] });
  while (j < n) raw.push({ type: 'added', text: tokensB[j++] });

  const merged: DiffToken[] = [];
  for (const item of raw) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === item.type) prev.text += item.text;
    else merged.push({ ...item });
  }
  return merged;
}

function dispatchHighlightRef(nodeId: string | null) {
  window.dispatchEvent(new CustomEvent('canvas:highlight-ref-node', { detail: { nodeId } }));
}

interface Props {
  node: CanvasNode;
  nodes: CanvasNode[];
  projectId: string;
  selected: boolean;
  onChange: (updates: Partial<CanvasNode>) => void;
}

export function CanvasPromptSkillNode({ node, nodes, projectId, selected, onChange }: Props) {
  const anchor = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skillMenuRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<CanvasPromptInputRef>(null);
  const request = useRef<AbortController | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [compareTab, setCompareTab] = useState<'diff' | 'split' | 'final'>('diff');
  const [copied, setCopied] = useState(false);
  const [editingCard, setEditingCard] = useState(false);

  useEffect(() => {
    if (!selected || node.layerLocked) setEditingCard(false);
  }, [selected, node.layerLocked]);

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
  const sources = useMemo(
    () => (node.referenceNodeIds || []).map((id) => nodes.find((item) => item.id === id)).filter((item): item is CanvasNode => Boolean(item)),
    [node.referenceNodeIds, nodes],
  );
  const textSources = useMemo(() => sources.filter(isTextSource), [sources]);
  const matchedLlm = resolveCanvasChatModel(modelOptions, node.textModel, textSources.find((s) => s.textModel)?.textModel);
  const llmModel = matchedLlm?.id || node.textModel || DEFAULT_MULTIMODAL_MODEL_ID;
  const upstreamLlmModel = matchedLlm?.modelId || llmModel;

  const targetVideoModel = node.drawing?.model || node.promptOptimization?.videoModel || 'wan3.0-video';
  const activeSkillItem = useMemo(
    () => PROMPT_SKILL_CATALOG.find((item) => item.id === targetVideoModel || item.modelId.toLowerCase() === targetVideoModel.toLowerCase()) || PROMPT_SKILL_CATALOG[0],
    [targetVideoModel],
  );

  const videoMode = (node.drawing?.refMode as 'first_frame' | 'omni' | 'text' | undefined) || activeSkillItem.defaultMode;
  const videoDuration = node.drawing?.duration || 5;
  const videoAspect = node.drawing?.aspect || '16:9';
  const videoResolution = node.drawing?.quality || '720P';
  const videoAudio = node.drawing?.audio !== false;

  const resolvedSkill = useMemo(
    () => videoPromptSkill(activeSkillItem.modelId, videoMode) || resolveVideoPromptSkill(activeSkillItem.skillId, activeSkillItem.modelId, videoMode),
    [activeSkillItem, videoMode],
  );

  const mediaSources = useMemo(() => sortStudioMediaReferences(
    sources.filter(item => canReference(item) || canReferenceVideo(item)),
    node.studioRaw?.settings,
    source => source.videoUrl || source.imageUrl,
  ), [sources, node.studioRaw?.settings]);
  const imageSources = useMemo(() => mediaSources.filter((item) => !canReferenceVideo(item)), [mediaSources]);
  const videoSources = useMemo(() => mediaSources.filter(canReferenceVideo), [mediaSources]);
  const audioSources = useMemo(() => sources.filter((item) => item.type === 'audio' || Boolean(item.audioUrl)), [sources]);

  const downstreamVideoNodes = useMemo(
    () =>
      nodes.filter(
        (candidate) =>
          candidate.id !== node.id &&
          (candidate.generationKind === 'video' || candidate.type === 'video' || candidate.studioSubType === 'motion-control') &&
          (candidate.referenceNodeIds || []).includes(node.id),
      ),
    [nodes, node.id],
  );

  const upstreamText = useMemo(() => textSources.map((item) => item.content?.trim()).filter(Boolean).join('\n\n'), [textSources]);

  const rawInputPrompt = useMemo(() => {
    const manual = (node.textPrompt || '')
      .replace(/@\["[^"]*","([^"]+)"\]/g, '@$1')
      .replace(/(?:^|\s)@[^\s@]*$/, '')
      .trim();
    return upstreamText && manual ? `${upstreamText}\n\n${manual}` : upstreamText || manual;
  }, [upstreamText, node.textPrompt]);

  const beforePrompt = node.promptOptimization?.original?.trim() || rawInputPrompt || '';
  const optimizedPrompt = node.promptOptimization?.optimized?.trim() || '';
  const finalPrompt = (node.content || '').trim() || optimizedPrompt || beforePrompt;
  const hasOptimized = Boolean(optimizedPrompt);

  useEffect(() => {
    if (!skillMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (skillMenuRef.current && !skillMenuRef.current.contains(e.target as Node)) setSkillMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [skillMenuOpen]);

  const updateSkillConfig = (patch: Partial<NonNullable<CanvasNode['drawing']>>) => {
    const currentDrawing = node.drawing || {
      model: activeSkillItem.id, quality: videoResolution, aspect: videoAspect,
      count: 1, duration: videoDuration, refMode: videoMode, audio: videoAudio, references: [],
    };
    onChange({ drawing: { ...currentDrawing, ...patch } });
  };

  const removeSource = (id: string) => {
    const state = useCanvasStore.getState();
    const current = state.projects.find((project) => project.id === projectId);
    const edges = current?.edges?.filter((edge) => edge.sourceNodeId === id && edge.targetNodeId === node.id) || [];
    if (edges.length) edges.forEach((edge) => state.deleteEdge(projectId, edge.id));
    else onChange({ referenceNodeIds: node.referenceNodeIds?.filter((source) => source !== id) });
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

  const mediaReferenceUrls = useMemo(() => mediaSources.map((s) => s.videoUrl || s.imageUrl).filter((u): u is string => Boolean(u)), [mediaSources]);
  const mediaReferenceVideoFlags = useMemo(() => mediaSources.map(canReferenceVideo), [mediaSources]);
  const mixedReferenceOrder = Boolean((node.studioRaw?.settings as Record<string, unknown> | undefined)?.beikeStoryboardSceneSourceId);
  const mediaSlots = mediaReferenceSlots(mediaReferenceUrls, mediaReferenceVideoFlags, mixedReferenceOrder);
  const mediaReferenceTitles = useMemo(() => mediaSources.map((s) => s.title), [mediaSources]);
  const textReferenceOptions = useMemo(() => textSources.map((s, idx) => ({ id: s.id, token: `@文本${idx + 1}`, title: s.title || `文本 ${idx + 1}` })), [textSources]);
  const canvasCandidates = useMemo<CanvasMentionCandidate[]>(() => {
    const sourceIds = new Set(sources.map((s) => s.id));
    return nodes
      .filter((n) => n.id !== node.id && !sourceIds.has(n.id) && (canReference(n) || canReferenceVideo(n) || isTextSource(n)))
      .map((n, idx) => ({
        nodeId: n.id, isText: isTextSource(n),
        title: n.title || (isTextSource(n) ? `文本节点 ${idx + 1}` : `画布素材 ${idx + 1}`),
        url: n.videoUrl || n.imageUrl, isVideo: canReferenceVideo(n),
      }));
  }, [sources, nodes, node.id]);

  const studioCommands = useContext(NativeStudioCommandsContext);
  const handleRunSkillOptimize = async () => {
    if (request.current || busy || node.layerLocked) return;
    const workflow = useCanvasStore.getState().projects.find(project => project.id === projectId)
      ?.studioScene?.nodes.find(item => item.id === node.id)?.settings as Record<string, unknown> | undefined;
    if (workflow?.beikePromptCompiler && (workflow.beikeScriptOnly || workflow.beikeStoryboardSceneSourceId)) {
      if (!studioCommands?.runCompiler) { setError('画布运行器尚未就绪，请重新打开画布'); return; }
      setBusy(true);
      setError('');
      try { await studioCommands.runCompiler(node.id); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '提示词优化失败'); }
      finally { setBusy(false); }
      return;
    }
    const sourcePrompt = rawInputPrompt.trim() || (node.content || '').trim();
    if (!sourcePrompt && mediaSources.length === 0) {
      setError('请先连接上游文本/素材，或在下方输入需要优化的提示词与修改要求');
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');

    try {
      const effectiveOriginal =
        sourcePrompt ||
        `根据已连接的 ${imageSources.length} 张参考图${videoSources.length ? `、${videoSources.length} 段参考视频` : ''}，编写符合 ${activeSkillItem.label} 规范的完整视频生成提示词。`;

      const skillInput: VideoPromptInput = {
        model: activeSkillItem.modelId, prompt: effectiveOriginal, mode: videoMode,
        duration: videoDuration, aspect: videoAspect, resolution: videoResolution,
        audio: videoAudio, images: imageSources.length, videos: videoSources.length,
        ...(audioSources.length ? { audios: audioSources.length } : {}),
      };

      const baseMessages = videoPromptMessages(skillInput) || [
        {
          role: 'system',
          content: `你是专业的 AI 视频提示词优化专家（当前技能：${activeSkillItem.label}）。请将用户的原始提示词与素材要求改写为可直接用于 ${activeSkillItem.modelId} 视频生成的结构化、高精度提示词正文。只输出最终提示词正文，不要输出多余解释或标题。`,
        },
        { role: 'user', content: JSON.stringify(skillInput) },
      ];

      const usesResponses =
        llmModel.startsWith('openai-responses:') ||
        getMultimodalClientOverrides(llmModel).apiFormat === 'openai-responses';

      const data = await requestCanvasText(
        async () => {
          const overrides = getMultimodalClientOverrides(llmModel);
          const userParts: Array<Record<string, unknown>> = [
            { type: 'text', text: String(baseMessages[baseMessages.length - 1]?.content || effectiveOriginal) },
          ];
          for (const source of imageSources.slice(0, 4)) {
            const url = source.imageUrl;
            if (!url) continue;
            try {
              const sourceURL = new URL(url, location.origin);
              const reference = sourceURL.origin === location.origin ? await mediaData(url, 'image', controller.signal) : sourceURL.href;
              userParts.push({ type: 'image_url', image_url: { url: reference } });
            } catch {
              // 忽略无法内联的参考图
            }
          }
          const activeEffort =
            node.textReasoningEffort && node.textReasoningEffort !== 'auto'
              ? node.textReasoningEffort === 'xhigh' || node.textReasoningEffort === 'max' ? 'high' : node.textReasoningEffort
              : undefined;

          return {
            model: upstreamLlmModel,
            ...overrides,
            ...(usesResponses ? { apiFormat: 'openai-responses' } : {}),
            messages: [
              ...baseMessages.slice(0, -1),
              { role: 'user', content: userParts.length > 1 ? userParts : baseMessages[baseMessages.length - 1].content },
            ],
            ...(activeEffort ? { reasoning_effort: activeEffort } : {}),
          };
        },
        { usageModel: llmModel, projectId, nodeId: node.id, runId: crypto.randomUUID() },
        controller.signal,
      );

      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      const rawResult = typeof data.text === 'string' ? data.text : choices?.[0]?.message?.content;
      if (!rawResult?.trim()) throw new Error('大模型未返回有效的优化后提示词');

      let cleaned = rawResult.trim().replace(/^```[^\n]*\n([\s\S]*?)\n```$/, '$1').trim();
      const headerMatch = /^#{1,6}[ \t]+优化后提示词[^\n]*(?:\n|$)/m.exec(cleaned);
      if (headerMatch) cleaned = cleaned.slice(headerMatch.index + headerMatch[0].length).trim();
      cleaned = cleaned.split(/^#{1,6}[ \t]+(?:优化问题|相关原则)[^\n]*$/m)[0].trim();

      const optimizationRecord = {
        operationId: crypto.randomUUID(),
        operationInput: skillInput,
        videoModel: activeSkillItem.modelId,
        videoMode,
        original: effectiveOriginal,
        optimized: cleaned,
        draft: cleaned,
        submitted: cleaned,
        skillId: resolvedSkill?.id || activeSkillItem.skillId,
        revision: resolvedSkill?.source?.revision || resolvedSkill?.version || '1.0',
        sourceUrl: resolvedSkill?.source?.url || '',
        textModel: llmModel,
      };

      onChange({
        content: cleaned,
        promptOptimization: optimizationRecord,
        drawing: {
          model: activeSkillItem.id, quality: videoResolution, aspect: videoAspect,
          count: 1, duration: videoDuration, refMode: videoMode, audio: videoAudio,
          references: imageSources.map((s) => s.imageUrl!).filter(Boolean),
        },
      });
      setCompareTab('diff');
      await saveCanvasProjects();
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '提示词 Skill 优化失败');
    } finally {
      request.current = null;
      setBusy(false);
    }
  };

  const handleFinalPromptEdit = (nextFinal: string) => {
    if (node.promptOptimization) {
      onChange({
        content: nextFinal,
        promptOptimization: { ...node.promptOptimization, draft: nextFinal, submitted: nextFinal },
      });
    } else {
      onChange({ content: nextFinal });
    }
  };

  const selectTargetNode = (targetId: string) => {
    useCanvasStore.getState().selectNode(targetId);
    window.dispatchEvent(new CustomEvent('canvas:select-node', { detail: { nodeId: targetId } }));
  };

  const handleSendToVideoNode = () => {
    const state = useCanvasStore.getState();
    const promptToSend = finalPrompt.trim();
    const mediaIds = mediaSources.map((s) => s.id);
    const mediaUrls = mediaSources.map((s) => s.videoUrl || s.imageUrl).filter(Boolean) as string[];

    if (downstreamVideoNodes.length > 0) {
      for (const vidNode of downstreamVideoNodes) {
        const mergedRefIds = [...new Set([...(vidNode.referenceNodeIds || []), node.id, ...mediaIds])];
        state.updateNode(projectId, vidNode.id, {
          referenceNodeIds: mergedRefIds,
          drawing: {
            ...(vidNode.drawing || { model: activeSkillItem.id, quality: videoResolution, aspect: videoAspect, count: 1, references: [] }),
            model: vidNode.drawing?.model || activeSkillItem.id,
            aspect: videoAspect, duration: videoDuration, quality: videoResolution,
            refMode: videoMode, audio: videoAudio, optimizePrompt: false,
            references: [...new Set([...(vidNode.drawing?.references || []), ...mediaUrls])],
          },
        });
      }
      selectTargetNode(downstreamVideoNodes[0].id);
      return;
    }

    const newVideoNode = buildQuickCanvasNode(
      'video-generation',
      { x: node.x + node.width + 290, y: node.y + Math.round(node.height / 2) },
      { referenceNodeIds: [node.id, ...mediaIds] },
    );
    newVideoNode.drawing = {
      model: activeSkillItem.id, quality: videoResolution, aspect: videoAspect,
      count: 1, duration: videoDuration, refMode: videoMode, audio: videoAudio,
      optimizePrompt: false, references: mediaUrls,
    };
    if (promptToSend && !node.content?.trim()) onChange({ content: promptToSend });
    state.addNode(projectId, newVideoNode);
    state.addEdge(projectId, { sourceNodeId: node.id, targetNodeId: newVideoNode.id });
    for (const mediaId of mediaIds) state.addEdge(projectId, { sourceNodeId: mediaId, targetNodeId: newVideoNode.id });
    selectTargetNode(newVideoNode.id);
  };

  const diffTokens = useMemo(
    () => (hasOptimized ? computePromptDiff(beforePrompt, finalPrompt) : []),
    [hasOptimized, beforePrompt, finalPrompt],
  );
  const deltaChars = finalPrompt.length - beforePrompt.length;
  const hasAnyPrompt = Boolean(beforePrompt.trim() || finalPrompt.trim());

  const skillDropdownList = skillMenuOpen && (
    <div
      role="listbox"
      aria-label="模型提示词 Skill 列表"
      className="w-72 max-h-72 overflow-y-auto rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1B1B1E] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
    >
      <div className="px-2.5 py-1 text-[10px] font-medium text-zinc-400">切换目标视频模型 Skill</div>
      {PROMPT_SKILL_CATALOG.map((item) => {
        const isCurrent = item.id === activeSkillItem.id;
        const itemSkill = videoPromptSkill(item.modelId, item.defaultMode) || resolveVideoPromptSkill(item.skillId, item.modelId, item.defaultMode);
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={isCurrent}
            onClick={() => {
              updateSkillConfig({ model: item.id, refMode: item.defaultMode });
              setSkillMenuOpen(false);
            }}
            className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
              isCurrent
                ? 'bg-black/[0.06] dark:bg-white/[0.12] text-zinc-900 dark:text-white font-medium'
                : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]'
            }`}
          >
            <AssistantSkillCardIcon skill={itemSkill} className="!h-4 !w-4 !rounded !p-0 shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
            <span className="rounded bg-black/5 dark:bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
              {item.tag}
            </span>
            {isCurrent && <Check size={12} className="shrink-0 text-emerald-400" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      ref={anchor}
      data-testid="drawing-preview"
      data-prompt-skill-node="true"
      style={{ height: node.height || 260 }}
      onDoubleClick={() => { if (!node.layerLocked) setEditingCard(true); }}
      className={`relative flex w-full flex-col rounded-[18px] border ${selected ? 'border-zinc-400 dark:border-white/45' : 'border-zinc-200 dark:border-white/[0.08]'} bg-white dark:bg-[#1f1f1f] text-zinc-800 dark:text-zinc-100 select-none ${editingCard ? 'cursor-text' : 'cursor-grab active:cursor-grabbing'}`}
    >
      {/* 节点上方极简标题（与文本、图片、视频节点完全一致） */}
      <div className="pointer-events-none absolute -top-6 left-0 right-0 z-20 flex items-center gap-1.5 px-0.5 text-xs font-medium text-zinc-600 dark:text-[rgba(245,245,245,0.6)] select-none">
        <WandSparkles size={14} className="shrink-0 text-zinc-400" />
        <span className="truncate">{node.title || '提示词 Skill'}</span>
      </div>

      {/* 选中时上方悬浮胶囊工具栏（与文本、图片、视频节点顶部胶囊工具栏完全统一） */}
      {selected && (
        <div
          role="toolbar" aria-label="提示词 Skill 工具栏" data-tapnow-float-toolbar=""
          className="canvas-node-toolbar pointer-events-auto absolute left-1/2 bottom-full z-[120] mb-9 inline-flex h-11 -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-200 dark:border-white/10 bg-[#f6f6f6] dark:bg-[#262626]/90 px-2 py-1 whitespace-nowrap shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)] backdrop-blur-md select-none"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
        >
          <div className="inline-flex items-center gap-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.06] p-0.5">
            {([
              { id: 'diff', label: '对比', Icon: FileDiff },
              { id: 'split', label: '双栏', Icon: Columns2 },
              { id: 'final', label: '终稿', Icon: FileText },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id} type="button" onClick={() => setCompareTab(id)}
                className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors cursor-pointer ${compareTab === id ? 'bg-white dark:bg-white/[0.16] text-zinc-900 dark:text-white shadow-2xs' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
              >
                <Icon size={11} /><span>{label}</span>
              </button>
            ))}
          </div>

          <span className="mx-1 h-4 w-px shrink-0 bg-black/10 dark:bg-white/10" />

          <button
            type="button" disabled={!finalPrompt} title="复制最终提示词" aria-label="复制最终提示词"
            onClick={() => { if (!finalPrompt) return; void navigator.clipboard?.writeText(finalPrompt); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-black/5 hover:text-zinc-800 dark:text-zinc-300 dark:hover:bg-white/[0.08] dark:hover:text-white disabled:opacity-35 transition-colors cursor-pointer"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>

          <button
            type="button" onClick={(e) => { e.stopPropagation(); handleSendToVideoNode(); }}
            title={downstreamVideoNodes.length > 0 ? '同步并定位到下游视频节点' : '创建并连接下游视频生成节点'}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-zinc-900/90 hover:bg-zinc-900 dark:bg-white/[0.12] dark:hover:bg-white/[0.2] px-3 text-xs font-medium text-white transition-colors cursor-pointer"
          >
            <span>{downstreamVideoNodes.length > 0 ? '已连视频' : '传给视频'}</span><ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* 节点画布卡片主体（单击拖拽移动节点，双击进入文本微调） */}
      {busy ? (
        <div className="pointer-events-none flex flex-1 flex-col items-center justify-center gap-2.5 p-4 text-xs text-zinc-400">
          <Loader2 size={24} className="animate-spin text-zinc-300" />
          <span>正在使用大模型调用「{activeSkillItem.label}」优化提示词…</span>
        </div>
      ) : !hasAnyPrompt ? (
        <div className="pointer-events-none relative flex flex-1 flex-col justify-between px-4 py-3.5">
          <span className="text-sm text-slate-400 dark:text-zinc-500">连接左侧文本或素材，在下方输入提示词优化...</span>
          <div className="flex flex-1 items-center justify-center">
            <WandSparkles size={32} strokeWidth={1.5} className="text-zinc-300 dark:text-white/[0.14]" />
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
            <span className="inline-flex items-center gap-1.5 truncate">
              <AssistantSkillCardIcon skill={resolvedSkill} className="!h-3.5 !w-3.5 !rounded !p-0 shrink-0 opacity-80" />
              <span className="truncate">{activeSkillItem.label}</span>
            </span>
            <span className="shrink-0">{sources.length > 0 ? `已连 ${sources.length} 项` : `${videoAspect} · ${videoDuration}s`}</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col justify-between px-4 py-3.5">
          <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
            {compareTab === 'diff' ? (
              hasOptimized ? (
                <div className="space-y-2.5">
                  {beforePrompt && (
                    <div className="rounded-xl bg-zinc-100/80 dark:bg-white/[0.04] px-2.5 py-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      <span className="mr-1.5 inline-block rounded bg-black/[0.06] dark:bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">优化前</span>
                      <span className="whitespace-pre-wrap break-words">{beforePrompt}</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800 dark:text-zinc-100">
                    <span className="mr-1.5 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">优化后</span>
                    {diffTokens.map((tok, idx) =>
                      tok.type === 'added' ? <mark key={idx} className="rounded bg-emerald-500/18 px-0.5 text-emerald-700 dark:text-emerald-300 font-normal">{tok.text}</mark>
                      : tok.type === 'removed' ? <del key={idx} className="px-0.5 text-zinc-400 dark:text-zinc-500 line-through">{tok.text}</del>
                      : <span key={idx}>{tok.text}</span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800 dark:text-zinc-100">{beforePrompt || finalPrompt}</p>
              )
            ) : compareTab === 'split' ? (
              <div className="grid h-full min-h-0 grid-cols-2 gap-2.5 divide-x divide-black/[0.06] dark:divide-white/[0.06]">
                <div className="flex h-full min-h-0 flex-col overflow-y-auto pr-1">
                  <span className="mb-1 text-[10px] font-medium text-zinc-400">优化前 · 原稿</span>
                  <div className="whitespace-pre-wrap break-words text-xs leading-5 text-zinc-500 dark:text-zinc-400">{beforePrompt || '暂无原稿'}</div>
                </div>
                <div className="flex h-full min-h-0 flex-col pl-2.5">
                  <span className="mb-1 text-[10px] font-medium text-emerald-400">优化后 · 终稿{editingCard ? '（编辑中）' : '（双击编辑）'}</span>
                  {editingCard ? (
                    <textarea autoFocus aria-label="编辑优化后提示词" value={finalPrompt} readOnly={node.layerLocked} onBlur={() => setEditingCard(false)} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setEditingCard(false); }} onChange={(e) => handleFinalPromptEdit(e.target.value)} placeholder="优化后的最终提示词…" className="flex-1 w-full resize-none bg-transparent text-xs leading-5 text-zinc-800 dark:text-zinc-100 outline-none" />
                  ) : (
                    <div className="flex-1 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-zinc-800 dark:text-zinc-100">{finalPrompt || '双击编辑终稿…'}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-400">
                  <span>最终传出提示词（{finalPrompt.length} 字 · {editingCard ? '按 Esc 完成' : '双击编辑'}）</span>
                  <div className="flex items-center gap-1">
                    {hasOptimized && beforePrompt && <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => handleFinalPromptEdit(beforePrompt)} className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-black/5 dark:hover:bg-white/[0.08] dark:hover:text-white cursor-pointer"><RotateCcw size={10} /><span>还原原稿</span></button>}
                    {hasOptimized && optimizedPrompt && finalPrompt !== optimizedPrompt && <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => handleFinalPromptEdit(optimizedPrompt)} className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-black/5 dark:hover:bg-white/[0.08] dark:hover:text-white cursor-pointer"><Sparkles size={10} /><span>恢复初稿</span></button>}
                  </div>
                </div>
                {editingCard ? (
                  <textarea autoFocus aria-label="最终输出提示词" value={finalPrompt} readOnly={node.layerLocked} onBlur={() => setEditingCard(false)} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setEditingCard(false); }} onChange={(e) => handleFinalPromptEdit(e.target.value)} placeholder="在此输入或编辑最终要传给视频生成节点的提示词…" className="flex-1 w-full resize-none bg-transparent text-sm leading-6 text-zinc-800 dark:text-zinc-100 outline-none" />
                ) : (
                  <div className="flex-1 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800 dark:text-zinc-100">{finalPrompt || '双击此处编辑最终提示词…'}</div>
                )}
              </div>
            )}
          </div>

          <div className="pointer-events-none mt-2 flex items-center justify-between pt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
            <span className="inline-flex items-center gap-1.5 truncate">
              <AssistantSkillCardIcon skill={resolvedSkill} className="!h-3.5 !w-3.5 !rounded !p-0 shrink-0 opacity-80" />
              <span className="truncate">{activeSkillItem.label}</span>
            </span>
            {hasOptimized ? <span className="shrink-0 text-emerald-500 dark:text-emerald-400">已优化 · {deltaChars >= 0 ? `+${deltaChars}` : deltaChars}字</span> : <span className="shrink-0">按下方 ↑ 运行优化</span>}
          </div>
        </div>
      )}

      {/* 选中时下方悬浮编辑面板（通过 CanvasDrawingEditor Portal 挂载到视口，不阻挡节点拖拽与画布缩放） */}
      {selected && (
        <CanvasDrawingEditor
          anchor={anchor}
          className="pointer-events-auto rounded-[22px] border border-slate-200/90 dark:border-white/[0.08] bg-white/98 dark:bg-[#1b1b1e]/98 px-5 pt-4 pb-3.5 shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.75)] text-slate-700 dark:text-zinc-100 backdrop-blur-xl"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {/* 顶部参考素材栏：统一的 44x44 圆角缩略图 + 左上角序号角标 + 上传按钮 + 写法指南 */}
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
                  <span aria-hidden="true" className="pointer-events-none absolute -left-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/85 px-1 text-[10px] font-semibold leading-none text-white ring-1 ring-white/25">{slot.name}</span>
                  <button type="button" disabled={busy || node.layerLocked} onMouseDown={(e) => e.preventDefault()} aria-label={`引用${slot.name}`} onClick={() => promptInputRef.current?.insertReference(idx)} className="h-full w-full overflow-hidden rounded-[11px] cursor-pointer">
                    <CanvasPromptReferenceThumbnail key={slot.url} url={slot.url} poster={source.imageUrl} isVideo={mediaReferenceVideoFlags[idx]} />
                  </button>
                  <button type="button" disabled={busy || node.layerLocked} aria-label={`断开 ${source.title || '上游素材'}`} onClick={() => { dispatchHighlightRef(null); removeSource(source.id); }} className="absolute -right-1 -top-1 z-10 hidden h-4 w-4 items-center justify-center rounded-full bg-black/85 text-white group-hover:flex cursor-pointer"><X size={10} /></button>
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
                <span aria-hidden="true" className="pointer-events-none absolute -left-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/85 px-1 text-[10px] font-semibold leading-none text-white ring-1 ring-white/25">文本{idx + 1}</span>
                <button type="button" disabled={busy || node.layerLocked} onMouseDown={(e) => e.preventDefault()} aria-label={`引用文本${idx + 1}`} onClick={() => promptInputRef.current?.insertToken(`@文本${idx + 1}`)} className="flex h-full w-full items-center justify-center rounded-[11px] cursor-pointer">
                  <AlignLeft size={15} /><span className="sr-only">{source.title || '上游文本'}</span>
                </button>
                <button type="button" disabled={busy || node.layerLocked} aria-label={`断开 ${source.title || '上游文本'}`} onClick={() => { dispatchHighlightRef(null); removeSource(source.id); }} className="absolute -right-1 -top-1 z-10 hidden h-4 w-4 items-center justify-center rounded-full bg-black/85 text-white group-hover:flex cursor-pointer"><X size={10} /></button>
              </div>
            ))}

            <button
              type="button" aria-label="添加参考素材" title="上传参考图片或视频" disabled={busy || uploadingReferences || node.layerLocked} onClick={() => fileInputRef.current?.click()}
              className="flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-slate-200/80 dark:border-white/[0.08] bg-slate-100 dark:bg-[#2a2a2e] text-slate-500 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-[#333338] hover:text-slate-800 dark:hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Plus size={17} />
            </button>

            {resolvedSkill && (
              <button
                type="button" title="查看当前模型 Skill 的官方提示词写法指南" aria-label="查看提示词写法指南" onClick={() => setGuideOpen((v) => !v)}
                className={`ml-auto inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] transition-colors cursor-pointer ${guideOpen ? 'bg-black/[0.06] dark:bg-white/[0.12] text-zinc-900 dark:text-white' : 'text-zinc-400 hover:bg-black/5 hover:text-zinc-700 dark:hover:bg-white/[0.08] dark:hover:text-white'}`}
              >
                <BookOpen size={12} /><span>写法指南</span>
              </button>
            )}
          </div>

          {guideOpen && resolvedSkill && (
            <VideoPromptSkillDetails
              skillId={resolvedSkill.id}
              model={activeSkillItem.modelId}
              onClose={() => setGuideOpen(false)}
            />
          )}

          {/* 提示词与 @ 引用输入框 */}
          <CanvasPromptInput
            ref={promptInputRef}
            ariaLabel="提示词与修改要求"
            value={node.textPrompt || ''}
            references={mediaReferenceUrls}
            referenceTitles={mediaReferenceTitles}
            referenceVideoFlags={mediaReferenceVideoFlags}
            mixedReferenceOrder={mixedReferenceOrder}
            textReferences={textReferenceOptions}
            canvasCandidates={canvasCandidates}
            disabled={busy || node.layerLocked}
            placeholder={
              upstreamText
                ? '已连接上游文本，输入修改要求（如：强化推轨运镜、明确 @图片1 为首帧主角）…'
                : '输入原始提示词或创意描述（输入 @ 引用画布素材或文本）…'
            }
            onChange={(nextValue) => onChange({ textPrompt: nextValue })}
            onSubmit={() => { if (!busy && !node.layerLocked) void handleRunSkillOptimize(); }}
            onConnectCandidate={(cand) => { useCanvasStore.getState().addEdge(projectId, { sourceNodeId: cand.nodeId, targetNodeId: node.id }); }}
            onRequestUpload={() => fileInputRef.current?.click()}
          />

          {error && <p role="alert" className="mb-2 text-xs text-rose-500 dark:text-rose-400">{error}</p>}

          {/* 底部控制栏：大模型选择器 | 目标模型 Skill 选择器 | 目标视频参数 | 圆形提交按钮 ↑ */}
          <div className="mt-1 flex items-center justify-between gap-1.5 pt-1 whitespace-nowrap">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <CanvasModelPicker
                models={modelOptions}
                value={llmModel}
                onChange={(nextModel) => onChange({ textModel: nextModel })}
                disabled={busy || node.layerLocked}
                label="调用的大语言模型"
              />
              <PromptBarReasoningPill
                assistantModel={matchedLlm?.modelId || llmModel}
                isUp={true}
                disabled={busy || node.layerLocked}
                value={node.textReasoningEffort}
                onChange={(nextEffort) => onChange({ textReasoningEffort: nextEffort })}
              />

              <span className="qiaodoumayi-gen-model-size-divider" aria-hidden="true" />

              <div ref={skillMenuRef} className="relative">
                <button
                  type="button" aria-label="选择模型提示词 Skill" onClick={() => setSkillMenuOpen((v) => !v)}
                  className="node-dropdown-button inline-flex items-center gap-1.5 rounded-[9px] px-2 py-1 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  <AssistantSkillCardIcon skill={resolvedSkill} className="!h-3.5 !w-3.5 !rounded !p-0" />
                  <span className="max-w-[140px] truncate">{activeSkillItem.label}</span>
                  <ChevronDown size={12} className="opacity-65" />
                </button>

                {skillMenuOpen && (
                  <div className="absolute bottom-full left-0 z-[180] mb-2">
                    {skillDropdownList}
                  </div>
                )}
              </div>

              <span className="qiaodoumayi-gen-model-size-divider" aria-hidden="true" />

              <CanvasUnifiedVideoControls
                model={activeSkillItem.id}
                config={{ model: activeSkillItem.id, quality: videoResolution, aspect: videoAspect, count: 1, duration: videoDuration, refMode: videoMode, audio: videoAudio, references: mediaReferenceUrls }}
                onChange={(patch) => updateSkillConfig(patch)}
              />
            </div>

            <div className="ml-2 flex shrink-0 items-center">
              <button
                type="button" aria-label="运行提示词 Skill 优化" title={hasOptimized ? '重新运行提示词 Skill 优化' : '运行提示词 Skill 优化'} disabled={busy || node.layerLocked} onClick={() => void handleRunSkillOptimize()}
                className="flex h-9 min-w-9 items-center justify-center rounded-full bg-slate-900 dark:bg-white px-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-slate-800 dark:hover:bg-zinc-200 disabled:bg-slate-200 dark:disabled:bg-white/15 disabled:text-slate-400 dark:disabled:text-zinc-500 transition-colors cursor-pointer"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.4} />}
              </button>
            </div>
          </div>
        </CanvasDrawingEditor>
      )}
    </div>
  );
}

export default CanvasPromptSkillNode;
