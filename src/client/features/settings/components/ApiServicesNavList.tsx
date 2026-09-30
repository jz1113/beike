import { Search } from 'lucide-react';
import { type ApiServiceItem } from './settingsShared';
import type { ServiceStatus } from '../model/connectionStatus';

export const SERVICE_STATUS_COLORS: Record<ServiceStatus['state'], string> = {
  unconfigured: 'text-slate-400', disabled: 'text-slate-500', untested: 'text-amber-700',
  testing: 'text-indigo-600', passed: 'text-emerald-700', failed: 'text-rose-600',
};
export function ApiServicesNavList({ services, serviceSearch, setServiceSearch, selectedServiceId, setSelectedServiceId, statuses }: {
  services: ApiServiceItem[]; serviceSearch: string; setServiceSearch: (value: string) => void;
  selectedServiceId: string; setSelectedServiceId: (id: string) => void; statuses: Record<string, ServiceStatus>;
}) {
  const categories = [{ id: 'core', name: '模型渠道' }, { id: 'ecommerce', name: '电商采集' }, { id: 'social', name: '内容解析' }, { id: 'storage', name: '文件存储' }];
  return <aside className="settings-service-nav hidden @[840px]/settings-modal:flex w-48 border-r border-slate-200/80 bg-white/20 p-3 flex-col shrink-0 min-h-0" aria-label="渠道与服务列表">
    <label className="relative mb-3"><Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" /><input aria-label="搜索渠道与服务" value={serviceSearch} onChange={event => setServiceSearch(event.target.value)} placeholder="搜索渠道" className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white outline-none focus:border-indigo-500" /></label>
    <div className="flex-1 overflow-y-auto space-y-4">
      {categories.map(category => {
        const group = services.filter(service => service.category === category.id);
        if (!group.length) return null;
        return <div key={category.id}><h2 className="px-2 text-[10px] font-semibold text-slate-400 mb-2">{category.name}</h2><div className="space-y-1">{group.map(service => {
          const status = statuses[service.id];
          const name = service.id === 'comfly_gateway' ? 'Comfly 网关' : service.id === 'openai_official' ? 'OpenAI' : service.name.split(' ')[0];
          return <button key={service.id} type="button" aria-current={selectedServiceId === service.id ? 'page' : undefined} onClick={() => setSelectedServiceId(service.id)}
            className={`w-full text-left p-2.5 rounded-lg flex items-start gap-2 ${selectedServiceId === service.id ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'hover:bg-white/60'}`}>
            <span className="w-7 h-7 shrink-0 rounded-lg bg-transparent flex items-center justify-center">{service.renderLogo('w-4 h-4')}</span>
            <span className="min-w-0"><span className="block text-xs font-semibold text-slate-800 break-words">{name}</span><span className={`block text-[10px] mt-1 ${SERVICE_STATUS_COLORS[status.state]}`} title={status.detail}>{status.label}</span></span>
          </button>;
        })}</div></div>;
      })}
      {!services.length && <p className="p-2 text-xs text-slate-500">没有匹配的服务</p>}
    </div>

  </aside>;
}
