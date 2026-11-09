import { useState, useMemo, useRef, useEffect } from 'react';
import {
  X, Search, Sparkles, Image as ImageIcon, Video, ChevronRight, ChevronLeft,
  CheckCheck, AlertCircle, Loader2, Building2, Eye, Lightbulb, Wrench, Plus, Check, ChevronDown, FolderPlus,
} from 'lucide-react';
import { getModelIcon } from '@client/shared/ui/ModelIcons';
import { settingsModalShell, settingsPanelPad } from '@client/shared/ui/layoutClasses';
import { VENDORS, identifyVendor, type VendorMeta } from '@shared/domain/models/vendorRegistry';
import { channelDisplayName } from '@shared/domain/models/deepseek';
import {
  gatewayRouteId,
  parseGatewayModels,
  matchesGatewayModelType,
  type GatewayModelItem as GatewayModelItemType,
  type GatewayModelType,
  type GatewayChannel,
} from '../../model/modelManagement';
import { useSettingsDialogFocus } from '../../hooks/useApiProviders';

export type GatewayModelItem = GatewayModelItemType;

function GatewayVendorGroup({ vendor, models, channel, activeModelIds, collapsed, onCollapse, onAddModels, onToggle }: {
  vendor: VendorMeta; models: GatewayModelItem[]; channel: GatewayChannel; activeModelIds: Set<string>;
  collapsed: boolean; onCollapse: () => void; onAddModels: (models: GatewayModelItem[]) => void;
  onToggle: (model: GatewayModelItem) => void;
}) {
  const addedCount = models.filter(model => activeModelIds.has(gatewayRouteId(model.id, channel))).length;
  const candidates = models.filter(model => model.supported !== false && !activeModelIds.has(gatewayRouteId(model.id, channel)));
  return <section className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs dark:border-white/10 dark:bg-[#18191c]">
    <header className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 dark:bg-white/5 dark:border-white/10">
      <button type="button" onClick={onCollapse} aria-expanded={!collapsed} aria-controls={`gateway-vendor-${vendor.id}`} className="flex items-center gap-2 text-left min-w-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500">
        <span className="w-6 h-6 shrink-0">{getModelIcon(vendor.id, 'w-full h-full')}</span>
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{vendor.name}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{models.length} 款</span>
        {addedCount > 0 && <span className="text-xs text-emerald-700">已接入 {addedCount}</span>}
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      <button type="button" disabled={!candidates.length} onClick={() => onAddModels(candidates)} className="text-xs font-bold text-slate-700 hover:text-indigo-600 px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-1 disabled:opacity-40 dark:text-slate-200 dark:border-white/10" title="接入此厂商下已适配且尚未添加的模型">
        <FolderPlus className="w-3.5 h-3.5 text-indigo-500" />接入此厂商全部
      </button>
    </header>
    {!collapsed && <div id={`gateway-vendor-${vendor.id}`} className="p-2.5 divide-y divide-slate-100 dark:divide-white/10">
      {models.map(model => {
        const added = activeModelIds.has(gatewayRouteId(model.id, channel));
        return <div key={model.id} className={`px-3 py-2.5 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 ${added ? 'bg-indigo-50/40' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-7 h-7 shrink-0 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center dark:bg-white/5 dark:border-white/10">{getModelIcon(model.id, 'w-4 h-4')}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 truncate dark:text-slate-100" title={model.name}>{model.name || model.id}</div>
              <div className="font-mono text-[11px] text-slate-500 truncate dark:text-slate-400" title={model.id}>{model.id}</div>
            </div>
            <span className="text-[10px] text-indigo-700 shrink-0">{channelDisplayName(channel)}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap pl-10 lg:pl-0 text-[11px]">
            {model.isVision && <span className="flex items-center gap-1 text-emerald-700"><Eye className="w-3 h-3" />视觉</span>}
            {model.isThinking && <span className="flex items-center gap-1 text-purple-700"><Lightbulb className="w-3 h-3" />思考</span>}
            {model.isImage && <span className="flex items-center gap-1 text-orange-700"><ImageIcon className="w-3 h-3" />生图</span>}
            {model.isVideo && <span className="flex items-center gap-1 text-sky-700"><Video className="w-3 h-3" />视频</span>}
            {model.isTool && <span className="flex items-center gap-1 text-blue-700"><Wrench className="w-3 h-3" />函数</span>}
            {model.isAudio && <span className="text-slate-500 dark:text-slate-400">音频</span>}
            {model.isEmbedding && <span className="text-slate-500 dark:text-slate-400">嵌入</span>}
            <button type="button" disabled={model.supported === false && !added} onClick={() => onToggle(model)} aria-label={`${added ? '移出' : '接入'} ${model.name || model.id}`} className={`ml-2 rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-40 ${added ? 'bg-emerald-50 text-emerald-700 hover:bg-rose-50 hover:text-rose-700' : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-white/10'}`}>
              {added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}{added ? '移出' : model.supported === false ? '暂不支持' : '接入'}
            </button>
          </div>
        </div>;
      })}
    </div>}
  </section>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  allGatewayModels: GatewayModelItem[];
  activeModelIds: Set<string>;
  onToggleAddModel: (model: GatewayModelItem) => void;
  onAddAllUsefulModels: () => void;
  onAddModels?: (models: GatewayModelItem[]) => number;
  isLoading?: boolean;
  gatewayName?: string;
  channel: GatewayChannel;
  error?: string;
  onRefresh?: () => void;
}

export default function GatewayModelModal({
  isOpen,
  onClose,
  allGatewayModels = [],
  activeModelIds,
  onToggleAddModel,
  onAddAllUsefulModels,
  onAddModels,
  isLoading = false,
  gatewayName = '网关',
  channel,
  error = '',
  onRefresh,
}: Props) {
  const dialogRef = useSettingsDialogFocus<HTMLDivElement>(isOpen, onClose);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeTab, setSelectedTypeTab] = useState<GatewayModelType>('all');
  const [selectedVendorId, setSelectedVendorId] = useState('all');
  const [collapsedVendors, setCollapsedVendors] = useState<Record<string, boolean>>({});
  const vendorRowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const catalog = useMemo(() => parseGatewayModels(allGatewayModels, channel), [allGatewayModels, channel]);
  const grouped = useMemo(() => {
    const map = new Map<string, GatewayModelItem[]>();
    for (const model of catalog) {
      const vendor = identifyVendor(model.id, model.owned_by);
      const models = map.get(vendor.id) || [];
      models.push(model);
      map.set(vendor.id, models);
    }
    return map;
  }, [catalog]);
  const matchesSearch = (model: GatewayModelItem) =>
    !searchQuery.trim() || `${model.id} ${model.name}`.toLowerCase().includes(searchQuery.trim().toLowerCase());
  const vendorCounts = Object.fromEntries(
    VENDORS.map((vendor) => [
      vendor.id,
      (grouped.get(vendor.id) || []).filter(
        (model) => matchesSearch(model) && matchesGatewayModelType(model, selectedTypeTab),
      ).length,
    ]),
  );
  const allVendorCount = Object.values(vendorCounts).reduce((sum, count) => sum + count, 0);
  const typeModels = (selectedVendorId === 'all' ? catalog : grouped.get(selectedVendorId) || []).filter(matchesSearch);
  const typeCount = (type: GatewayModelType) => typeModels.filter((model) => matchesGatewayModelType(model, type)).length;
  const filteredGroups = VENDORS.filter((vendor) => selectedVendorId === 'all' || vendor.id === selectedVendorId)
    .map((vendor) => ({
      vendor,
      models: (grouped.get(vendor.id) || []).filter(
        (model) => matchesSearch(model) && matchesGatewayModelType(model, selectedTypeTab),
      ),
    }))
    .filter((group) => group.models.length > 0);
  const totalMatchedCount = filteredGroups.reduce((sum, group) => sum + group.models.length, 0);
  useEffect(() => {
    const element = vendorRowRef.current;
    if (!isOpen || !element) return;
    const checkScroll = () => {
      setCanScrollLeft(element.scrollLeft > 10);
      setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 10);
    };
    checkScroll();
    element.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      element.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [catalog, isOpen, searchQuery, selectedTypeTab]);
  const addVendor = (models: GatewayModelItem[]) => {
    if (onAddModels) {
      onAddModels(models);
    } else {
      models.forEach(onToggleAddModel);
    }
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-3 backdrop-blur-[2px] xl:p-4 animate-fade-in font-sans">
      <div
        ref={dialogRef}
        data-settings-modal
        role="dialog"
        aria-modal="true"
        aria-labelledby="gateway-model-title"
        tabIndex={-1}
        className={`${settingsModalShell} max-w-[min(92vw,900px)] bg-white text-slate-900 shadow-xl border border-slate-200/80 flex flex-col overflow-hidden dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]`}
      >
        <header className="px-4 md:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0 dark:border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </span>
            <h2 id="gateway-model-title" className="text-base font-bold min-w-0">
              {gatewayName}模型库 <span className="text-xs text-indigo-700 font-mono">{catalog.length} 款模型</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isLoading || !catalog.some((model) => model.supported !== false)}
              onClick={onAddAllUsefulModels}
              className="text-xs font-bold text-slate-700 hover:text-indigo-600 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:bg-white/10"
            >
              <CheckCheck className="w-4 h-4 text-indigo-600" />
              一键接入受支持模型
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label="关闭模型发现"
              title="关闭 (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>
        {channel === 'openai' && (
          <p className="px-5 py-2 text-xs text-indigo-800 bg-indigo-50 border-b border-indigo-100">
            OpenAI 是调用渠道，列表内名称是模型厂商。同名模型可分别从 OpenAI 与 Comfly 接入，并在视觉模型选择器中按渠道选择。
          </p>
        )}
        <div className={`${settingsPanelPad} bg-slate-50/70 border-b border-slate-100 space-y-3 shrink-0 dark:bg-white/5 dark:border-white/10`}>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              data-initial-focus
              aria-label="搜索模型 ID 或名称"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索模型 ID 或名称"
              className="w-full pl-11 pr-14 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#18191c]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs dark:text-slate-400"
              >
                清空
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canScrollLeft && (
              <button
                type="button"
                aria-label="向前滚动厂商"
                onClick={() => vendorRowRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                className="p-1 rounded-full border border-slate-200 bg-white dark:border-white/10 dark:bg-[#18191c]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div
              ref={vendorRowRef}
              onWheel={(event) => {
                if (event.deltaY && vendorRowRef.current) vendorRowRef.current.scrollLeft += event.deltaY;
              }}
              className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 text-xs scroll-smooth flex-1 min-w-0"
            >
              <button
                type="button"
                aria-pressed={selectedVendorId === 'all'}
                onClick={() => setSelectedVendorId('all')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap shrink-0 ${selectedVendorId === 'all' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-white text-slate-600 border border-slate-200 dark:text-slate-300 dark:border-white/10 dark:bg-[#18191c]'}`}
              >
                全部厂商 {allVendorCount}
              </button>
              {VENDORS.filter((vendor) => vendorCounts[vendor.id] > 0 || vendor.id === selectedVendorId).map((vendor) => (
                <button
                  type="button"
                  key={vendor.id}
                  aria-pressed={selectedVendorId === vendor.id}
                  onClick={() => setSelectedVendorId(vendor.id)}
                  className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 ${selectedVendorId === vendor.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 dark:text-slate-300 dark:border-white/10 dark:bg-[#18191c]'}`}
                >
                  <span className="w-4 h-4">{getModelIcon(vendor.id, 'w-full h-full')}</span>
                  {vendor.name.split(' ')[0]} {vendorCounts[vendor.id] || 0}
                </button>
              ))}
            </div>
            {canScrollRight && (
              <button
                type="button"
                aria-label="向后滚动厂商"
                onClick={() => vendorRowRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                className="p-1 rounded-full border border-slate-200 bg-white dark:border-white/10 dark:bg-[#18191c]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'all', label: '全部类型', Icon: null },
                { id: 'image', label: '生图', Icon: ImageIcon },
                { id: 'multimodal', label: '多模态', Icon: Sparkles },
                { id: 'video', label: '视频', Icon: Video },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                type="button"
                key={id}
                aria-pressed={selectedTypeTab === id}
                onClick={() => setSelectedTypeTab(id)}
                className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 shrink-0 ${selectedTypeTab === id ? 'bg-slate-200 text-slate-900 dark:text-slate-100 dark:bg-white/10' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10'}`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {label} ({typeCount(id)})
              </button>
            ))}
          </div>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto ${settingsPanelPad} space-y-4`} aria-busy={isLoading}>
          {isLoading ? (
            <div role="status" className="py-20 flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-9 h-9 animate-spin text-indigo-600" />
              <span className="text-sm">正在从{gatewayName}读取模型列表…</span>
            </div>
          ) : error ? (
            <div role="alert" className="py-16 text-center space-y-3">
              <AlertCircle className="w-9 h-9 mx-auto text-amber-600" />
              <p className="text-sm text-slate-700 break-words dark:text-slate-200">{error}</p>
              {onRefresh && (
                <button type="button" onClick={onRefresh} className="settings-button-secondary">
                  重新获取模型
                </button>
              )}
            </div>
          ) : !filteredGroups.length ? (
            <div role="status" className="py-20 text-center text-slate-500 space-y-3 dark:text-slate-400">
              <AlertCircle className="w-9 h-9 mx-auto text-slate-300" />
              <p className="text-sm">{catalog.length ? '未找到匹配的模型' : '渠道没有返回模型'}</p>
              <p className="text-xs">{catalog.length ? '请更换搜索词或切换厂商、类型筛选。' : '请检查渠道配置后重新获取。'}</p>
              {!catalog.length && onRefresh && (
                <button type="button" onClick={onRefresh} className="settings-button-secondary">
                  重新获取模型
                </button>
              )}
            </div>
          ) : (
            filteredGroups.map(({ vendor, models }) => (
              <GatewayVendorGroup
                key={vendor.id}
                vendor={vendor}
                models={models}
                channel={channel}
                activeModelIds={activeModelIds}
                collapsed={Boolean(collapsedVendors[vendor.id])}
                onCollapse={() => setCollapsedVendors((previous) => ({ ...previous, [vendor.id]: !previous[vendor.id] }))}
                onAddModels={addVendor}
                onToggle={onToggleAddModel}
              />
            ))
          )}
        </div>
        <footer className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500 shrink-0 dark:text-slate-400 dark:border-white/10">
          匹配 {totalMatchedCount} 款模型 · 已添加 {activeModelIds.size} 条线路
        </footer>
      </div>
    </div>
  );
}
