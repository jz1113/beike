import { useMemo, useState, type DragEventHandler } from 'react';
import { ArrowUp, ArrowDown, ChevronDown, GripVertical, Layers, Plus, RefreshCw, Search } from 'lucide-react';
import { getModelIcon } from '@client/shared/ui/ModelIcons';
import { isMultimodalWorkflowModel, workflowModelRouteId } from '@shared/domain/models/workflowModels';
import type { useCustomModels } from '../../hooks/useCustomModels';
import {
  channelName,
  MODEL_CHANNELS,
  modelChannel,
  selectModelRows,
  formatModelPrice,
  comflyQuotations,
  comflyTokenPrice,
  COMFLY_QUOTATION_DATE,
  quotationSummary,
  type CapabilityFilter,
  type ModelChannel,
  type ModelDisplaySort,
  type ComflyPriceMap,
  type WorkflowModel,
} from '../../model/modelManagement';

function ComflyModelPrice({ id, prices }: { id: string; prices?: ComflyPriceMap | null }) {
  const quotes = comflyQuotations(id);
  const primaryIndex = Math.max(0, quotes.findIndex(row => row.group === '默认分组'));
  const primary = quotes[primaryIndex];
  const otherQuotes = quotes.filter((_, index) => index !== primaryIndex);
  const allQuotes = primary ? [primary, ...otherQuotes] : otherQuotes;
  const token = comflyTokenPrice(id, prices);
  const online = Boolean(prices?.[id.toLowerCase()] && token);

  return (
    <div className="settings-price space-y-2 text-xs text-slate-600 dark:text-slate-300">
      {token ? <div className="settings-price-values">
        <div><span>输入</span><strong>฿{formatModelPrice(token.promptPer1k)}</strong></div>
        <div><span>输出</span><strong>฿{formatModelPrice(token.completionPer1k)}</strong></div>
      </div> : primary ? <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{quotationSummary(primary)}</p> : <span className="text-slate-400">暂无报价</span>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        {token && <span>每 1K token</span>}
        {online && <span title="默认分组价格来自在线接口">在线报价</span>}
      </div>
      {allQuotes.length > 0 && <details className="group">
        <summary className="flex w-fit list-none items-center gap-1 [&::-webkit-details-marker]:hidden">报价详情<ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" /></summary>
        <div className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 dark:bg-white/5 dark:border-white/10">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">报价单 · {COMFLY_QUOTATION_DATE} · {allQuotes.length} 个分组</p>
          {allQuotes.map((quote, index) => <div key={`${quote.group}-${index}`} className="border-t border-slate-200 pt-2 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-slate-700 dark:text-slate-200">{quote.group}</p>
              <p className="text-[10px] text-slate-400">第 {quote.page} 页</p>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6">{quote.detail}</p>
          </div>)}
        </div>
      </details>}
    </div>
  );
}

function WorkflowModelRow({ model, prices, isDefault, onToggleEnabled, onDeleteModel, showChannel = true, onMoveUp, onMoveDown, reorderEnabled, onDragStart, onDragOver, onDrop, onDragEnd, dropTarget }: {
  model: WorkflowModel;
  reorderEnabled?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragStart?: DragEventHandler<HTMLButtonElement>;
  onDragOver?: DragEventHandler<HTMLTableRowElement>;
  onDrop?: DragEventHandler<HTMLTableRowElement>;
  onDragEnd?: DragEventHandler<HTMLButtonElement>;
  dropTarget?: boolean;
  prices?: ComflyPriceMap | null;
  isDefault: boolean;
  showChannel?: boolean;
  onToggleEnabled: (id: string) => void;
  onDeleteModel: (id: string) => void;
}) {
  const routeId = workflowModelRouteId(model);
  const channel = modelChannel(model);
  const multimodal = isMultimodalWorkflowModel(model);
  return (
    <tr className={`border-t border-slate-100 hover:bg-slate-50/70 dark:border-white/10 ${dropTarget ? 'bg-indigo-50 outline outline-1 outline-indigo-300' : ''}`} data-model-route={routeId} onDragOver={onDragOver} onDrop={onDrop}>
      <td className="px-4 py-3 min-w-56 max-w-80">
        <div className="flex items-start gap-2.5">
          {reorderEnabled && <div className="settings-row-order">
            <button type="button" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} aria-label={`拖动排序 ${model.name || model.id}`} title="拖动排序；也可使用上下按钮" className="cursor-grab active:cursor-grabbing rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500">
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex">
              <button type="button" disabled={!onMoveUp} onClick={onMoveUp} aria-label={`上移 ${model.name || model.id}`} title="上移">
                <ArrowUp className="h-3 w-3" />
              </button>
              <button type="button" disabled={!onMoveDown} onClick={onMoveDown} aria-label={`下移 ${model.name || model.id}`} title="下移">
                <ArrowDown className="h-3 w-3" />
              </button>
            </div>
          </div>}
          <div className="mt-0.5 w-8 h-8 shrink-0 rounded-lg flex items-center justify-center bg-transparent">{getModelIcon(model.id, 'w-4 h-4')}</div>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-slate-900 break-words dark:text-slate-100">{model.name || model.id}</div>
            <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5 dark:text-slate-400" title={routeId}>{model.id}</div>
            {isDefault && <span className="text-[10px] text-indigo-600">默认选择{model.enabled === false ? ' · 已停用' : ''}</span>}
          </div>
        </div>
      </td>
      {showChannel && <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap dark:text-slate-300">{channelName(channel)}</td>}
      <td className="px-3 py-3"><div className="flex flex-wrap gap-1 text-[11px]">
        {multimodal && <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700">{model.channel === 'deepseek' && !model.isVision ? '文本对话' : '多模态'}</span>}
        {model.isImage && <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700">生图</span>}
        {model.isVideo && <span className="px-2 py-1 rounded-md bg-sky-50 text-sky-700">视频</span>}
        {!multimodal && !model.isImage && !model.isVideo && <span className="text-slate-400">未识别</span>}
      </div></td>
      <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
        {channel === 'comfly' ? <ComflyModelPrice id={model.id} prices={prices} /> : <span className="text-slate-400">以渠道账单为准</span>}
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <button type="button" role="switch" aria-checked={model.enabled !== false} aria-label={`${model.name || model.id} · ${channelName(channel)}：在选择器中启用`}
          onClick={() => onToggleEnabled(routeId)} className={`px-2.5 py-1 rounded-full text-xs font-medium ${model.enabled === false ? 'bg-slate-100 text-slate-500 dark:text-slate-400 dark:bg-white/10' : 'bg-emerald-50 text-emerald-700'}`}>
          {model.enabled === false ? '已停用' : '已启用'}
        </button>
      </td>
      <td className="px-3 py-3 text-right">
        <button type="button" onClick={() => onDeleteModel(routeId)} aria-label={`移出 ${model.name || model.id} · ${channelName(channel)}`} className="text-xs text-slate-500 hover:text-rose-600 rounded-lg px-2 py-1 hover:bg-rose-50">移出</button>
      </td>
    </tr>
  );
}

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
            <h2 className="font-bold text-base text-slate-900 flex gap-2 items-center dark:text-slate-100">
              <Layers className="w-4 h-4 text-indigo-600" />
              {scope ? '已接入模型' : '模型管理'}
            </h2>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {scopedModels.length} 个模型 · {scopedModels.filter((model) => model.enabled !== false).length} 个已启用
              {rows.length !== scopedModels.length && ` · 筛选出 ${rows.length} 个`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {activeChannel !== 'all' && activeChannel !== 'deepseek' && (
              <button
                type="button"
                disabled={isDiscovering}
                onClick={() => onDiscover(activeChannel)}
                className={`${inputClass} inline-flex items-center gap-1.5 disabled:opacity-50`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
                发现模型
              </button>
            )}
            <button
              type="button"
              onClick={() => onAdd(activeChannel === 'all' ? 'comfly' : activeChannel)}
              className="h-9 px-3 rounded-lg bg-slate-900 text-white text-xs font-medium flex items-center gap-1.5 dark:bg-white dark:text-slate-950"
            >
              <Plus className="w-3.5 h-3.5" />
              添加模型
            </button>
          </div>
        </div>
        {scopedModels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <label className="relative flex-1 min-w-44">
              <Search className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-400" />
              <input
                aria-label="搜索模型"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索模型名称或 ID"
                className={`${inputClass} pl-9 w-full`}
              />
            </label>
            {!scope && (
              <select
                aria-label="筛选渠道"
                value={channel}
                onChange={(event) => setChannel(event.target.value as typeof channel)}
                className={inputClass}
              >
                <option value="all">全部渠道</option>
                {MODEL_CHANNELS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="筛选能力"
              value={capability}
              onChange={(event) => setCapability(event.target.value as CapabilityFilter)}
              className={inputClass}
            >
              <option value="all">全部能力</option>
              <option value="multimodal">多模态</option>
              <option value="text">文本对话</option>
              <option value="image">生图</option>
              <option value="video">视频</option>
            </select>
            <select
              aria-label="筛选启用状态"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className={inputClass}
            >
              <option value="all">全部状态</option>
              <option value="enabled">已启用</option>
              <option value="disabled">已停用</option>
            </select>
            <select
              aria-label="展示排序"
              value={sort}
              onChange={(event) => setSort(event.target.value as ModelDisplaySort)}
              className={inputClass}
            >
              <option value="configured">手动排序</option>
              <option value="name">名称排序</option>
              <option value="price">文本价格升序</option>
            </select>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          {onManageAll ? (
            <button type="button" onClick={onManageAll} className="hover:text-indigo-600">
              全部渠道模型 →
            </button>
          ) : (
            <span />
          )}
          {showComflyQuote && (
            <button
              type="button"
              disabled={models.isFetchingPrices}
              onClick={models.handleRefreshPrices}
              className="inline-flex items-center gap-1.5 hover:text-indigo-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${models.isFetchingPrices ? 'animate-spin' : ''}`} />
              {models.isFetchingPrices ? '刷新中…' : '刷新报价'}
            </button>
          )}
        </div>
      </div>
      {scopedModels.length > 1 && (
        <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
          {sort === 'configured' ? '拖动左侧手柄或点击箭头调整顺序，自动保存。' : '切换到「手动排序」可移动模型。'}
        </p>
      )}
      {rows.length === 0 ? (
        <div className="settings-empty-state">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {scopedModels.length ? '没有匹配的模型线路' : '尚未接入模型'}
          </p>
          <p className="text-xs text-slate-500 mt-2 dark:text-slate-400">
            {scopedModels.length ? '尝试清除搜索或调整渠道、能力与状态筛选。' : '配置渠道后，发现模型或手动添加精确的模型 ID。'}
          </p>
        </div>
      ) : (
        channels.map((item) => {
          const group = rows.filter((model) => modelChannel(model) === item.id);
          if (!group.length) return null;
          return (
            <div key={item.id}>
              {!scope && (
                <div className="flex items-center justify-between gap-3 px-1 py-3 mt-2">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {item.name}
                    <span className="ml-2 text-slate-400 font-normal">{group.length} 条线路</span>
                  </h3>
                  {!scope && (
                    <button type="button" onClick={() => onConfigure(item.id)} className="text-xs text-indigo-600">
                      配置渠道 →
                    </button>
                  )}
                </div>
              )}
              <p className="md:hidden px-4 pt-2 text-[10px] text-slate-400">左右滑动表格查看报价、启停和移出操作</p>
              <div className="settings-model-table">
                <table className="w-full min-w-[720px] table-fixed text-left">
                  <colgroup>
                    <col style={{ width: scope ? '34%' : '26%' }} />
                    {!scope && <col className="w-[12%]" />}
                    <col className="w-[12%]" />
                    <col style={{ width: scope ? '34%' : '30%' }} />
                    <col className="w-[12%]" />
                    <col className="w-[8%]" />
                  </colgroup>
                  <thead>
                    <tr className="text-[11px] text-slate-400">
                      <th className="px-4 py-2 font-medium">模型 / 上游 ID</th>
                      {!scope && <th className="px-3 py-2 font-medium">渠道</th>}
                      <th className="px-3 py-2 font-medium">能力</th>
                      <th className="px-3 py-2 font-medium">参考报价</th>
                      <th className="px-3 py-2 font-medium">启用状态</th>
                      <th className="px-3 py-2 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((model, index) => (
                      <WorkflowModelRow
                        key={workflowModelRouteId(model)}
                        model={model}
                        reorderEnabled={sort === 'configured'}
                        dropTarget={dropTarget === workflowModelRouteId(model)}
                        onMoveUp={
                          index > 0
                            ? () => models.handleReorderModel(workflowModelRouteId(model), workflowModelRouteId(group[index - 1]), group.map(workflowModelRouteId))
                            : undefined
                        }
                        onMoveDown={
                          index < group.length - 1
                            ? () => models.handleReorderModel(workflowModelRouteId(model), workflowModelRouteId(group[index + 1]), group.map(workflowModelRouteId))
                            : undefined
                        }
                        onDragStart={(event) => {
                          setDragged(workflowModelRouteId(model));
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', workflowModelRouteId(model));
                        }}
                        onDragEnd={() => {
                          setDragged(null);
                          setDropTarget(null);
                        }}
                        onDragOver={(event) => {
                          if (
                            sort === 'configured' &&
                            dragged &&
                            dragged !== workflowModelRouteId(model) &&
                            group.some((entry) => workflowModelRouteId(entry) === dragged)
                          ) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setDropTarget(workflowModelRouteId(model));
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (sort === 'configured' && dragged) {
                            models.handleReorderModel(dragged, workflowModelRouteId(model), group.map(workflowModelRouteId));
                          }
                          setDragged(null);
                          setDropTarget(null);
                        }}
                        showChannel={!scope}
                        prices={models.comflyPrices}
                        isDefault={defaultRouteIds.includes(workflowModelRouteId(model))}
                        onToggleEnabled={models.handleToggleEnabled}
                        onDeleteModel={models.handleDeleteModel}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
      <footer className="pt-4 flex flex-wrap justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        <details className="max-w-2xl">
          <summary className="cursor-pointer hover:text-slate-700">报价与启用说明</summary>
          <p className="mt-2 leading-6">
            启停控制模型在业务选择器中的显示，不影响渠道连接与后端故障处理。
            {showComflyQuote && '价格为参考报价，文本价格按默认分组比较。'}
            实际扣费以渠道账单为准。
          </p>
        </details>
        {activeChannel !== 'all' && activeChannel !== 'openai' && activeChannel !== 'deepseek' && (
          <button
            type="button"
            onClick={() => models.handleResetDefaultModels(activeChannel)}
            className="text-slate-600 underline underline-offset-4 dark:text-slate-300"
          >
            恢复{channelName(activeChannel)}内置模型
          </button>
        )}
      </footer>
    </section>
  );
}
