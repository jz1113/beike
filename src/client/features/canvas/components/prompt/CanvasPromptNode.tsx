import { CanvasRichTextEditor } from '../editor/CanvasRichTextEditor';
import { useEffect, useRef, useState } from 'react';
import { AlignLeft, ArrowUp } from 'lucide-react';
import { apiFetch } from '@client/shared/api/apiClient';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { getEnabledMultimodalModelsFromSettings, readWorkflowModelsFromStorage } from '@shared/domain/models/workflowModels';
import type { CanvasNode } from '../../model/types';
import { CanvasDrawingEditor } from '../editor/CanvasDrawingEditor';
import { CanvasModelPicker } from '../tools/CanvasModelPicker';

const loadModels = () => getEnabledMultimodalModelsFromSettings(readWorkflowModelsFromStorage(), 'assistant').map(model => ({ id: model.id, name: model.name || model.id }));
export function CanvasPromptNode({ node, selected, onChange }: { node: CanvasNode; selected: boolean; onChange: (patch: Partial<CanvasNode>) => void }) {
  const anchor = useRef<HTMLDivElement>(null);
  const latest = useRef(node); latest.current = node;
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [models, setModels] = useState(loadModels);
  const model = node.textModel || models[0]?.id || '';
  useEffect(() => { const refresh = () => setModels(loadModels()); window.addEventListener('models_updated', refresh); return () => { window.removeEventListener('models_updated', refresh); request.current?.abort(); }; }, []);
  const generate = async () => {
    if (busy || node.layerLocked) return;
    const controller = new AbortController(); request.current = controller;
    const original = node.content;
    setBusy(true); setError('');
    try {
      const response = await apiFetch('/api/generate/canvas-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ model, prompt: node.textPrompt, ...getMultimodalClientOverrides(model) }) });
      const data = await response.json();
      if (!response.ok || !data.success || typeof data.text !== 'string' || !data.text.trim()) throw new Error(data.error || '模型没有返回文字');
      recordChatTokens({ modelId: typeof data.model === 'string' ? data.model : model, type: 'chat', usage: data.usage });
      if (latest.current.content !== original || latest.current.layerLocked) throw new Error('正文已修改或节点已锁定，未覆盖当前内容');
      onChange({ content: data.text, textHtml: undefined });
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '文本生成失败'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div ref={anchor} className="relative">
    <div className="absolute -top-7 left-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><AlignLeft size={13} /><span>{node.title || '文本'}</span></div>
    <CanvasRichTextEditor node={node} selected={selected} busy={busy} onChange={onChange} onMessage={setError} />
    {selected && <CanvasDrawingEditor anchor={anchor} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1B1B1E] p-4 shadow-lg dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)]" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <textarea aria-label="文本生成要求" placeholder="描述你想生成的内容…" maxLength={20000} value={node.textPrompt || ''} disabled={busy || node.layerLocked} onChange={e => onChange({ textPrompt: e.target.value })} className="min-h-28 w-full resize-none bg-transparent p-1 text-sm leading-7 text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500" />
      {error && <p role="status" className="mb-2 text-xs text-rose-500 dark:text-rose-400">{error}</p>}
      {!models.length && <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">请先在渠道管理中启用文本模型；也可以双击节点直接编辑。</p>}
      <div className="flex items-center justify-between"><CanvasModelPicker label="文本模型" models={models} value={model} onChange={id => onChange({ textModel: id })} disabled={busy || node.layerLocked} /><button aria-label="生成文本" title={node.content ? '生成并替换正文' : '生成文本'} disabled={busy || node.layerLocked || !node.textPrompt?.trim() || !models.some(item => item.id === model)} onClick={() => void generate()} className="flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-900 dark:bg-white px-2 text-xs text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:bg-slate-100 dark:disabled:bg-white/10 disabled:text-slate-400 dark:disabled:text-slate-600 transition-colors">{busy ? '生成中…' : <ArrowUp size={17} />}</button></div>
    </CanvasDrawingEditor>}
  </div>;
}
