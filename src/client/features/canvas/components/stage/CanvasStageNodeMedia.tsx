import {
  CanvasCompareNode,
  CanvasLocalToolNode,
  CanvasMonitorNode,
  CanvasSaveNode,
} from '../nodes/CanvasLocalToolNodes';
import { CanvasPanoramaNode, CanvasProviderNode } from '../nodes/CanvasProviderNode';
import { CanvasAnalysisNode } from '../nodes/CanvasAnalysisNodes';
import { buildLightingDerivedNode, buildMultiAngleDerivedNode, canvasMediaKind, canvasMediaUploadLimitMb, isCanvasPriorityTool, isCanvasLocalTool, persistCanvasMedia } from '../../model/canvasNodeFactory';
import { CanvasMultiAngleModal } from '@client/shared/modals/multi-angle/CanvasMultiAngleModal';
import { CanvasLightingModal } from '../tools/CanvasLightingModal';
import { canvasLibraryDragType, canvasLibraryMedia, openCanvasMediaLibrary } from '@client/shared/workspace/canvasWorkspace';
import { CanvasStoryboardChartNode } from '../nodes/CanvasStudioProductionNodes';
import { useCanvasStore } from '../../store/useCanvasStore';
import { recoverLayerDecompositionTask, retryLayerDecompositionTask } from '../../model/layerDecompositionTask';
import { canvasWorkflowUploadAccept, canvasWorkflowUploadError, canvasWorkflowUploadSlot } from '../../model/videoWorkflowRecovery';
import { CanvasPromptNode } from '../prompt/CanvasPromptNode';
import { CanvasPromptSkillNode } from '../nodes/CanvasPromptSkillNode';
import { useRef, useState, type ReactNode } from 'react';
import { CanvasDrawingNode } from '../nodes/CanvasDrawingNode';
import { CanvasVideoPlayer } from '../video/CanvasVideoPlayer';
import { extractVideoFrame } from '../../model/canvasVideoFrame';
import { enqueueCanvasImageTool } from '../../hooks/useCanvasGenerationSync';
import { CanvasAudioNode } from '../nodes/CanvasAudioNode';
import {
  CanvasDoodlePadNode,
  CanvasStoryboardTableNode,
  CanvasVideoTimelineNode,
} from '../nodes/CanvasStudioSpecializedNodes';
import AIGeneratingCard from '@client/shared/ui/AIGeneratingCard';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { AlertCircle, Frame, ImageOff, Library, Loader2, StickyNote, Type, Upload } from 'lucide-react';
import type { CanvasNode } from '../../model/types';
import type { CanvasStageNodeProps } from './CanvasStageNodeToolbar';

