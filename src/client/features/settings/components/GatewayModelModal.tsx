import { useState, useMemo, useRef, useEffect } from 'react';
import { X, Search, Sparkles, Image as ImageIcon, Video, ChevronRight, ChevronLeft, CheckCheck, AlertCircle, Loader2, Building2 } from 'lucide-react';
import { getModelIcon } from '@client/shared/ui/ModelIcons';
import { settingsModalShell, settingsPanelPad } from '@client/shared/ui/layoutClasses';
import { VENDORS, identifyVendor } from '@shared/domain/models/vendorRegistry';
import { parseGatewayModels, matchesGatewayModelType, type GatewayModelItem, type GatewayModelType, type GatewayChannel } from '../model/gatewayModelCatalog';
import { useSettingsDialogFocus } from '../hooks/useSettingsDialogFocus';
import GatewayVendorGroup from './GatewayVendorGroup';
export type { GatewayModelItem } from '../model/gatewayModelCatalog';

interface Props {
  isOpen: boolean; onClose: () => void; allGatewayModels: GatewayModelItem[]; activeModelIds: Set<string>;
  onToggleAddModel: (model: GatewayModelItem) => void; onAddAllUsefulModels: () => void;
  onAddModels?: (models: GatewayModelItem[]) => number;
  isLoading?: boolean; gatewayName?: string; channel: GatewayChannel;
  error?: string; onRefresh?: () => void;
}

