import { useContext } from 'react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { NativeStudioCommandsContext } from '../../hooks/useNativeStudioCommands';
import { coverLayoutPreview, coverReviewSource, coverReviewState, coverWorkflowRole } from '../../model/coverBatch';
import type { CanvasNode } from '../../model/types';
import { CoverResultReview } from './CoverResultReview';

export function CoverWorkflowNode({ node, nodes, onPreview }: {
  node: CanvasNode;
  nodes: CanvasNode[];
  onPreview: (url: string) => void;
}) {
  const commands = useContext(NativeStudioCommandsContext);
  const role = coverWorkflowRole(node);
  const panel = 'flex w-full flex-col gap-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-800 dark:border-white/10 dark:bg-[#1f1f1f] dark:text-zinc-200';
  const muted = 'text-zinc-500 dark:text-zinc-400';

  if (role === 'layout') {
    const { url, generated, layout } = coverLayoutPreview(node, nodes);
    const label = generated ? 'AI 生成图' : '版式参考样张';
    return <div className={panel} style={{ height: node.height }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {layout && <span className={muted}>{layout}</span>}
      </div>
      {url ? <button type="button" aria-label={`预览${label}`}
        className="min-h-0 flex-1 cursor-pointer overflow-hidden rounded-lg bg-zinc-100 dark:bg-black/25"
        onMouseDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onPreview(url); }}>
        <img key={url} src={proxyMediaUrl(url)} alt={label} className="h-full w-full object-contain" draggable={false} />
      </button> : <div className={`grid flex-1 place-items-center text-center ${muted}`}>
        {generated ? '成品暂不可用' : '等待选择版式或上传风格参考'}
      </div>}
    </div>;
  }

  const result = coverReviewSource(node, nodes);
  const url = result?.status === 'success' && !result.missingMedia ? result.imageUrl : undefined;
  const settings = (result?.studioRaw?.settings as Record<string, unknown> | undefined) ?? {};
  const review = url && coverReviewState(settings, result?.taskId, url);
  const actionable = Boolean(review && settings.beikeCoverReviewUrl === url);
  return <div className={panel} style={{ height: node.height }}>
    <p className="font-medium">{review === 'approved' ? '已通过质检' : review === 'rejected' ? '质检未通过'
      : actionable ? '待核对标题、商品外观和版式' : url ? '已有成品' : '等待封面生成'}</p>
    {url && <button type="button" aria-label="预览待质检封面"
      className="min-h-0 flex-1 cursor-pointer overflow-hidden rounded-lg bg-zinc-100 dark:bg-black/25"
      onMouseDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onPreview(url); }}>
      <img key={url} src={proxyMediaUrl(url)} alt="待质检封面" className="h-full w-full object-contain" draggable={false} />
    </button>}
    {result && commands && actionable && <CoverResultReview key={result.taskId + (url || '')} node={result}
      commands={commands} inline />}
  </div>;
}