function CanvasFileNode({ node, slot, selected, onUpload, children }: {
  node: CanvasNode;
  slot: ReturnType<typeof canvasWorkflowUploadSlot>;
  selected: boolean;
  onUpload: (media: Partial<CanvasNode>) => void;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const empty = node.type === 'file';
  const disabled = node.layerLocked || busy;
  const actionVisibility = empty || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';
  const settings = node.studioRaw?.settings as Record<string, unknown> | undefined;
  const retiredStoryboard = Boolean(settings?.beikeStoryboardSourceId && settings.beikeStoryboardActive === false);

  const upload = async (file?: File) => {
    if (!file || node.layerLocked || busyRef.current) return;
    const kind = canvasMediaKind(file);
    const mismatch = canvasWorkflowUploadError(slot, kind);
    if (mismatch) { setError(mismatch); return; }
    if (!kind) { setError('仅支持图片、视频和音频文件'); return; }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const media = await persistCanvasMedia(file, 0, 0);
      const { resultWidth, resultHeight } = media;
      const scale = resultWidth && resultHeight ? 250 / Math.min(resultWidth, resultHeight) : undefined;
      onUpload({
        type: media.type,
        title: media.title,
        imageUrl: media.imageUrl,
        videoUrl: media.videoUrl,
        audioUrl: media.audioUrl,
        resultWidth: media.resultWidth,
        resultHeight: media.resultHeight,
        missingMedia: media.missingMedia,
        width: slot?.kind === 'video' ? node.width : scale && resultWidth ? Math.round(resultWidth * scale) : 250,
        height: slot?.kind === 'video' ? node.height : scale && resultHeight ? Math.round(resultHeight * scale) : kind === 'audio' ? 86 : 250,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败，请重试');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const receiveLibraryMedia = (raw: string) => {
    try {
      const media = canvasLibraryMedia(JSON.parse(raw));
      if (!media) throw new Error('素材链接无效');
      const mismatch = canvasWorkflowUploadError(slot, media.type);
      if (mismatch) { setError(mismatch); return; }
      onUpload({ ...media, width: 250, height: media.type === 'audio' ? 86 : 250, resultWidth: undefined, resultHeight: undefined });
      setError('');
    } catch { setError('素材链接无效'); }
  };

  return <div
    data-upload-node tabIndex={0} aria-label={slot?.label || '文件上传节点'} aria-busy={busy}
    onMouseDown={event => {
      if (!(event.target as HTMLElement).closest('button,input,video,audio')) event.currentTarget.focus({ preventScroll: true });
    }}
    onKeyDown={event => {
      if (!disabled && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') event.stopPropagation();
    }}
    onPaste={event => {
      const file = event.clipboardData.files[0];
      if (file) { event.preventDefault(); event.stopPropagation(); void upload(file); }
    }}
    onDragOver={event => {
      if (!event.dataTransfer.types.some(type => type === 'Files' || type === canvasLibraryDragType)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    }}
    onDrop={event => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled || busyRef.current) return;
      const media = event.dataTransfer.getData(canvasLibraryDragType);
      if (media) receiveLibraryMedia(media);
      else void upload(event.dataTransfer.files[0]);
    }}
    className={`relative w-full rounded-2xl outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 ${empty ? 'flex flex-col items-center justify-center bg-white dark:bg-[#1f1f1f]' : ''}`}
    style={empty ? { height: node.height } : undefined}
  >
    {empty && <div className="absolute -top-6 left-0 flex max-w-full items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"><Upload size={14} className="shrink-0" /><span className="truncate">{slot?.label || '上传'}</span></div>}
    {!empty && (retiredStoryboard || slot) && <span className="pointer-events-none absolute left-2 top-2 z-20 max-w-[calc(100%-1rem)] truncate rounded bg-black/75 px-1.5 py-0.5 text-xs text-white">{retiredStoryboard ? '旧分镜 · 已停用' : slot?.label}</span>}
    {empty && (
      <div className="absolute right-2 top-2 z-20 flex gap-1">
        <button type="button" disabled={disabled} aria-label="从素材库替换" title="从素材库替换"
          onMouseDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();openCanvasMediaLibrary(node.id);}}
          className={`grid size-7 place-items-center rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 focus-visible:opacity-100 disabled:opacity-30 dark:bg-[#292929] dark:text-zinc-300 dark:hover:bg-[#333333] ${actionVisibility}`}><Library size={14} /></button>
      </div>
    )}
    <input ref={input} type="file" accept={canvasWorkflowUploadAccept(slot)} className="hidden" aria-label="选择素材文件"
      onChange={event=>{void upload(event.target.files?.[0]);event.target.value='';}} />
    {empty ? <>
      <button type="button" disabled={disabled}
        onMouseDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();input.current?.click();}}
        className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border dark:border-zinc-500 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800/60">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        {busy ? '正在上传…' : '上传'}
      </button>
      <div className="mt-2 text-center text-[10px] text-zinc-500">或拖放文件到此处<br />或 Ctrl+V 粘贴</div>
      <div className="mt-1 text-center text-[9px] text-zinc-400 dark:text-zinc-500">{slot ? `支持${slot.kind === 'image' ? '图片' : '视频'}，上限 ${canvasMediaUploadLimitMb[slot.kind]} MB` : `图片 ${canvasMediaUploadLimitMb.image} MB · 视频 ${canvasMediaUploadLimitMb.video} MB · 音频 ${canvasMediaUploadLimitMb.audio} MB`}</div>
    </> : children}
    {busy && !empty && <div role="status" className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center gap-2 rounded-2xl bg-zinc-100/85 text-xs text-zinc-700 ring-2 ring-zinc-400 dark:bg-black/65 dark:text-zinc-100 dark:ring-white/40">
      <Loader2 size={15} className="animate-spin" />
      正在上传…
    </div>}
    {error && <p role="alert" className="absolute inset-x-2 bottom-2 z-30 rounded-md bg-white/95 p-1 text-center text-xs text-red-600 dark:bg-[#1f1f1f] dark:text-rose-400">{error}</p>}
  </div>;
}

