import { useEffect, useRef, useState } from 'react';
import { Check, Plus, RefreshCw, Search } from 'lucide-react';
import { apiFetch } from '@client/shared/api/apiClient';
import { DEEPSEEK_MODELS, deepSeekModel, deepSeekRouteId } from '@shared/domain/models/deepseek';
import { gatewayModelToWorkflowModel, workflowModelRouteId } from '@shared/domain/models/workflowModels';
import type { WorkflowModel } from './settingsShared';

type CatalogModel = { id: string; name: string; inputModalities: string[] };
const presets: CatalogModel[] = DEEPSEEK_MODELS.map(model => ({ ...model, inputModalities: model.vision ? ['text', 'image'] : ['text'] }));
export function DeepSeekModelDirectory({ apiKey, configuredModels, onAdd }: {
  apiKey: string; configuredModels: WorkflowModel[]; onAdd: (model: WorkflowModel) => boolean;
}) {
  const [models, setModels] = useState<CatalogModel[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const generation = useRef({ value: 0 });
  useEffect(() => {
    const tracker = generation.current;
    tracker.value++;
    setModels(null); setError(''); setLoading(false);
    return () => { tracker.value++; };
  }, [apiKey]);
  const fetchModels = async () => {
    const request = ++generation.current.value;
    setLoading(true); setError('');
    try {
      const response = await apiFetch('/api/system/models/fetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'deepseek', apiKey: apiKey.trim(), strict: true }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || data.provider !== 'deepseek' || !Array.isArray(data.models)) throw new Error(data.error || '模型目录无效');
      if (request === generation.current.value) setModels(data.models);
    } catch (err) {
      if (request === generation.current.value) setError(err instanceof Error ? err.message : '获取模型失败');
    } finally { if (request === generation.current.value) setLoading(false); }
  };
  const visible = (models ?? presets).filter(model => `${model.id} ${model.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="settings-model-panel space-y-5" aria-label="DeepSeek 官方模型目录">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{models ? '官方返回的模型' : '可接入的官方模型'}</h3><p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">添加后在适用功能中选择；Flash 可设为默认视觉模型。</p></div>
      <button type="button" onClick={() => void fetchModels()} disabled={loading || !apiKey.trim()} className="settings-button-secondary disabled:opacity-40"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />{loading ? '拉取中…' : '获取模型目录'}</button>
    </div>
    <div className="rounded-xl bg-indigo-50/60 px-4 py-3 text-xs leading-6 text-slate-600">Flash：助手、文案、分镜提示词、素材反推与风格提炼。<br />V4 Pro：文本助手。图片与视频生成请使用对应的生成模型。</div>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    <label className="settings-directory-search"><Search className="w-4 h-4 text-slate-400" /><input aria-label="搜索 DeepSeek 模型" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索官方模型" className="w-full bg-transparent outline-none text-xs" /></label>
    <div className="settings-directory-list">{visible.map(model => {
      const supported = deepSeekModel(model.id);
      const configured = configuredModels.find(item => workflowModelRouteId(item) === deepSeekRouteId(model.id));
      return <div key={model.id} className="py-3 flex items-center justify-between gap-4">
        <div className="min-w-0"><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{supported?.name || model.name}</p><code className="text-xs text-slate-500 break-all dark:text-slate-400">{model.id}</code><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{supported ? supported.vision ? '文本 · 图像理解 · 工具调用' : '文本 · 工具调用' : '尚未适配'}</p></div>
        <button type="button" disabled={!supported || !!configured} onClick={() => onAdd({ ...gatewayModelToWorkflowModel({ id: model.id, name: supported?.name || model.name, shortName: supported?.name || model.name }, 'deepseek'), enabled: true } as WorkflowModel)} className="settings-button-secondary shrink-0 disabled:opacity-50">{configured ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}{configured ? configured.enabled === false ? '已添加 · 已停用' : '已添加' : '添加模型'}</button>
      </div>;
    })}</div>
    {!visible.length && <p className="text-xs text-slate-500 py-4 dark:text-slate-400">{models?.length === 0 ? '官方接口返回了空目录' : '没有匹配的模型'}</p>}
    {!models && <p className="text-[11px] text-slate-400">以上为已适配目录；获取官方目录可核对此密钥的访问权限。调用前请保存上方 API Key。</p>}
  </section>;
}
