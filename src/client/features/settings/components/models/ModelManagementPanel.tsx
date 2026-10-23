import { useMemo, useState } from 'react';
import { Layers, Plus, RefreshCw, Search } from 'lucide-react';
import { workflowModelRouteId } from '@shared/domain/models/workflowModels';
import type { useCustomModels } from '../../hooks/useCustomModels';
import { channelName, MODEL_CHANNELS, modelChannel, selectModelRows, type CapabilityFilter, type ModelChannel, type ModelDisplaySort } from '../../model/modelManagement';
import WorkflowModelRow from './WorkflowModelRow';

export function ModelManagementPanel({ models, scope, onAdd, onConfigure, onDiscover, isDiscovering, defaultRouteIds, onManageAll }: {
  models: ReturnType<typeof useCustomModels>;
  scope?: ModelChannel;
  onManageAll?: () => void;
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
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const activeChannel = scope ?? channel;
  const showComflyQuote = activeChannel === 'all' || activeChannel === 'comfly';
  const scopedModels = useMemo(() => models.customModels.filter(model => activeChannel === 'all' || modelChannel(model) === activeChannel), [models.customModels, activeChannel]);
  const rows = selectModelRows(models.customModels, { channel: activeChannel, capability, query, status, sort, prices: models.comflyPrices });
  const channels = MODEL_CHANNELS.filter(item => activeChannel === 'all' || activeChannel === item.id);
  const inputClass = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-indigo-500 dark:text-slate-200 dark:border-white/10 dark:bg-[#18191c]';
  return (
    <section className="settings-model-panel min-w-0" aria-label={scope ? '本渠道模型' : '全局模型管理'}>
      <div className="pb-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-base text-slate-900 flex gap-2 items-center dark:text-slate-100"><Layers className="w-4 h-4 text-indigo-600" />{scope ? '已接入模型' : '模型管理'}</h2>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{scopedModels.length} 个模型 · {scopedModels.filter(model => model.enabled !== false).length} 个已启用{rows.length !== scopedModels.length && ` · 筛选出 ${rows.length} 个`}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {activeChannel !== 'all' && activeChannel !== 'deepseek' && <button type="button" disabled={isDiscovering} onClick={() => onDiscover(activeChannel)} className={`${inputClass} inline-flex items-center gap-1.5 disabled:opacity-50`}><RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />发现模型</button>}
            <button type="button" onClick={() => onAdd(activeChannel === 'all' ? 'comfly' : activeChannel)} className="h-9 px-3 rounded-lg bg-slate-900 text-white text-xs font-medium flex items-center gap-1.5 dark:bg-white dark:text-slate-950"><Plus className="w-3.5 h-3.5" />添加模型</button>
          </div>
        </div>
        {scopedModels.length > 0 && <div className="flex flex-wrap gap-2">
          <label className="relative flex-1 min-w-44"><Search className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-400" /><input aria-label="搜索模型" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索模型名称或 ID" className={`${inputClass} pl-9 w-full`} /></label>
          {!scope && <select aria-label="筛选渠道" value={channel} onChange={event => setChannel(event.target.value as typeof channel)} className={inputClass}><option value="all">全部渠道</option>{MODEL_CHANNELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          <select aria-label="筛选能力" value={capability} onChange={event => setCapability(event.target.value as CapabilityFilter)} className={inputClass}><option value="all">全部能力</option><option value="multimodal">多模态</option><option value="text">文本对话</option><option value="image">生图</option><option value="video">视频</option></select>
          <select aria-label="筛选启用状态" value={status} onChange={event => setStatus(event.target.value as typeof status)} className={inputClass}><option value="all">全部状态</option><option value="enabled">已启用</option><option value="disabled">已停用</option></select>
          <select aria-label="展示排序" value={sort} onChange={event => setSort(event.target.value as ModelDisplaySort)} className={inputClass}><option value="configured">手动排序</option><option value="name">名称排序</option><option value="price">文本价格升序</option></select>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          {onManageAll ? <button type="button" onClick={onManageAll} className="hover:text-indigo-600">全部渠道模型 →</button> : <span />}
          {showComflyQuote && <button type="button" disabled={models.isFetchingPrices} onClick={models.handleRefreshPrices} className="inline-flex items-center gap-1.5 hover:text-indigo-600 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${models.isFetchingPrices ? 'animate-spin' : ''}`} />{models.isFetchingPrices ? '刷新中…' : '刷新报价'}</button>}
        </div>
      </div>
      {scopedModels.length > 1 && <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">{sort === 'configured' ? '拖动左侧手柄或点击箭头调整顺序，自动保存。' : '切换到「手动排序」可移动模型。'}</p>}
      {rows.length === 0 ? <div className="settings-empty-state"><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{scopedModels.length ? '没有匹配的模型线路' : '尚未接入模型'}</p><p className="text-xs text-slate-500 mt-2 dark:text-slate-400">{scopedModels.length ? '尝试清除搜索或调整渠道、能力与状态筛选。' : '配置渠道后，发现模型或手动添加精确的模型 ID。'}</p></div> : channels.map(item => {
        const group = rows.filter(model => modelChannel(model) === item.id);
        if (!group.length) return null;
        return <div key={item.id}>
          {!scope && <div className="flex items-center justify-between gap-3 px-1 py-3 mt-2">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">{item.name}<span className="ml-2 text-slate-400 font-normal">{group.length} 条线路</span></h3>
            {!scope && <button type="button" onClick={() => onConfigure(item.id)} className="text-xs text-indigo-600">配置渠道 →</button>}
          </div>}
          <p className="md:hidden px-4 pt-2 text-[10px] text-slate-400">左右滑动表格查看报价、启停和移出操作</p>
          <div className="settings-model-table"><table className="w-full min-w-[720px] table-fixed text-left"><colgroup><col style={{ width: scope ? '34%' : '26%' }} />{!scope && <col className="w-[12%]" />}<col className="w-[12%]" /><col style={{ width: scope ? '34%' : '30%' }} /><col className="w-[12%]" /><col className="w-[8%]" /></colgroup><thead><tr className="text-[11px] text-slate-400"><th className="px-4 py-2 font-medium">模型 / 上游 ID</th>{!scope && <th className="px-3 py-2 font-medium">渠道</th>}<th className="px-3 py-2 font-medium">能力</th><th className="px-3 py-2 font-medium">参考报价</th><th className="px-3 py-2 font-medium">启用状态</th><th className="px-3 py-2 font-medium text-right">操作</th></tr></thead>
            <tbody>{group.map((model, index) => <WorkflowModelRow key={workflowModelRouteId(model)} model={model}
              reorderEnabled={sort === 'configured'} dropTarget={dropTarget === workflowModelRouteId(model)}
              onMoveUp={index > 0 ? () => models.handleReorderModel(workflowModelRouteId(model), workflowModelRouteId(group[index - 1]), group.map(workflowModelRouteId)) : undefined}
              onMoveDown={index < group.length - 1 ? () => models.handleReorderModel(workflowModelRouteId(model), workflowModelRouteId(group[index + 1]), group.map(workflowModelRouteId)) : undefined}
              onDragStart={event => { setDragged(workflowModelRouteId(model)); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', workflowModelRouteId(model)); }}
              onDragEnd={() => { setDragged(null); setDropTarget(null); }}
              onDragOver={event => { if (sort === 'configured' && dragged && dragged !== workflowModelRouteId(model) && group.some(entry => workflowModelRouteId(entry) === dragged)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(workflowModelRouteId(model)); } }}
              onDrop={event => { event.preventDefault(); if (sort === 'configured' && dragged) models.handleReorderModel(dragged, workflowModelRouteId(model), group.map(workflowModelRouteId)); setDragged(null); setDropTarget(null); }}
              showChannel={!scope} prices={models.comflyPrices} isDefault={defaultRouteIds.includes(workflowModelRouteId(model))}
              onToggleEnabled={models.handleToggleEnabled} onDeleteModel={models.handleDeleteModel} />)}</tbody>
          </table></div>
        </div>;
      })}
      <footer className="pt-4 flex flex-wrap justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        <details className="max-w-2xl"><summary className="cursor-pointer hover:text-slate-700">报价与启用说明</summary><p className="mt-2 leading-6">启停控制模型在业务选择器中的显示，不影响渠道连接与后端故障处理。{showComflyQuote && '价格为参考报价，文本价格按默认分组比较。'}实际扣费以渠道账单为准。</p></details>
        {activeChannel !== 'all' && activeChannel !== 'openai' && activeChannel !== 'deepseek' && <button type="button" onClick={() => models.handleResetDefaultModels(activeChannel)} className="text-slate-600 underline underline-offset-4 dark:text-slate-300">恢复{channelName(activeChannel)}内置模型</button>}
      </footer>
    </section>
  );
}