function CanvasTextNode({ node, onChange }: { node: CanvasNode; onChange: (patch: Partial<CanvasNode>) => void }) {
  const note = node.type === 'note';
  const frame = node.type === 'frame';
  const Icon = frame ? Frame : note ? StickyNote : Type;
  return <div style={{ height: node.height }} className={`flex h-full flex-col rounded-2xl border p-4 ${frame ? 'border-slate-300 dark:border-white/10 bg-slate-100/40 dark:bg-white/5' : note ? 'border-amber-200/70 dark:border-amber-800/50 bg-[#fff9e8] dark:bg-amber-950/30 shadow-sm' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1B1B1E] shadow-[0_6px_24px_rgba(71,85,105,0.06)] dark:shadow-none'}`}>
    <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"><Icon size={15} /><input aria-label={`${frame ? '分镜' : note ? '便签' : '提示词'}名称`} readOnly={node.layerLocked} value={node.title || ''} onChange={e => onChange({title:e.target.value})} className="min-w-0 flex-1 bg-transparent text-slate-800 dark:text-slate-200 outline-none" /><span className="ml-auto text-[10px] font-normal text-slate-400 dark:text-slate-500">{frame ? '拖动标题移动区域' : note ? '记录想法' : '可连接到生成节点'}</span></div>
    {frame ? <p className="text-xs text-slate-400 dark:text-slate-500">{node.content || '将相关节点放在这里，整理一个镜头或一个创作分支。'}</p> : <textarea aria-label={note ? '便签内容' : '提示词内容'} readOnly={node.layerLocked} value={node.content || ''} onChange={event => onChange({ content: event.target.value })} onWheel={event => event.stopPropagation()} placeholder={note ? '记下灵感、反馈或待办…' : '描述主体、场景、风格或镜头…\n连接到图片 / 视频节点，复用这段提示词。'} className={`min-h-0 flex-1 resize-none bg-transparent text-sm leading-7 outline-none ${note ? 'text-slate-800 dark:text-amber-100 placeholder:text-amber-700/50 dark:placeholder:text-amber-500/50' : 'text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500'}`} />}
  </div>;
}

interface Props extends CanvasStageNodeProps {
  isSelected: boolean;
  isGenerating: boolean;
  isCurrentDragging: boolean;
  audioPanelDismissed: boolean;
}

