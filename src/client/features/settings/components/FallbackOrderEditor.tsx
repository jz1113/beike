import type { WorkflowCapability } from '@shared/domain/models/workflowModels';
import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react';
import { getApprovedModel } from '@shared/domain/models/modelCatalog';
import { FALLBACK_ORDER_KEY, readFallbackOrder, resolveFallbackOrder } from '@client/shared/api/generation/fallbackOrder';

export function FallbackOrderEditor({ showToast, customModels }: { customModels: WorkflowCapability[]; showToast: (message: string) => void }) {
  const [custom, setCustom] = useState(readFallbackOrder);
  const [dragged, setDragged] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const order = resolveFallbackOrder(customModels, custom);
  const move = (source: string, destination: string) => {
    const next = [...order];
    const from = next.indexOf(source), to = next.indexOf(destination);
    if (from < 0 || to < 0 || from === to) return;
    next.splice(from, 1); next.splice(to, 0, source);
    try { localStorage.setItem(FALLBACK_ORDER_KEY, JSON.stringify(next)); setCustom(next); showToast('故障备用顺序已保存，下次请求生效'); }
    catch { showToast('保存失败，顺序未变更'); }
  };
  return <section className="settings-default-rules space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-800">故障备用模型顺序 · {order.length} 个 <span className="ml-2 text-xs font-normal text-slate-500">{custom ? '自定义' : '跟随模型列表'}</span></h3><p className="mt-2 text-xs leading-5 text-slate-500">先调用当前模型；遇到可重试故障按下方从上到下尝试，跳过已尝试的模型。</p></div><button type="button" disabled={!custom} className="settings-button-secondary disabled:opacity-40" onClick={() => { try { localStorage.removeItem(FALLBACK_ORDER_KEY); setCustom(undefined); showToast('已恢复跟随当前模型列表的顺序'); } catch { showToast('恢复失败，请重试'); } }}><RotateCcw className="h-3.5 w-3.5" />跟随模型列表</button></div>
    <p className="text-xs text-slate-500">仅包含已启用、受支持的 Comfly 多模态模型。新增模型自动补入，停用或移出后自动排除；拖动手柄或点击箭头可单独排序。</p>
    {order.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">暂无可用备用模型，请在 Comfly 渠道中接入并启用多模态模型。当前仅尝试请求指定的模型。</p>}
    <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">{order.map((id, index) => <li key={id} className={`flex items-center gap-3 px-3 py-2 ${target === id ? 'bg-indigo-50' : ''}`} onDragOver={event => { if (dragged && dragged !== id) { event.preventDefault(); setTarget(id); } }} onDrop={event => { event.preventDefault(); if (dragged) move(dragged, id); setDragged(null); setTarget(null); }}>
      <button type="button" draggable onDragStart={event => { setDragged(id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); }} onDragEnd={() => { setDragged(null); setTarget(null); }} aria-label={`拖动备用模型 ${id}`} className="cursor-grab p-1 text-slate-400"><GripVertical className="h-4 w-4" /></button>
      <span className="w-5 text-xs tabular-nums text-slate-400">{index + 1}</span><div className="flex-1 min-w-0"><span className="text-xs font-medium text-slate-700">{getApprovedModel(id)?.name || id}</span><code className="block text-[11px] text-slate-400 break-all">{id}</code></div>
      <button type="button" disabled={index === 0} onClick={() => move(id, order[index - 1])} aria-label={`上移备用模型 ${id}`} className="p-2 rounded hover:bg-slate-100 disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button><button type="button" disabled={index === order.length - 1} onClick={() => move(id, order[index + 1])} aria-label={`下移备用模型 ${id}`} className="p-2 rounded hover:bg-slate-100 disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button>
    </li>)}</ol>
    <details className="text-xs leading-6 text-slate-500"><summary className="cursor-pointer">适用范围与默认规则</summary><p className="mt-2">数量与 Comfly 渠道中已启用、受支持的多模态模型一致。其他渠道使用独立凭证，不计入此备用池。跟随模型列表时按列表顺序尝试。主模型与可重试条件保持原设置；OpenAI Responses、生图和视频沿用各自规则。</p></details>
  </section>;
}
