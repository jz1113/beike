import { CanvasPromptNode } from '../prompt/CanvasPromptNode';
import { CanvasTextNode } from '../CanvasTextNode';
import { useState } from 'react';
import { CanvasDrawingNode } from '../CanvasDrawingNode';
import { CanvasFileNode } from '../CanvasFileNode';
import { CanvasVideoPlayer } from '../video/CanvasVideoPlayer';
import { CanvasCompareNode } from '../nodes/CanvasCompareNode';
import { CanvasSaveNode } from '../nodes/CanvasSaveNode';
import { CanvasMonitorNode } from '../nodes/CanvasMonitorNode';
import { CanvasAudioNode } from '../nodes/CanvasAudioNode';
import AIGeneratingCard from '@client/shared/ui/AIGeneratingCard';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { AlertCircle, ImageOff, Sparkles } from 'lucide-react';
import type { CanvasStageNodeProps } from './canvasStageNodeTypes';

interface Props extends CanvasStageNodeProps {
  isSelected: boolean;
  isGenerating: boolean;
  isCurrentDragging: boolean;
}

export function CanvasStageNodeMedia({
  node, nodes, projectId, isGenerating, isSelected, isCurrentDragging, editingDrawingId,
  fileInputRef, replacementNodeRef, setPreviewMedia, updateNode, deleteNode, onRegenerate,
}: Props) {
  if (node.type === 'prompt') return <CanvasPromptNode node={node} selected={isSelected && !isCurrentDragging} onChange={patch => updateNode(projectId, node.id, patch)} />;
  if (node.type === 'drawing') {
    return (
      <CanvasDrawingNode
        node={node}
        highlighted={isSelected}
        selected={isSelected && editingDrawingId === node.id && !isCurrentDragging}
        projectId={projectId}
        nodes={nodes}
        onPreview={(url) => setPreviewMedia({ url, type: node.generationKind === 'video' ? 'video' : 'image' })}
      />
    );
  }
  if (node.missingMedia) {
    return (
      <div className="rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 p-5 text-center text-sm text-slate-600 dark:text-slate-300" style={{ minHeight: node.height }}>
        <p>原本地文件已失效，请重新选择文件恢复此节点。</p>
        <button type="button" className="mt-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-3 py-2 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer" onClick={(e) => {
          e.stopPropagation(); replacementNodeRef.current = node.id; fileInputRef.current?.click();
        }}>重新选择文件</button>
      </div>
    );
  }
  if (node.layerTask) {
    return (
      <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10" style={{ height: node.height }}>
        <img src={proxyMediaUrl(node.referenceImageUrl)} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl opacity-60" />
        <span role="status" className="relative max-w-[90%] rounded-xl bg-white/90 dark:bg-[#1B1B1E]/90 border border-slate-200/80 dark:border-white/10 px-4 py-2 text-xs text-slate-700 dark:text-slate-200">{node.status === 'error' ? `拆分失败：${node.content}` : '图层分离中…'}</span>
      </div>
    );
  }
  if (node.status === 'error') {
    return (
      <div className="relative w-full rounded-2xl overflow-hidden shadow-sm border border-rose-200/80 dark:border-rose-900/60 select-none bg-rose-50/70 dark:bg-rose-950/30 p-5 flex flex-col items-center justify-center text-center cursor-grab active:cursor-grabbing" style={{ minHeight: `${node.height || 260}px` }}>
        <div className="w-10 h-10 rounded-2xl bg-white dark:bg-[#1B1B1E] shadow-xs border border-rose-100 dark:border-rose-900/40 flex items-center justify-center text-rose-500 dark:text-rose-400 mb-2">
          <AlertCircle className="w-5 h-5" />
        </div>
        <span className="text-xs font-bold text-rose-800 dark:text-rose-300">生成中断或失败</span>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-[220px] line-clamp-2">{node.content || '网络响应超时或模型服务忙'}</p>
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
          <button type="button" onClick={(e) => { e.stopPropagation(); deleteNode(projectId, node.id); }} className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/15 text-[11px] font-semibold transition-all cursor-pointer">
            移除
          </button>
        </div>
      </div>
    );
  }
  if (isGenerating) {
    return (
      <div className="relative w-full rounded-2xl overflow-hidden shadow-sm border border-sky-200/60 dark:border-sky-800/40 select-none bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center" style={{ height: `${node.height || 360}px` }}>
        <AIGeneratingCard progressNumber={node.progress || 35} showProgressBadge={true} isVideo={node.type === 'video'} variant="premium" />
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none z-20">
          <div className="w-11 h-11 rounded-2xl bg-white/85 dark:bg-[#1B1B1E]/90 backdrop-blur-md shadow-xs flex items-center justify-center mb-3 text-sky-600 dark:text-sky-400 border border-white/70 dark:border-white/10">
            <Sparkles className="w-5 h-5 text-sky-500 animate-spin" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 tracking-tight">
            {node.type === 'video' ? 'AI 正在渲染视频分镜...' : 'AI 正在绘制高精画面...'}
          </span>
          {node.content && (
            <p className="text-[11px] text-slate-500/90 dark:text-slate-300 max-w-[240px] truncate mt-1.5 px-2.5 py-1 rounded-lg bg-white/60 dark:bg-black/40 backdrop-blur-xs border border-white/60 dark:border-white/10">{node.content}</p>
          )}
        </div>
      </div>
    );
  }
  if (node.type === 'file') return <CanvasFileNode onUpload={(media) => updateNode(projectId, node.id, media)} />;
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
    return <CanvasAudioNode node={node} nodes={nodes} projectId={projectId} />;
  }
  if (node.type === 'image') {
    return (
      <CanvasStageImage
        node={node}
        projectId={projectId}
        setPreviewMedia={setPreviewMedia}
        updateNode={updateNode}
      />
    );
  }
  if (node.type === 'video') {
    return (
      <div className="w-full rounded-2xl overflow-hidden ring-1 ring-slate-200 dark:ring-white/10 cursor-grab active:cursor-grabbing">
        <CanvasVideoPlayer videoUrl={node.videoUrl || ''} poster={node.imageUrl} height={node.height} />
      </div>
    );
  }
  if (['prompt', 'note', 'frame'].includes(node.type)) return <CanvasTextNode node={node} onChange={patch => updateNode(projectId, node.id, patch)} />;
  return null;
}