export function CanvasStageNodeMedia({
  node,
  nodes,
  projectId,
  multiSelected,
  isGenerating,
  isSelected,
  isCurrentDragging,
  audioPanelDismissed,
  editingDrawingId,
  fileInputRef,
  replacementNodeRef,
  setPreviewMedia,
  updateNode,
  deleteNode,
  onRegenerate,
}: Props) {
  if (node.studioSubType && node.studioSubType !== 'motion-control' && isCanvasPriorityTool(node.studioSubType)) {
    const props = {
      node, projectId,
      selected: isSelected && !isCurrentDragging,
      sources: (node.referenceNodeIds ?? []).flatMap(id => {
        const source = nodes.find(candidate => candidate.id === id);
        return source ? [source] : [];
      }),
      onChange: (patch: Partial<CanvasNode>) => updateNode(projectId, node.id, patch),
    };
    if (node.studioSubType === 'global-perspective') return <CanvasPanoramaNode {...props} />;
    return node.studioSubType === 'director-3d' || node.studioSubType === 'video-analyze' || node.studioSubType === 'script-parse'
      ? <CanvasAnalysisNode {...props} />
      : <CanvasProviderNode {...props} />;
  }
  if (node.studioSubType && isCanvasLocalTool(node.studioSubType)) {
    return <CanvasLocalToolNode node={node} nodes={nodes} projectId={projectId} selected={isSelected && !isCurrentDragging} updateNode={updateNode} />;
  }
  if (node.studioSubType === 'storyboard-chart-node') {
    return <CanvasStoryboardChartNode node={node} nodes={nodes} projectId={projectId} updateNode={updateNode} />;
  }
  if (node.studioSubType === 'storyboard-node') {
    return <CanvasStoryboardTableNode node={node} projectId={projectId} updateNode={updateNode} />;
  }
  if (node.studioSubType === 'video-timeline') {
    return <CanvasVideoTimelineNode node={node} nodes={nodes} projectId={projectId} updateNode={updateNode} />;
  }
  if (node.studioSubType === 'doodle-canvas') {
    return <CanvasDoodlePadNode node={node} projectId={projectId} updateNode={updateNode} />;
  }

  if (node.studioSubType === 'video-prompt-optimizer') {
    return (
      <CanvasPromptSkillNode
        projectId={projectId}
        node={node}
        selected={isSelected && !isCurrentDragging}
        nodes={nodes}
        onChange={(patch) => updateNode(projectId, node.id, patch)}
      />
    );
  }

  if (node.type === 'prompt') {
    return (
      <CanvasPromptNode
        projectId={projectId}
        node={node}
        selected={isSelected && !isCurrentDragging}
        nodes={nodes}
        onChange={(patch) => updateNode(projectId, node.id, patch)}
      />
    );
  }
  if (node.type === 'drawing') {
    const showDrawingPanel =
      isSelected && !multiSelected && !isCurrentDragging && (editingDrawingId === node.id || editingDrawingId === null);
    return (
      <CanvasDrawingNode
        node={node}
        highlighted={isSelected}
        selected={showDrawingPanel}
        projectId={projectId}
        nodes={nodes}
        onPreview={(url) => setPreviewMedia({ url, type: node.generationKind === 'video' ? 'video' : 'image' })}
      />
    );
  }
  if (node.missingMedia) {
    return (
      <div
        className="rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 p-5 text-center text-sm text-slate-600 dark:text-slate-300"
        style={{ minHeight: node.height }}
      >
        <p>原本地文件已失效，请重新选择文件恢复此节点。</p>
        <button
          type="button"
          className="mt-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-3 py-2 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            replacementNodeRef.current = node.id;
            const input = fileInputRef.current;
            if (input) {
              const project = useCanvasStore.getState().projects.find(item => item.id === projectId);
              input.accept = canvasWorkflowUploadAccept(canvasWorkflowUploadSlot(project, node.id));
              input.click();
            }
          }}
        >
          重新选择文件
        </button>
      </div>
    );
  }
  if (node.layerTask) {
    return (
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10"
        style={{ height: node.height }}
      >
        <img src={proxyMediaUrl(node.referenceImageUrl)} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl opacity-60" />
        <span
          role="status"
          className="relative max-w-[90%] rounded-xl bg-white/90 dark:bg-[#1B1B1E]/90 border border-slate-200/80 dark:border-white/10 px-4 py-2 text-xs text-slate-700 dark:text-slate-200"
        >
          {node.status === 'error' ? node.content : '图层分离中…'}
          <button
            type="button"
            className="ml-2 underline"
            onClick={(event) => {
              event.stopPropagation();
              void (node.layerRetryAllowed
                ? retryLayerDecompositionTask(projectId, node)
                : recoverLayerDecompositionTask(projectId, node)
              ).catch((error) =>
                updateNode(projectId, node.id, {
                  content: error instanceof Error ? error.message : '无法读取原操作，请稍后重试',
                }),
              );
            }}
          >
            {node.layerRetryAllowed ? '重试拆分' : '查询原回执'}
          </button>
        </span>
      </div>
    );
  }
  if (node.status === 'error') {
    return (
      <div
        className="relative w-full rounded-2xl overflow-hidden shadow-sm border border-rose-200/80 dark:border-rose-900/60 select-none bg-rose-50/70 dark:bg-rose-950/30 p-5 flex flex-col items-center justify-center text-center cursor-grab active:cursor-grabbing"
        style={{ minHeight: `${node.height || 260}px` }}
      >
        <div className="w-10 h-10 rounded-2xl bg-white dark:bg-[#1B1B1E] shadow-xs border border-rose-100 dark:border-rose-900/40 flex items-center justify-center text-rose-500 dark:text-rose-400 mb-2">
          <AlertCircle className="w-5 h-5" />
        </div>
        <span className="text-xs font-bold text-rose-800 dark:text-rose-300">生成中断或失败</span>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-[220px] line-clamp-2">
          {node.content || '网络响应超时或模型服务忙'}
        </p>
        <div className="flex items-center gap-2 mt-3.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate(node);
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold hover:bg-slate-800 dark:hover:bg-slate-200 transition-all cursor-pointer shadow-xs active:scale-95"
          >
            重新生成
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(projectId, node.id);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/15 text-[11px] font-semibold transition-all cursor-pointer"
          >
            移除
          </button>
        </div>
      </div>
    );
  }
  if (isGenerating) {
    if (node.specialized?.operation === 'quick-split') {
      return (
        <div
          data-quick-split-pending="true"
          className="relative flex w-full flex-col items-center justify-center rounded-2xl border border-slate-200 dark:border-white/10 bg-zinc-100 dark:bg-[#1c1c1f] text-zinc-600 dark:text-white/65 select-none"
          style={{ height: `${node.height || 180}px` }}
        >
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500 dark:text-white/75" />
          <span className="mt-2.5 text-xs font-medium">切分中...</span>
        </div>
      );
    }
    return (
      <div className="relative w-full rounded-2xl overflow-hidden border border-slate-300 dark:border-white/15" style={{ height: `${node.height || 360}px` }}>
        <AIGeneratingCard
          embedded
          progressNumber={node.progress}
          showProgressBadge
          statusText={node.type === 'video' ? '正在生成视频分镜…' : '正在生成画面…'}
        />
      </div>
    );
  }
  const mediaUpload = (children?: ReactNode) => <CanvasFileNode node={node} slot={canvasWorkflowUploadSlot(useCanvasStore.getState().projects.find(project => project.id === projectId), node.id)} selected={isSelected} onUpload={media => {
    const current = useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes.find(item => item.id === node.id);
    if (current && !current.layerLocked) updateNode(projectId, node.id, { ...media, mediaUpload: true });
  }}>{children}</CanvasFileNode>;
  if (node.type === 'file') return mediaUpload();
  if (node.type === 'compare') {
    return <CanvasCompareNode node={node} nodes={nodes} projectId={projectId} selected={isSelected} />;
  }
  if (node.type === 'save') {
    return <CanvasSaveNode node={node} nodes={nodes} projectId={projectId} />;
  }
  if (node.type === 'preview') {
    return <CanvasMonitorNode node={node} nodes={nodes} projectId={projectId} />;
  }
  if (node.type === 'audio') {
    if (node.mediaUpload && node.audioUrl) return mediaUpload(
      <div className="flex h-[86px] items-center rounded-2xl bg-zinc-100 px-2 dark:bg-[#1f1f1f]">
        <audio key={node.audioUrl} controls preload="metadata" aria-label={node.title || '音频素材'}
          src={proxyMediaUrl(node.audioUrl) || node.audioUrl} className="w-full" />
      </div>
    );
    return <CanvasAudioNode node={node} nodes={nodes} projectId={projectId} selected={isSelected && !multiSelected && !isCurrentDragging && !audioPanelDismissed} />;
  }
  if (node.type === 'image') {
    const image = (
      <>
        <CanvasStageImage key={node.imageUrl} node={node} projectId={projectId} setPreviewMedia={setPreviewMedia} />
        {node.activeUploadTool === 'multiAngle' && (
          <div className="absolute left-1/2 top-full z-[130] mt-3 -translate-x-1/2">
            <CanvasMultiAngleModal
              isOpen
              inline
              onClose={() => updateNode(projectId, node.id, { activeUploadTool: null })}
              node={node}
              onSubmit={(params, options) => {
                enqueueCanvasImageTool(projectId, buildMultiAngleDerivedNode(node, params, options));
              }}
            />
          </div>
        )}
        {node.activeUploadTool === 'lighting' && (
          <div className="absolute left-1/2 top-full z-[130] mt-3 -translate-x-1/2">
            <CanvasLightingModal
              isOpen
              inline
              onClose={() => updateNode(projectId, node.id, { activeUploadTool: null })}
              node={node}
              onSubmit={(params, options) => {
                enqueueCanvasImageTool(projectId, buildLightingDerivedNode(node, params, options));
              }}
            />
          </div>
        )}
        {isSelected && node.activeUploadTool && node.activeUploadTool !== 'multiAngle' && node.activeUploadTool !== 'lighting' && node.activeUploadTool !== 'cropSelect' && node.activeUploadTool !== 'depth' && node.activeUploadTool !== 'smartEdit' && (
          <CanvasUploadInlineToolPanel node={node} projectId={projectId} updateNode={updateNode} />
        )}
      </>
    );
    return node.mediaUpload ? mediaUpload(image) : image;
  }
  if (node.type === 'video') {
    const video = (
      <>
        <div className="canvas-media-surface w-full overflow-hidden rounded-2xl ring-1 ring-slate-200 dark:ring-white/10 cursor-grab active:cursor-grabbing">
          <CanvasVideoPlayer
            videoUrl={node.videoUrl || ''}
            poster={node.imageUrl}
            height={node.height}
            onExtractFrame={(timeSec) => {
              if (!node.videoUrl) return;
              void extractVideoFrame(node.videoUrl, timeSec).then(({ dataUrl, width, height }) => {
                const w = Math.min(width || 280, 320);
                const h = Math.round(w * ((height || 280) / (width || 280)));
                useCanvasStore.getState().addNode(projectId, {
                  type: 'image',
                  title: `${node.title || '视频'}-当前帧`,
                  imageUrl: dataUrl,
                  x: node.x + node.width + 64,
                  y: node.y,
                  width: w,
                  height: h,
                  resultWidth: width,
                  resultHeight: height,
                  referenceNodeIds: [node.id],
                });
              });
            }}
          />
        </div>
        {isSelected && node.activeUploadTool && (
          <CanvasUploadInlineToolPanel node={node} projectId={projectId} updateNode={updateNode} />
        )}
      </>
    );
    return node.mediaUpload ? mediaUpload(video) : video;
  }
  if (['prompt', 'note', 'frame'].includes(node.type)) {
    return <CanvasTextNode node={node} onChange={(patch) => updateNode(projectId, node.id, patch)} />;
  }
  return null;
}

