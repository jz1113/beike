import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { apiFetch } from '@/shared/api/apiClient';
import { DEFAULT_KEYWORD_REVIEW_MODEL, KEYWORD_REVIEW_MODEL_STORAGE_KEY, loadKeywordReviewModels } from '@/features/keyword-review/model/keywordReviewModels';

type CatalogModel = { id: string; name: string; inputModalities: string[] };

function getCurrentKeywordReviewModel() {
  const options = loadKeywordReviewModels();
  try {
    const selected = localStorage.getItem(KEYWORD_REVIEW_MODEL_STORAGE_KEY) || DEFAULT_KEYWORD_REVIEW_MODEL;
    return options.find(option => option.value === selected) ?? options[0];
  } catch {
    return options.find(option => option.value === DEFAULT_KEYWORD_REVIEW_MODEL) ?? options[0];
  }
}

export function DeepSeekModelDirectory({ apiKey }: { apiKey: string }) {
  const [models, setModels] = useState<CatalogModel[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [currentKeywordReviewModel] = useState(getCurrentKeywordReviewModel);
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
  const visible = models?.filter(model => `${model.id} ${model.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  const currentDeepSeekModelId = currentKeywordReviewModel?.provider === 'deepseek' ? currentKeywordReviewModel.model.toLowerCase() : null;
  return <section className="pt-6 border-t border-slate-200/70 space-y-4" aria-label="DeepSeek 官方模型目录">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-semibold text-slate-900">官方模型目录{models && <span className="ml-2 text-xs font-normal text-slate-500">{models.length} 款</span>}</h3><p className="mt-1.5 text-xs text-slate-500">实时显示此密钥可访问的模型；业务支持范围以各功能的模型选择器为准。</p>
        {currentKeywordReviewModel && <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /><span className="shrink-0 font-semibold">关键词审核当前使用</span><span className="truncate font-medium">{currentKeywordReviewModel.label}</span></p>}
      </div>
      <button type="button" onClick={() => void fetchModels()} disabled={loading || !apiKey.trim()} className="h-9 px-3 rounded-lg bg-slate-900 text-white text-xs inline-flex items-center gap-2 disabled:opacity-40"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />{loading ? '拉取中…' : '拉取 DeepSeek 模型'}</button>
    </div>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    {models === null && !error && <p className="py-5 text-xs text-slate-500">{loading ? '正在读取官方模型目录…' : apiKey.trim() ? '点击拉取，查看官方返回的完整模型列表。' : '填写 DeepSeek API Key 后即可拉取模型。'}</p>}
    {models && <>
      <label className="flex items-center gap-2 border-b border-slate-200 py-2"><Search className="w-4 h-4 text-slate-400" /><input aria-label="搜索 DeepSeek 模型" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索官方模型" className="w-full bg-transparent outline-none text-xs" /></label>
      <div className="divide-y divide-slate-200/60">{visible?.map(model => {
        const isCurrent = currentDeepSeekModelId === model.id.toLowerCase();
        return <div key={model.id} className={`py-3 flex items-center justify-between gap-4 ${isCurrent ? 'rounded-lg bg-emerald-50/60 px-3' : ''}`}>
          <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">{model.name}{isCurrent && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800"><CheckCircle2 className="h-3 w-3" />当前使用</span>}</p><code className="text-xs text-slate-500 break-all">{model.id}</code></div>
          <span className="text-xs text-slate-500 shrink-0">{model.inputModalities.includes('image') ? '文本 · 图像理解' : model.inputModalities.includes('text') ? '文本' : '能力未声明'}</span>
        </div>;
      })}</div>
      {!visible?.length && <p className="text-xs text-slate-500 py-4">{models.length ? '没有匹配的模型' : '官方接口返回了空目录'}</p>}
    </>}
  </section>;
}
