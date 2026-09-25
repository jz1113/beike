import { useMemo, useState } from 'react';
import { Layers, Plus, RefreshCw, Search } from 'lucide-react';
import { workflowModelRouteId } from '@beike/domain/workflowModels';
import { COMFY_MODEL_PRICING } from '@/shared/utils/modelPricing.data';
import type { useCustomModels } from '../hooks/useCustomModels';
import { channelName, MODEL_CHANNELS, modelChannel, selectModelRows, type CapabilityFilter, type ModelChannel, type ModelDisplaySort } from '../modelManagement';
import WorkflowModelRow from '../WorkflowModelRow';

export function ModelManagementPanel({ models, scope, onAdd, onConfigure, onDiscover, isDiscovering, defaultRouteIds }: {
  models: ReturnType<typeof useCustomModels>;
  scope?: ModelChannel;
  onAdd: (channel: ModelChannel) => void;
  onConfigure: (channel: ModelChannel) => void;
  onDiscover: (channel: ModelChannel) => void;
  isDiscovering: boolean;
  defaultRouteIds: string[];
}) {
  const [channel, setChannel] = useState<ModelChannel | 'all'>('all');
  const [capability, setCapability] = useState<CapabilityFilter>('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [sort, setSort] = useState<ModelDisplaySort>('configured');
  const activeChannel = scope ?? channel;
  const scopedModels = useMemo(() => models.customModels.filter(model => activeChannel === 'all' || modelChannel(model) === activeChannel), [models.customModels, activeChannel]);
  const rows = selectModelRows(models.customModels, { channel: activeChannel, capability, query, status, sort, prices: models.comflyPrices });
  const channels = MODEL_CHANNELS.filter(item => activeChannel === 'all' || activeChannel === item.id);
  const inputClass = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-indigo-500';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs" aria-label={scope ? '本渠道模型' : '全局模型管理'}>
      <div className="p-4 sm:p-5 border-b border-slate-100 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-base text-slate-900 flex gap-2 items-center"><Layers className="w-4 h-4 text-indigo-600" />{scope ? '本渠道已接入模型' : '全部已接入模型'}</h2>
            <p className="mt-1.5 text-xs text-slate-500">已接入 {scopedModels.length} 条线路 · 选择器启用 {scopedModels.filter(model => model.enabled !== false).length} 条 · 当前筛选 {rows.length} 条</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {activeChannel !== 'all' && <button type="button" disabled={isDiscovering} onClick={() => onDiscover(activeChannel)} className={`${inputClass} inline-flex items-center gap-1.5 disabled:opacity-50`}><RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />发现渠道模型</button>}
            <button type="button" onClick={() => onAdd(activeChannel === 'all' ? 'comfly' : activeChannel)} className="h-9 px-3 rounded-lg bg-slate-900 text-white text-xs font-medium flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />添加模型</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative flex-1 min-w-44"><Search className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-400" /><input aria-label="搜索模型" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称、模型 ID 或渠道" className={`${inputClass} pl-9 w-full`} /></label>
          {!scope && <select aria-label="筛选渠道" value={channel} onChange={event => setChannel(event.target.value as typeof channel)} className={inputClass}><option value="all">全部渠道</option>{MODEL_CHANNELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          <select aria-label="筛选能力" value={capability} onChange={event => setCapability(event.target.value as CapabilityFilter)} className={inputClass}><option value="all">全部能力</option><option value="multimodal">多模态</option><option value="image">生图</option><option value="video">视频</option></select>
          <select aria-label="筛选启用状态" value={status} onChange={event => setStatus(event.target.value as typeof status)} className={inputClass}><option value="all">全部状态</option><option value="enabled">已启用</option><option value="disabled">已停用</option></select>
          <select aria-label="展示排序" value={sort} onChange={event => setSort(event.target.value as ModelDisplaySort)} className={inputClass}><option value="configured">接入顺序</option><option value="name">名称排序</option><option value="price">Comfly 报价升序</option></select>
        </div>
        <div className="flex flex-wrap gap-2 justify-between text-[11px] text-slate-500">
          <p>按渠道分组；筛选和排序仅改变展示，不修改默认模型或故障处理策略。</p>
          <button type="button" disabled={models.isFetchingPrices} onClick={models.handleRefreshPrices} className="text-indigo-600 disabled:opacity-50">{models.isFetchingPrices ? '刷新中…' : '刷新 Comfly 报价'}</button>
        </div>
      </div>
      {rows.length === 0 ? <div className="px-5 py-12 text-center"><p className="text-sm font-semibold text-slate-700">{scopedModels.length ? '没有匹配的模型线路' : '尚未接入模型'}</p><p className="text-xs text-slate-500 mt-2">{scopedModels.length ? '尝试清除搜索或调整渠道、能力与状态筛选。' : '配置渠道后，发现模型或手动添加精确的模型 ID。'}</p></div> : channels.map(item => {
        const group = rows.filter(model => modelChannel(model) === item.id);
        if (!group.length) return null;
        return <div key={item.id}>
          <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2.5 border-y border-slate-100">
            <h3 className="text-xs font-bold text-slate-700">{item.name}<span className="ml-2 text-slate-400 font-normal">{group.length} 条线路</span></h3>
            {!scope && <button type="button" onClick={() => onConfigure(item.id)} className="text-xs text-indigo-600">配置渠道 →</button>}
          </div>
          <p className="md:hidden px-4 pt-2 text-[10px] text-slate-400">左右滑动表格查看报价、启停和移出操作</p>
          <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="text-[11px] text-slate-400"><th className="px-4 py-2 font-medium">模型 / 上游 ID</th><th className="px-3 py-2 font-medium">渠道</th><th className="px-3 py-2 font-medium">能力</th><th className="px-3 py-2 font-medium">参考报价</th><th className="px-3 py-2 font-medium">选择器状态</th><th className="px-3 py-2 font-medium text-right">操作</th></tr></thead>
            <tbody>{group.map(model => <WorkflowModelRow key={workflowModelRouteId(model)} model={model}
              price={(models.comflyPrices ?? COMFY_MODEL_PRICING)[model.id.toLowerCase()]} isDefault={defaultRouteIds.includes(workflowModelRouteId(model))}
              onToggleEnabled={models.handleToggleEnabled} onDeleteModel={models.handleDeleteModel} />)}</tbody>
          </table></div>
        </div>;
      })}
      <footer className="p-4 border-t border-slate-100 flex flex-wrap justify-between gap-3 text-[11px] text-slate-500">
        <p className="max-w-2xl">能力来自模型目录，不是连接测试结果。启停只控制业务选择器，不代表渠道连通或后端降级池启停。报价来源：Comfly 默认分组{models.comflyPrices ? '在线报价' : '本地快照'}（฿）；实际扣费以渠道账单为准。未知报价不参与比较。</p>
        {activeChannel !== 'all' && activeChannel !== 'openai' && <button type="button" onClick={() => models.handleResetDefaultModels(activeChannel)} className="text-slate-600 underline underline-offset-4">恢复{channelName(activeChannel)}内置模型</button>}
      </footer>
    </section>
  );
}