type ImageMeasurement = { url: string; width: number; height: number };
const pendingImageMeasurements = new Map<string, Map<string, ImageMeasurement>>();
let imageMeasurementTimer: number | undefined;

function queueImageMeasurement(projectId: string, nodeId: string, measurement: ImageMeasurement) {
  const projectMeasurements = pendingImageMeasurements.get(projectId) || new Map<string, ImageMeasurement>();
  projectMeasurements.set(nodeId, measurement);
  pendingImageMeasurements.set(projectId, projectMeasurements);
  window.clearTimeout(imageMeasurementTimer);
  imageMeasurementTimer = window.setTimeout(() => {
    const state = useCanvasStore.getState();
    for (const project of state.projects) {
      const measurements = pendingImageMeasurements.get(project.id);
      if (!measurements) continue;
      const patches: Record<string, Partial<CanvasStageNodeProps['node']>> = {};
      for (const node of project.nodes) {
        const measured = measurements.get(node.id);
        if (!measured || node.imageUrl !== measured.url) continue;
        const height = node.width * measured.height / measured.width;
        if (Math.abs(node.height - height) > 0.5 || node.resultWidth !== measured.width || node.resultHeight !== measured.height) {
          patches[node.id] = { height, resultWidth: measured.width, resultHeight: measured.height };
        }
      }
      if (Object.keys(patches).length) state.patchNodes(project.id, patches);
    }
    pendingImageMeasurements.clear();
  }, 120);
}