function CanvasStageImage({
  node,
  projectId,
  setPreviewMedia,
  updateNode,
}: Pick<CanvasStageNodeProps, 'node' | 'projectId' | 'setPreviewMedia' | 'updateNode'>) {
  const [broken, setBroken] = useState(false);

  const syncHeight = (image: HTMLImageElement) => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    const height = node.width * image.naturalHeight / image.naturalWidth;
    if (Math.abs(node.height - height) > 0.5 || node.resultWidth !== image.naturalWidth || node.resultHeight !== image.naturalHeight) {
      updateNode(projectId, node.id, { height, resultWidth: image.naturalWidth, resultHeight: image.naturalHeight });
    }
  };

  if (broken) {
    return (
      <div
        className={`relative w-full overflow-hidden ${node.layerGroupId ? '' : 'rounded-2xl shadow-sm'} select-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center text-center px-4`}
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
      className={`relative w-full overflow-hidden ${node.layerGroupId ? '' : 'rounded-2xl ring-1 ring-slate-200 dark:ring-white/10'} select-none group/media cursor-grab active:cursor-grabbing`}
    >
      <img
        key={node.imageUrl}
        ref={(image) => {
          if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return;
          syncHeight(image);
        }}
        style={{ opacity: node.layerOpacity ?? 1 }}
        src={proxyMediaUrl(node.imageUrl) || node.imageUrl}
        alt={node.title || '图片素材'}
        className={`block w-full h-auto ${node.layerGroupId ? '' : 'rounded-2xl'} select-none pointer-events-none transition-opacity duration-300`}
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
