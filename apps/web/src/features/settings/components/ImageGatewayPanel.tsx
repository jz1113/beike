import { useEffect, useState } from 'react';
import { apiFetch } from '@/shared/api/apiClient';
import { inferWorkflowCapabilitiesFromId } from '@beike/domain/workflowModels';
import type { WorkflowModel } from '../settingsShared';
import { credentialGet } from '@/shared/api/credentialClient';
import { readImageGatewayConfig, saveImageGatewayConfig, fixedImageModelRoute, readIndependentTextModels } from '@/shared/api/imageGateway';

export function ImageGatewayPanel({ models }: { models: { id: string; isImage: boolean; isVideo?: boolean; isMultimodal?: boolean; isAssistant?: boolean }[] }) {
  const [modelIds, setModelIds] = useState<string[] | null>(() => readImageGatewayConfig().modelIds);
  const [textModelIds, setTextModelIds] = useState(readIndependentTextModels);
  const [catalog, setCatalog] = useState<WorkflowModel[]>([]);
  const [pendingModels, setPendingModels] = useState<WorkflowModel[]>([]);
  const [query, setQuery] = useState('');
  const [fetching, setFetching] = useState(false);
  const effectiveModels = [...models, ...pendingModels.filter(m => !models.some(existing => existing.id === m.id))];
  const selectedModelIds = modelIds ?? effectiveModels.filter(model => model.isImage).map(model => model.id);
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    const config = readImageGatewayConfig();
    setEnabled(config.enabled); setBaseUrl(config.baseUrl);
    void credentialGet('image_api_key').then(key => {
      if (active) { setApiKey(key); setReady(true); }
    }).catch(() => { if (active) setMessage('无法读取生图密钥，请重新打开设置后重试'); });
    return () => { active = false; };
  }, []);
  async function save() {
    setSaving(true); setMessage('');
    try {
      await saveImageGatewayConfig(enabled, baseUrl, apiKey, selectedModelIds);
      localStorage.setItem('independent_text_models', JSON.stringify([...new Set(textModelIds)]));
      if (pendingModels.length) {
        const saved = JSON.parse(localStorage.getItem('custom_models') || '[]') as WorkflowModel[];
        const combined = [...saved, ...pendingModels.filter(m => !saved.some(existing => existing.id === m.id))];
        localStorage.setItem('custom_models', JSON.stringify(combined));
        setPendingModels([]);
      }
      window.dispatchEvent(new Event('models_updated'));
      setMessage(enabled ? '已保存，选中的模型使用独立接口，其余使用 Comfly' : '已关闭独立接口，对应模型暂不可用；Comfly 模型可继续使用');
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败'); }
    finally { setSaving(false); }
  }
  async function fetchModels() {
    setFetching(true); setMessage(''); setCatalog([]);
    try {
      if (!baseUrl.trim() || !apiKey.trim()) throw new Error('请先填写独立网关地址和密钥');
      const response = await apiFetch('/api/system/models/fetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), strict: true }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || data.isFallback || !Array.isArray(data.models)) throw new Error(data.error || '网关未返回真实模型列表');
      const found = data.models.filter((m: { id?: unknown }) => typeof m.id === 'string' && m.id.trim()).map((m: WorkflowModel) => {
        const caps = inferWorkflowCapabilitiesFromId(m.id);
        return { ...m, ...caps, name: m.name || m.id, shortName: m.name || m.id, isCustom: true };
      });
      setCatalog(found); setMessage(`已拉取独立网关 ${found.length} 个模型；添加后保存配置生效`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '拉取失败'); }
    finally { setFetching(false); }
  }
  function addModel(model: WorkflowModel) {
    if (fixedImageModelRoute(model.id) === 'comfly') { setMessage('gpt-image-2 已固定使用 Comfly，独立接口请使用服务商实际支持的完整模型 ID'); return; }
    if (!effectiveModels.some(m => m.id === model.id)) setPendingModels(prev => [...prev, model]);
    if (model.isImage) setModelIds(prev => [...new Set([...(prev ?? selectedModelIds), model.id])]);
    else setTextModelIds(prev => [...new Set([...prev, model.id])]);
    setMessage(`${model.id} 已选择独立网关，保存后生效；同名模型不会重复创建`);
  }
  return <section className="rounded-2xl bg-white border border-slate-200/80 p-5 space-y-4">
    <div className="flex items-center justify-between gap-4">
      <h3 className="text-sm font-bold text-slate-900">独立模型网关</h3>
      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input type="checkbox" checked={enabled} disabled={!ready || saving} onChange={event => setEnabled(event.target.checked)} />启用独立接口
      </label>
    </div>
    <p className="text-xs text-slate-500">GPT Image 2 的两个模型固定分流：openai/gpt-image-2 使用独立接口，gpt-image-2 使用 Comfly。其他模型按下方勾选分流，支持生图、视觉分析、提示词反推、AI 对话和工坊文案。同一个模型 ID 只使用一个网关，取消勾选后使用 Comfly。保存前请等待当前模型任务结束。</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="text-xs font-medium text-slate-700">独立网关 Base URL
        <input aria-label="独立网关 Base URL" value={baseUrl} disabled={!ready || saving || fetching} onChange={event => { setBaseUrl(event.target.value); setCatalog([]); }} placeholder="https://你的模型网关地址" className="mt-2 w-full rounded-xl border border-slate-200 p-3" />
      </label>
      <label className="text-xs font-medium text-slate-700">独立网关 API Key
        <input aria-label="独立网关 API Key" type="password" autoComplete="new-password" value={apiKey} disabled={!ready || saving || fetching} onChange={event => { setApiKey(event.target.value); setCatalog([]); }} placeholder="填写新服务的密钥" className="mt-2 w-full rounded-xl border border-slate-200 p-3" />
      </label>
    </div>
    <p className="text-xs text-slate-500">Gapnet 地址填写 https://api.gapnet.ai/endpoint，模型 ID 使用服务商完整名称，例如 openai/gpt-image-2。在下方添加并标记为“生图”，再到生成页面选择。GPT Image 2 按所选比例使用接近 1K 的尺寸：3:4 为 768×1024，1:1 为 1024×1024；16:9 为 1280×720，21:9 为 1344×576，以满足最低像素限制。其他方向按对应比例处理。画质与尺寸独立。同步生图可能需要数分钟，请等待结果。</p>
    <div className="space-y-3 rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">独立网关模型库</span>
        <button type="button" disabled={!ready || saving || fetching} onClick={() => void fetchModels()} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">{fetching ? '拉取中…' : '拉取独立网关模型'}</button>
      </div>
      <p className="text-xs text-slate-500">从上方地址拉取真实模型列表。能力根据模型名称推断，添加后可在工作流模型区调整；网关需兼容 OpenAI 图片或 Chat Completions 协议。视频、音频、向量模型可查看，目前不支持接入独立网关。</p>
      {catalog.length > 0 && <>
        <input aria-label="搜索独立网关模型" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索模型 ID…" className="w-full rounded-lg border p-2 text-xs" />
        <div className="max-h-64 overflow-y-auto space-y-2">
          {catalog.filter(m => m.id.toLowerCase().includes(query.toLowerCase())).map(m => {
            const caps = inferWorkflowCapabilitiesFromId(m.id);
            const unsupported = caps.isVideo || caps.isAudio || caps.isEmbedding;
            const fixed = fixedImageModelRoute(m.id);
            const selected = effectiveModels.some(existing => existing.id === m.id) && (m.isImage ? fixed ? fixed === 'independent' : selectedModelIds.includes(m.id) : textModelIds.includes(m.id));
            return <div key={m.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 break-all">{m.id} · {caps.isImage ? '生图' : caps.isVideo ? '视频' : caps.isAudio ? '音频' : caps.isEmbedding ? '向量' : caps.isMultimodal ? '多模态' : '文本（能力待确认）'}</span>
              <button type="button" disabled={saving || unsupported || selected || fixed === 'comfly'} onClick={() => addModel(m)} className="shrink-0 rounded-lg border px-2 py-1 disabled:opacity-50">{fixed === 'comfly' ? '固定 Comfly' : unsupported ? '暂不支持' : selected ? '已选择' : '使用独立网关'}</button>
            </div>;
          })}
        </div>
      </>}
    </div>
    <fieldset className="space-y-2" disabled={!ready || saving || fetching}>
      <legend className="text-xs font-medium">使用独立网关的文本 / 多模态模型</legend>
      <p className="text-xs text-slate-500">用于分析、反推、对话和文案。关闭独立网关后，已勾选模型会提示不可用，不会自动换地址。备用模型也只在同一网关内尝试。</p>
      {effectiveModels.filter(m => !m.isImage && !m.isVideo).map(m => <label key={m.id} className="flex items-center gap-2 text-xs text-slate-700">
        <input type="checkbox" checked={textModelIds.includes(m.id)} onChange={e => setTextModelIds(prev => e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id))} />
        {m.id} · {textModelIds.includes(m.id) ? '独立网关' : 'Comfly'}
      </label>)}
    </fieldset>
    <fieldset className="space-y-2" disabled={!ready || saving || fetching}>
      <legend className="text-xs font-medium text-slate-700">使用独立接口的生图模型</legend>
      <p className="text-xs text-slate-500">勾选后保存。两个 GPT Image 2 条目已固定接口，不能互换；关闭独立接口后，其对应模型会提示未启用，不会转发到 Comfly。</p>
      {effectiveModels.filter(model => model.isImage).map(model => <label key={model.id} className="flex items-center gap-2 text-xs text-slate-700">
        <input type="checkbox" disabled={Boolean(fixedImageModelRoute(model.id))} checked={fixedImageModelRoute(model.id) ? fixedImageModelRoute(model.id) === 'independent' : selectedModelIds.includes(model.id)} onChange={event => setModelIds(event.target.checked ? [...selectedModelIds, model.id] : selectedModelIds.filter(id => id !== model.id))} />
        {model.id} · {fixedImageModelRoute(model.id) ? (fixedImageModelRoute(model.id) === 'independent' ? '独立接口（固定）' : 'Comfly（固定）') : selectedModelIds.includes(model.id) ? '独立接口' : 'Comfly'}
      </label>)}
      {!effectiveModels.some(model => model.isImage) && <p className="text-xs text-slate-500">请先在下方添加模型并开启“生图”能力。</p>}
    </fieldset>
    <div className="flex items-center justify-between gap-3">
      <span role="status" className="text-xs text-slate-600">{message}</span>
      <button type="button" disabled={!ready || saving || fetching} onClick={() => void save()} className="rounded-xl bg-slate-900 px-4 py-2 text-xs text-white disabled:opacity-50">{saving ? '保存中…' : '保存独立网关配置'}</button>
    </div>
  </section>;
}