function CanvasStageImage({
  node,
  projectId,
  setPreviewMedia,
}: Pick<CanvasStageNodeProps, 'node' | 'projectId' | 'setPreviewMedia'>) {
  const [broken, setBroken] = useState(false);

  const syncHeight = (image: HTMLImageElement) => {
    const { naturalWidth, naturalHeight } = image;
    if (!node.imageUrl || !naturalWidth || !naturalHeight) return;
    const height = node.width * naturalHeight / naturalWidth;
    if (Math.abs(node.height - height) > 0.5 || node.resultWidth !== naturalWidth || node.resultHeight !== naturalHeight) {
      queueImageMeasurement(projectId, node.id, { url: node.imageUrl, width: naturalWidth, height: naturalHeight });
    }
  };

  if (broken) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-2xl shadow-sm select-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center text-center px-4"
        style={{ minHeight: `${node.height || 240}px` }}
      >
        <div className="w-10 h-10 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-2">
          <ImageOff className="w-5 h-5" />
        </div>
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">图片无法加载</span>
        <p className="text-[11px] text-slate-500 mt-1 dark:text-slate-400">链接失效或代理失败，请重新生成</p>
      </div>
    );
  }

  return (
    <div
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (node.imageUrl) setPreviewMedia({ url: node.imageUrl, type: 'image' });
      }}
      className="relative w-full overflow-hidden canvas-media-surface rounded-2xl ring-1 ring-slate-200 dark:ring-white/10 select-none group/media cursor-grab active:cursor-grabbing"
    >
      <img
        key={node.imageUrl}
        decoding="async"
        src={proxyMediaUrl(node.imageUrl) || node.imageUrl}
        alt={node.title || '图片素材'}
        className="block w-full h-auto rounded-2xl select-none pointer-events-none transition-opacity duration-300"
        draggable={false}
        onLoad={(event) => {
          setBroken(false);
          syncHeight(event.currentTarget);
        }}
        onError={(event) => {
          const target = event.currentTarget;
          if (!target.dataset.triedOriginal && node.imageUrl && target.src !== node.imageUrl) {
            target.dataset.triedOriginal = 'true';
            target.src = node.imageUrl;
            return;
          }
          setBroken(true);
        }}
      />
    </div>
  );
}

