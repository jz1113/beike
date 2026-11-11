import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { apiFetch } from '@client/shared/api/apiClient';
import { FalDirectoryResponseSchema, type FalDirectoryModel } from '@shared/contracts/generate';
import { isFalVideoBase } from '@shared/domain/media/videoChannels';
import { getApprovedModel } from '@shared/domain/models/modelCatalog';
import { loadStoredProviders } from '../../model/apiProviderTypes';
import {
  appendImportedModalityModels, loadStoredModalityModels, notifyWorkflowModels, saveStoredModalityModels,
} from '../../model/modalityModelStorage';
import { PROVIDER_CREDENTIALS_CHANGED_EVENT } from '../../model/providerCredentialSync';

const selectionKey = 'beike.settings.falModelSelection';
const pageSize = 35;
const catalogQueryKey = ['settings', 'fal-model-directory'];
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/[0.07]';
const inputClass = 'min-h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs dark:border-white/10 dark:bg-[#1b1b1e]';

function readSelection(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(selectionKey) || '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function readFalChannels() {
  return loadStoredProviders().filter(provider => provider.enabled !== false
    && provider.providerType === 'fal' && Boolean(provider.apiKey.trim()) && isFalVideoBase(provider.baseUrl));
}

async function fetchDirectory(signal: AbortSignal) {
  const response = await apiFetch('/api/system/models/fal', { signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'fal 官方目录拉取失败，请重试');
  return FalDirectoryResponseSchema.parse(data);
}

function downloadList(models: readonly FalDirectoryModel[]) {
  const rows = models.map(model => [
    model.name, model.lab, model.id.startsWith('group:') ? model.id.slice('group:'.length) : '',
  ].join('\t'));
  const contents = ['模型名称\t厂商\tfal 官方分组', ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([contents + '\n'], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fal-模型名单.txt';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FalCatalogPanel({ showToast, onConfigure }: { showToast: (message: string) => void; onConfigure: () => void }) {
  const [selection, setSelection] = useState(readSelection);
  const [channels, setChannels] = useState(readFalChannels);
  const [channelId, setChannelId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const catalog = useQuery({
    queryKey: catalogQueryKey,
    queryFn: ({ signal }) => fetchDirectory(signal),
    staleTime: 10 * 60_000,
    retry: false,
  });

  useEffect(() => {
    const refreshChannels = () => setChannels(readFalChannels());
    const onStorage = (event: StorageEvent) => {
      if (event.key === selectionKey || event.key === null) setSelection(readSelection());
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(PROVIDER_CREDENTIALS_CHANGED_EVENT, refreshChannels);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PROVIDER_CREDENTIALS_CHANGED_EVENT, refreshChannels);
    };
  }, []);

  const models = useMemo(() => catalog.data?.models ?? [], [catalog.data]);
  const selectedModels = useMemo(() => models.filter(model => selection.has(model.id)), [models, selection]);
  const compatible = selectedModels.flatMap(model => {
    if (!model.videoModelId) return [];
    const approved = getApprovedModel(model.videoModelId);
    return approved?.capability === 'video' ? [{ modelId: approved.id, name: approved.name, vendor: approved.vendor }] : [];
  });
  const channel = channels.find(item => item.id === channelId) || channels[0];
  const matching = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (selectedOnly ? selectedModels : models).filter(model => !query
      || [model.name, model.lab, model.id].some(value => value.toLowerCase().includes(query))
      || model.endpoints.some(endpoint => endpoint.id.toLowerCase().includes(query)));
  }, [models, search, selectedModels, selectedOnly]);
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const visiblePage = Math.min(page, pages);

  function changeSelection(id: string, checked: boolean) {
    const next = readSelection();
    if (checked) next.add(id);
    else next.delete(id);
    try {
      localStorage.setItem(selectionKey, JSON.stringify([...next]));
      setSelection(next);
    } catch {
      showToast('无法保存 fal 模型选择，请检查浏览器存储');
    }
  }

  function syncVideoModels() {
    const target = readFalChannels().find(item => item.id === channel?.id);
    if (!target || compatible.length === 0) return;
    try {
      const current = loadStoredModalityModels('video');
      const next = appendImportedModalityModels(current, 'video', compatible, target.id, target.name);
      if (next.added) {
        saveStoredModalityModels('video', next.models);
        notifyWorkflowModels('video');
      }
      showToast(next.added ? `已同步 ${next.added} 个模型到「视频」` : '所选模型已同步到「视频」');
    } catch {
      showToast('无法保存视频模型，请检查浏览器存储');
    }
  }

  return (
    <section aria-label="fal 模型目录" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="relative min-w-48 flex-1 sm:max-w-96">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input type="search" aria-label="搜索 fal 模型" placeholder="搜索模型、厂商或端点" value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }} className={`${inputClass} w-full pl-8`} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClass} disabled={catalog.isFetching} onClick={() => void catalog.refetch()}>
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${catalog.isFetching ? 'animate-spin' : ''}`} />
            {catalog.isFetching ? '拉取中…' : '拉取目录'}
          </button>
          <button type="button" className={buttonClass} disabled={!matching.length} onClick={() => downloadList(matching)}>
            <Download aria-hidden="true" className="h-3.5 w-3.5" />下载名单
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span role="status">{models.length ? `${models.length} 个模型条目 · ` : ''}已选 {selection.size}</span>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-indigo-600" checked={selectedOnly}
            onChange={event => { setSelectedOnly(event.target.checked); setPage(1); }} />
          仅显示已选
        </label>
      </div>
      {selection.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-white/[0.05]">
          <span className="text-slate-600 dark:text-slate-300">
            {compatible.length > 0 ? `已选 ${compatible.length} 个可同步的视频模型` : '已选模型保存在当前浏览器'}
          </span>
          {compatible.length > 0 && (channel ? (
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="fal 视频渠道" className={inputClass} value={channel.id} onChange={event => setChannelId(event.target.value)}>
                {channels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <button type="button" className={buttonClass} onClick={syncVideoModels}>同步到视频</button>
            </div>
          ) : <button type="button" className={buttonClass} onClick={onConfigure}>配置 fal 渠道</button>)}
        </div>
      )}
      {catalog.error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{catalog.error.message}</p>}
      {catalog.isPending && catalog.isFetching && <p className="py-8 text-center text-sm text-slate-500" role="status">正在读取 fal 官网模型目录…</p>}
      {catalog.data && matching.length === 0 && <p className="py-8 text-center text-sm text-slate-500">没有符合条件的模型</p>}
      {matching.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-white/[0.08] dark:border-white/10">
          {matching.slice((visiblePage - 1) * pageSize, visiblePage * pageSize).map(model => (
            <li key={model.id} className="flex items-start gap-3 px-3 py-2.5">
              <input type="checkbox" aria-label={`选择 ${model.name}`} className="mt-1.5 shrink-0 accent-indigo-600"
                checked={selection.has(model.id)} onChange={event => changeSelection(model.id, event.target.checked)} />
              <details className="min-w-0 flex-1">
                <summary className="cursor-pointer break-words text-sm font-medium leading-6">
                  {model.name}
                  {model.lab && <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">{model.lab}</span>}
                </summary>
                <ul className="mt-2 space-y-2 pb-1">
                  {model.endpoints.map(endpoint => (
                    <li key={endpoint.id}>
                      <a href={`https://fal.ai/models/${endpoint.id}/api`} target="_blank" rel="noreferrer"
                        className="inline-flex max-w-full items-start gap-1.5 break-all text-xs text-indigo-700 hover:underline dark:text-indigo-300">
                        <span>{endpoint.label} · {endpoint.id}</span><ExternalLink aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">{matching.length} 条 · {visiblePage}/{pages}</span>
          <button type="button" aria-label="上一页" className={buttonClass} disabled={visiblePage === 1} onClick={() => setPage(visiblePage - 1)}><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-label="下一页" className={buttonClass} disabled={visiblePage === pages} onClick={() => setPage(visiblePage + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </section>
  );
}
