import type { useBatchWorkshopRunner } from '../../hooks/useBatchWorkshopRunner';
import { isDeliverableWorkshopResult } from '../../model/generation/workshopReadiness';
import { confirmAction } from '@client/shared/utils/confirmAction';

type Runner = ReturnType<typeof useBatchWorkshopRunner>;
const button = 'rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-white/20';
export function WorkshopCanvasDelivery({ runner: r, mode }: { runner: Runner; mode: 'copy' | 'export' }) {
  const busy = r.flow.busy || r.items.some(item => item.isCopywritingGenerating);
  if (mode === 'export') {
    const count = r.successfulItems.flatMap(item => item.tasks).filter(isDeliverableWorkshopResult).length;
    return <section className="space-y-5 p-5" aria-label="图文成果导出">
      <p>已保存 {count} 张可交付图片。图片包包含各商品图片、已有文案和成果清单。</p>
      <div className="flex flex-wrap gap-3">
        <button className={button} disabled={!count || busy || r.isExportingZip} onClick={event => { if (event.detail <= 1) void r.handleExportZip(); }}>{r.isExportingZip ? '正在打包…' : '下载图文图片包 ZIP'}</button>
        <button className={button} disabled={!count || busy || r.isExportingZip} onClick={event => { if (event.detail <= 1) void r.handleExportExcel(); }}>导出成果清单 Excel</button>
      </div>
      <p className="text-sm text-slate-500">需要核对结果或下载单张图片时，打开「批量图片生成」节点。删除画布中的结果卡片不会删除已保存的原始素材。</p>
    </section>;
  }
  return <section className="space-y-5 p-5" aria-label="发布文案编辑">
    <button className={button} disabled={busy || !r.successfulItems.length} onClick={event => { if (event.detail <= 1) void r.generateAllCopywriting(); }}>生成缺失的发布文案</button>
    {!r.successfulItems.length && <p>先在商品采集节点添加商品。</p>}
    {r.successfulItems.map(item => <article key={item.id} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
      <h3 className="font-medium">{item.title}</h3>
      <button className={button} disabled={busy || !item.tasks.some(isDeliverableWorkshopResult)} onClick={async event => {
        if (event.detail > 1) return;
        if ((item.copywriting?.title || item.copywriting?.content) && !await confirmAction({ title: '重写此商品文案', description: '已有标题和正文将被新的生成结果替换，确定继续吗？', confirmText: '重写文案' })) return;
        await r.generateCopywritingForProduct(item);
      }}>{item.isCopywritingGenerating ? '正在生成…' : item.copywriting?.content || item.copywriting?.title ? '重写此商品文案' : '生成此商品文案'}</button>
      {item.copywritingError && <p role="alert">{item.copywritingError}</p>}
      <label className="block text-sm">标题<input aria-label={`${item.title}的文案标题`} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-white/20" disabled={!!item.isCopywritingGenerating} value={item.copywriting?.title || ''} onChange={event => r.updateItemCopywriting(item.id, { title: event.target.value, content: item.copywriting?.content || '', tags: item.copywriting?.tags })} /></label>
      <label className="block text-sm">正文<textarea aria-label={`${item.title}的文案正文`} rows={7} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-white/20" disabled={!!item.isCopywritingGenerating} value={item.copywriting?.content || ''} onChange={event => r.updateItemCopywriting(item.id, { title: item.copywriting?.title || '', content: event.target.value, tags: item.copywriting?.tags })} /></label>
      <label className="block text-sm">标签<input aria-label={`${item.title}的文案标签`} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-white/20" disabled={!!item.isCopywritingGenerating} value={item.copywriting?.tags?.join(' ') || ''} onChange={event => r.updateItemCopywriting(item.id, { title: item.copywriting?.title || '', content: item.copywriting?.content || '', tags: event.target.value.split(/\s+/).filter(Boolean) })} /></label>
    </article>)}
  </section>;
}