const TOOL_TITLES: Record<string, string> = {
  depth: '深度提取',
  aspectCrop: '画幅裁切',
  videoTrim: '时长裁切',
  videoReverse: '时序倒置',
  videoExtractAudio: '提取音频',
  videoCompress: '视频压缩',
  videoToGif: '动图导出',
  lut: 'LUT 调色',
  marker: '标记模式',
  annotation: '标注工具',
  portraitTexture: '人像质感调节',
  moodAdjust: '情绪调节',
  colorAdjust: '调色编辑',
  textEdit: '文字编辑',
  moveObject: '移动对象',
};

function CanvasUploadInlineToolPanel({
  node,
  projectId,
  updateNode,
}: {
  node: CanvasNode;
  projectId: string;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
}) {
  const tool = node.activeUploadTool || '';
  const [aspect, setAspect] = useState('16:9');
  const [trimEnd, setTrimEnd] = useState(5);
  const [lutPreset, setLutPreset] = useState('胶片暖调');
  const [promptValue, setPromptValue] = useState('');
  const addNode = useCanvasStore((s) => s.addNode);
  const isVideo = node.type === 'video';

  const close = () => updateNode(projectId, node.id, { activeUploadTool: null });

  const handleApply = () => {
    const x = node.x + node.width + 64;
    const y = node.y;
    if (tool === 'videoExtractAudio' && node.videoUrl) {
      addNode(projectId, {
        type: 'audio',
        title: `${node.title || '视频'} · 提取音频`,
        audioUrl: node.videoUrl,
        referenceNodeIds: [node.id],
        x, y, width: 320, height: 120,
      });
      close();
      return;
    }
    if (isVideo && node.videoUrl) {
      addNode(projectId, {
        type: 'video',
        title: `${node.title || '视频'} · ${TOOL_TITLES[tool] || tool}`,
        videoUrl: node.videoUrl,
        imageUrl: node.imageUrl,
        referenceNodeIds: [node.id],
        x, y,
        width: node.width,
        height: node.height,
      });
      close();
      return;
    }
    if (!isVideo && node.imageUrl) {
      enqueueCanvasImageTool(projectId, {
        type: 'drawing',
        generationKind: 'image',
        title: `${node.title || '图片'} · ${TOOL_TITLES[tool] || tool}`,
        content: promptValue.trim() || `对原图执行${TOOL_TITLES[tool] || tool}（参数：${tool === 'aspectCrop' ? aspect : lutPreset}），保持画面主体与细节自然。`,
        referenceImageUrl: node.imageUrl,
        referenceNodeIds: [node.id],
        drawing: { model: '', quality: 'high', aspect: tool === 'aspectCrop' ? aspect : 'smart', count: 1, references: [node.imageUrl] },
        x, y,
        width: node.width || 280,
        height: node.height || 280,
      });
      close();
    }
  };

  return (
    <div
      data-upload-inline-tool-panel={tool}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="mt-2 w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#1a1a1e]/95 p-3 text-xs text-zinc-700 dark:text-zinc-200 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-zinc-900 dark:text-white">{TOOL_TITLES[tool] || '节点工具'}</span>
        <button type="button" onClick={close} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer">
          关闭
        </button>
      </div>
      {tool === 'aspectCrop' && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setAspect(r)}
              className={`px-2 py-1 rounded-lg border text-[11px] cursor-pointer ${
                aspect === r
                  ? 'border-[#edb699] bg-[#362923] text-[#f5b895]'
                  : 'border-slate-200 dark:border-white/10 hover:bg-white/5'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      {tool === 'videoTrim' && (
        <div className="mb-2.5 flex items-center gap-2">
          <span className="text-[11px] text-zinc-400">截取时长</span>
          <input
            type="range"
            min={1}
            max={15}
            step={0.5}
            value={trimEnd}
            onChange={(e) => setTrimEnd(Number(e.target.value))}
            className="flex-1 accent-[#edb699]"
          />
          <span className="tabular-nums text-[11px]">0.0s - {trimEnd.toFixed(1)}s</span>
        </div>
      )}
      {tool === 'lut' && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {['胶片暖调', '赛博冷青', '复古黑白', '日系清透'].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setLutPreset(preset)}
              className={`px-2 py-1 rounded-lg border text-[11px] cursor-pointer ${
                lutPreset === preset
                  ? 'border-[#edb699] bg-[#362923] text-[#f5b895]'
                  : 'border-slate-200 dark:border-white/10 hover:bg-white/5'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      )}
      {['portraitTexture', 'moodAdjust', 'colorAdjust', 'textEdit', 'moveObject', 'marker', 'annotation'].includes(tool) && (
        <input
          type="text"
          value={promptValue}
          onChange={(e) => setPromptValue(e.target.value)}
          placeholder={`输入${TOOL_TITLES[tool]}说明…`}
          className="mb-2.5 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-2.5 py-1.5 text-xs outline-none focus:border-[#edb699]"
        />
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleApply}
          className="rounded-xl bg-[#362923] px-3 py-1.5 text-[11px] font-medium text-[#f5b895] hover:bg-[#46352d] transition-colors cursor-pointer"
        >
          生成并输出节点
        </button>
      </div>
    </div>
  );
}
