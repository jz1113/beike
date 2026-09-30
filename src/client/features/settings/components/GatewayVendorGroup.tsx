import { Eye, Lightbulb, Wrench, Image as ImageIcon, Video, Plus, Check, ChevronDown, ChevronRight, FolderPlus } from 'lucide-react';
import { getModelIcon } from '@client/shared/ui/ModelIcons';
import type { VendorMeta } from '@shared/domain/models/vendorRegistry';
import { gatewayRouteId, type GatewayModelItem, type GatewayChannel } from '../model/gatewayModelCatalog';

export default function GatewayVendorGroup({ vendor, models, channel, activeModelIds, collapsed, onCollapse, onAddModels, onToggle }: {
  vendor: VendorMeta; models: GatewayModelItem[]; channel: GatewayChannel; activeModelIds: Set<string>;
  collapsed: boolean; onCollapse: () => void; onAddModels: (models: GatewayModelItem[]) => void;
  onToggle: (model: GatewayModelItem) => void;
}) {
  const addedCount = models.filter(model => activeModelIds.has(gatewayRouteId(model.id, channel))).length;
  const candidates = models.filter(model => model.supported !== false && !activeModelIds.has(gatewayRouteId(model.id, channel)));
  return <section className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
    <header className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
      <button type="button" onClick={onCollapse} aria-expanded={!collapsed} aria-controls={`gateway-vendor-${vendor.id}`} className="flex items-center gap-2 text-left min-w-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500">
        <span className="w-6 h-6 shrink-0">{getModelIcon(vendor.id, 'w-full h-full')}</span>
        <span className="text-sm font-bold text-slate-900">{vendor.name}</span>
        <span className="text-xs text-slate-500">{models.length} 款</span>
        {addedCount > 0 && <span className="text-xs text-emerald-700">已接入 {addedCount}</span>}
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      <button type="button" disabled={!candidates.length} onClick={() => onAddModels(candidates)} className="text-xs font-bold text-slate-700 hover:text-indigo-600 px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-1 disabled:opacity-40" title="接入此厂商下已适配且尚未添加的模型">
        <FolderPlus className="w-3.5 h-3.5 text-indigo-500" />接入此厂商全部
      </button>
    </header>
    {!collapsed && <div id={`gateway-vendor-${vendor.id}`} className="p-2.5 divide-y divide-slate-100">
      {models.map(model => {
        const added = activeModelIds.has(gatewayRouteId(model.id, channel));
        return <div key={model.id} className={`px-3 py-2.5 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 ${added ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-7 h-7 shrink-0 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">{getModelIcon(model.id, 'w-4 h-4')}</span>
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-900 truncate" title={model.name}>{model.name || model.id}</div><div className="font-mono text-[11px] text-slate-500 truncate" title={model.id}>{model.id}</div></div>
            <span className="text-[10px] text-indigo-700 shrink-0">{channel === 'openai' ? 'OpenAI 渠道' : channel === 'lianchi' ? '联池渠道' : 'Comfly 渠道'}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap pl-10 lg:pl-0 text-[11px]">
            {model.isVision && <span className="flex items-center gap-1 text-emerald-700"><Eye className="w-3 h-3" />视觉</span>}
            {model.isThinking && <span className="flex items-center gap-1 text-purple-700"><Lightbulb className="w-3 h-3" />思考</span>}
            {model.isImage && <span className="flex items-center gap-1 text-orange-700"><ImageIcon className="w-3 h-3" />生图</span>}
            {model.isVideo && <span className="flex items-center gap-1 text-sky-700"><Video className="w-3 h-3" />视频</span>}
            {model.isTool && <span className="flex items-center gap-1 text-blue-700"><Wrench className="w-3 h-3" />函数</span>}
            {model.isAudio && <span className="text-slate-500">音频</span>}
            {model.isEmbedding && <span className="text-slate-500">嵌入</span>}
            <button type="button" disabled={model.supported === false && !added} onClick={() => onToggle(model)} aria-label={`${added ? '移出' : '接入'} ${model.name || model.id}`} className={`ml-2 rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-40 ${added ? 'bg-emerald-50 text-emerald-700 hover:bg-rose-50 hover:text-rose-700' : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'}`}>
              {added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}{added ? '移出' : model.supported === false ? '暂不支持' : '接入'}
            </button>
          </div>
        </div>;
      })}
    </div>}
  </section>;
}
