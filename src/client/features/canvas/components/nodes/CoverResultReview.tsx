import { useState } from 'react';
import { createPortal } from 'react-dom';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { coverEarbudDockingRule, coverLayoutId, coverResultReferencePath, coverReviewState, coverSubmittedProductUrl } from '../../model/coverBatch';
import { compilerSettings, studioNodeMedia } from '../../model/studioConnections';
import { studioNodeTaskId, type StudioTaskCommands } from '../../model/studioTaskState';
import type { CanvasNode } from '../../model/types';
import { saveCanvasProjects } from '../../store/useCanvasStore';

const commonChecklist = [
  '标题与确认原文一致，字形和标点清楚，无增字或漏字',
  '品类、结构、颜色、标识与商品图一致，手机只出现指定一面',
  '手势与支撑自然，正面壁纸贴合屏幕，光影像实拍',
  '构图、分格和标题层级符合所选版式，关键部位与标题完整',
];

export function CoverResultReview({ node, commands, inline = false }: {
  node: CanvasNode;
  commands: StudioTaskCommands;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const dialog = useModalDialog(open, () => setOpen(false));
  const settings = (node.studioRaw?.settings || {}) as Record<string, unknown>;
  const url = node.imageUrl || '';
  const taskId = node.taskId;
  const review = coverReviewState(settings, taskId, url);
  if (!review || !taskId || node.status !== 'success' || settings.beikeCoverReviewUrl !== url) return null;

  const productUrl = coverSubmittedProductUrl(node);
  const submittedPrompt = typeof settings.beikeCoverSubmittedPrompt === 'string' ? settings.beikeCoverSubmittedPrompt : '';
  const checklist = submittedPrompt.includes(coverEarbudDockingRule)
    ? [...commonChecklist, '耳机仓状态与原图一致。展示仓内耳机时，左右耳分别落座，槽沿遮挡自然，耳机没有悬空']
    : commonChecklist;
  const layoutId = coverLayoutId(submittedPrompt);
  const referencePath = coverResultReferencePath(settings, submittedPrompt);
  const title = typeof settings.beikeCoverTitle === 'string' ? settings.beikeCoverTitle
    : Array.from(submittedPrompt.matchAll(/^第\d+行：“(.*)”｜字号：/gm), match => match[1]).join('');

  const decide = async (decision: 'approved' | 'rejected') => {
    const current = commands.read().nodes.find(item => item.id === node.id);
    if (!current || current.isGenerating || studioNodeTaskId(current) !== taskId ||
        studioNodeMedia(current).url !== url || compilerSettings(current).beikeCoverReviewUrl !== url) {
      setError('成品已变化，请重新打开质检。');
      return;
    }
    setSaving(true);
    setError('');
    const previous = compilerSettings(current).beikeCoverReview;
    const next = { taskId, url, decision, ...(decision === 'rejected' ? {
      issues: checklist.filter((_, index) => !checked.includes(index)), note: note.trim(),
    } : {}) };
    commands.update(node.id, taskId, { settings: { beikeCoverReview: next } });
    try {
      await saveCanvasProjects();
      setOpen(false);
    } catch {
      const live = commands.read().nodes.find(item => item.id === node.id);
      if (live && compilerSettings(live).beikeCoverReviewUrl === url) {
        commands.update(node.id, taskId, { settings: { beikeCoverReview: previous } });
      }
      setError('质检记录保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <button type="button" className={inline
      ? 'cursor-pointer rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white dark:bg-white dark:text-zinc-900'
      : 'pointer-events-auto absolute bottom-2 right-2 z-[55] rounded-full bg-black/75 px-2.5 py-1 text-xs text-white'}
      onMouseDown={event => event.stopPropagation()} onClick={event => {
        event.stopPropagation();
        setChecked([]);
        const lastReview = settings.beikeCoverReview as { note?: string } | undefined;
        setNote(review === 'rejected' ? lastReview?.note || '' : '');
        setDimensions(undefined);
        setError('');
        setOpen(true);
      }}>
      {review === 'approved' ? '质检通过' : review === 'rejected' ? '质检未通过' : '成图质检'}
    </button>
    {open && createPortal(
      <div className="pointer-events-auto fixed inset-0 z-[1100] grid place-items-center bg-black/65 p-4"
        onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
        <div ref={dialog} role="dialog" aria-modal="true" aria-label="成图质检" tabIndex={-1}
          className="grid max-h-[90vh] w-full max-w-4xl gap-4 overflow-auto rounded-2xl bg-white p-5 text-sm text-slate-900 dark:bg-[#202020] dark:text-white">
          <div className="flex justify-between gap-2">
            <h2 className="font-semibold">成图质检 {layoutId}</h2>
            <button type="button" onClick={() => setOpen(false)}>关闭</button>
          </div>
          {title && <p className="break-words">确认文案 · {title}</p>}
          <div className="grid grid-cols-3 gap-3">
            <figure><figcaption>成品</figcaption><img className="h-64 w-full object-contain" src={proxyMediaUrl(url)} alt="封面成品"
              onLoad={event => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              onError={() => setDimensions(undefined)} /></figure>
            {productUrl && <figure><figcaption>商品图</figcaption><img className="h-64 w-full object-contain" src={proxyMediaUrl(productUrl)} alt="商品参考" /></figure>}
            {referencePath && <figure><figcaption>版式样张</figcaption><img className="h-64 w-full object-contain" src={referencePath} alt="版式参考" /></figure>}
          </div>
          {checklist.map((label, index) => <label key={label} className="flex items-start gap-2">
            <input type="checkbox" checked={checked.includes(index)} onChange={event =>
              setChecked(current => event.target.checked ? [...current, index] : current.filter(value => value !== index))} />
            {label}
          </label>)}
          <label className="grid gap-1">未通过备注（可选）
            <textarea value={note} maxLength={500} rows={2} onChange={event => setNote(event.target.value)}
              className="rounded-lg border border-slate-300 bg-transparent p-2 dark:border-white/20" />
          </label>
          {dimensions && <p className="text-slate-500 dark:text-slate-300">
            成品尺寸 {dimensions.width} × {dimensions.height}
          </p>}
          {error && <p role="alert">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" disabled={saving} onClick={() => void decide('rejected')}>标记未通过</button>
            <button type="button" disabled={saving || !dimensions || checked.length !== checklist.length}
              className="rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-black"
              onClick={() => void decide('approved')}>通过质检</button>
          </div>
        </div>
      </div>, document.body)}
  </>;
}