export default function GatewayModelModal({ isOpen, onClose, allGatewayModels = [], activeModelIds, onToggleAddModel, onAddAllUsefulModels, onAddModels, isLoading = false, gatewayName = '网关', channel, error = '', onRefresh }: Props) {
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
      models.push(model); map.set(vendor.id, models);
    }
    return map;
  }, [catalog]);
  const matchesSearch = (model: GatewayModelItem) => !searchQuery.trim() || `${model.id} ${model.name}`.toLowerCase().includes(searchQuery.trim().toLowerCase());
  const vendorCounts = Object.fromEntries(VENDORS.map(vendor => [vendor.id, (grouped.get(vendor.id) || []).filter(model => matchesSearch(model) && matchesGatewayModelType(model, selectedTypeTab)).length]));
  const allVendorCount = Object.values(vendorCounts).reduce((sum, count) => sum + count, 0);
  const typeModels = (selectedVendorId === 'all' ? catalog : grouped.get(selectedVendorId) || []).filter(matchesSearch);
  const typeCount = (type: GatewayModelType) => typeModels.filter(model => matchesGatewayModelType(model, type)).length;
  const filteredGroups = VENDORS.filter(vendor => selectedVendorId === 'all' || vendor.id === selectedVendorId)
    .map(vendor => ({ vendor, models: (grouped.get(vendor.id) || []).filter(model => matchesSearch(model) && matchesGatewayModelType(model, selectedTypeTab)) }))
    .filter(group => group.models.length > 0);
  const totalMatchedCount = filteredGroups.reduce((sum, group) => sum + group.models.length, 0);
  useEffect(() => {
    const element = vendorRowRef.current;
    if (!isOpen || !element) return;
    const checkScroll = () => { setCanScrollLeft(element.scrollLeft > 10); setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 10); };
    checkScroll();
    element.addEventListener('scroll', checkScroll, { passive: true }); window.addEventListener('resize', checkScroll);
    return () => { element.removeEventListener('scroll', checkScroll); window.removeEventListener('resize', checkScroll); };
  }, [catalog, isOpen, searchQuery, selectedTypeTab]);
  const addVendor = (models: GatewayModelItem[]) => {
    if (onAddModels) onAddModels(models); else models.forEach(onToggleAddModel);
  };
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-3 backdrop-blur-[2px] xl:p-4 animate-fade-in font-sans">
    <div ref={dialogRef} data-settings-modal role="dialog" aria-modal="true" aria-labelledby="gateway-model-title" tabIndex={-1} className={`${settingsModalShell} max-w-[min(92vw,900px)] bg-white text-slate-900 shadow-xl border border-slate-200/80 flex flex-col overflow-hidden`}>
      <header className="px-4 md:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0"><span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" /></span><h2 id="gateway-model-title" className="text-base font-bold min-w-0">{gatewayName}模型库 <span className="text-xs text-indigo-700 font-mono">{catalog.length} 款模型</span></h2></div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" disabled={isLoading || !catalog.some(model => model.supported !== false)} onClick={onAddAllUsefulModels} className="text-xs font-bold text-slate-700 hover:text-indigo-600 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 disabled:opacity-40"><CheckCheck className="w-4 h-4 text-indigo-600" />一键接入受支持模型</button>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="关闭模型发现" title="关闭 (Esc)"><X className="w-5 h-5" /></button>
        </div>
      </header>
      {channel === 'lianchi' && <p className="px-5 py-2 text-xs text-indigo-800 bg-indigo-50 border-b border-indigo-100">{isLoading ? '正在读取联池账户可用模型。' : '下列模型由联池实时返回。当前应用仅支持接入已适配的图像模型；其他模型可查看，暂不能加入工作流。'}</p>}
      {channel === 'openai' && <p className="px-5 py-2 text-xs text-indigo-800 bg-indigo-50 border-b border-indigo-100">OpenAI 是调用渠道，列表内名称是模型厂商。同名模型可分别从 OpenAI 与 Comfly 接入，并在视觉模型选择器中按渠道选择。</p>}
      <div className={`${settingsPanelPad} bg-slate-50/70 border-b border-slate-100 space-y-3 shrink-0`}>
        <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" /><input data-initial-focus aria-label="搜索模型 ID 或名称" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="搜索模型 ID 或名称" className="w-full pl-11 pr-14 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />{searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs">清空</button>}</div>
        <div className="flex items-center gap-2">
          {canScrollLeft && <button type="button" aria-label="向前滚动厂商" onClick={() => vendorRowRef.current?.scrollBy({ left: -320, behavior: 'smooth' })} className="p-1 rounded-full border border-slate-200 bg-white"><ChevronLeft className="w-4 h-4" /></button>}
          <div ref={vendorRowRef} onWheel={event => { if (event.deltaY && vendorRowRef.current) vendorRowRef.current.scrollLeft += event.deltaY; }} className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 text-xs scroll-smooth flex-1 min-w-0">
            <button type="button" aria-pressed={selectedVendorId === 'all'} onClick={() => setSelectedVendorId('all')} className={`px-3 py-1.5 rounded-xl whitespace-nowrap shrink-0 ${selectedVendorId === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>全部厂商 {allVendorCount}</button>
            {VENDORS.filter(vendor => vendorCounts[vendor.id] > 0 || vendor.id === selectedVendorId).map(vendor => <button type="button" key={vendor.id} aria-pressed={selectedVendorId === vendor.id} onClick={() => setSelectedVendorId(vendor.id)} className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 ${selectedVendorId === vendor.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}><span className="w-4 h-4">{getModelIcon(vendor.id, 'w-full h-full')}</span>{vendor.name.split(' ')[0]} {vendorCounts[vendor.id] || 0}</button>)}
          </div>
          {canScrollRight && <button type="button" aria-label="向后滚动厂商" onClick={() => vendorRowRef.current?.scrollBy({ left: 320, behavior: 'smooth' })} className="p-1 rounded-full border border-slate-200 bg-white"><ChevronRight className="w-4 h-4" /></button>}
        </div>
        <div className="flex items-center gap-2 text-xs overflow-x-auto no-scrollbar">
          {([{ id: 'all', label: '全部类型', Icon: null }, { id: 'image', label: '生图', Icon: ImageIcon }, { id: 'multimodal', label: '多模态', Icon: Sparkles }, { id: 'video', label: '视频', Icon: Video }] as const).map(({ id, label, Icon }) => <button type="button" key={id} aria-pressed={selectedTypeTab === id} onClick={() => setSelectedTypeTab(id)} className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 shrink-0 ${selectedTypeTab === id ? 'bg-slate-200 text-slate-900' : 'text-slate-500 hover:bg-slate-100'}`}>{Icon && <Icon className="w-3.5 h-3.5" />}{label} ({typeCount(id)})</button>)}
        </div>
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto ${settingsPanelPad} space-y-4`} aria-busy={isLoading}>
        {isLoading ? <div role="status" className="py-20 flex flex-col items-center gap-3 text-slate-500"><Loader2 className="w-9 h-9 animate-spin text-indigo-600" /><span className="text-sm">正在从{gatewayName}读取模型列表…</span></div>
          : error ? <div role="alert" className="py-16 text-center space-y-3"><AlertCircle className="w-9 h-9 mx-auto text-amber-600" /><p className="text-sm text-slate-700 break-words">{error}</p>{onRefresh && <button type="button" onClick={onRefresh} className="settings-button-secondary">重新获取模型</button>}</div>
          : !filteredGroups.length ? <div role="status" className="py-20 text-center text-slate-500 space-y-3"><AlertCircle className="w-9 h-9 mx-auto text-slate-300" /><p className="text-sm">{catalog.length ? '未找到匹配的模型' : '渠道没有返回模型'}</p><p className="text-xs">{catalog.length ? '请更换搜索词或切换厂商、类型筛选。' : '请检查渠道配置后重新获取。'}</p>{!catalog.length && onRefresh && <button type="button" onClick={onRefresh} className="settings-button-secondary">重新获取模型</button>}</div>
          : filteredGroups.map(({ vendor, models }) => <GatewayVendorGroup key={vendor.id} vendor={vendor} models={models} channel={channel} activeModelIds={activeModelIds} collapsed={Boolean(collapsedVendors[vendor.id])} onCollapse={() => setCollapsedVendors(previous => ({ ...previous, [vendor.id]: !previous[vendor.id] }))} onAddModels={addVendor} onToggle={onToggleAddModel} />)}
      </div>
      <footer className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500 shrink-0">匹配 {totalMatchedCount} 款模型 · 已添加 {activeModelIds.size} 条线路</footer>
    </div>
  </div>;
}
