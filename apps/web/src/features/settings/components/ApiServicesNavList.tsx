import { Search } from 'lucide-react';
import { type ApiServiceItem } from '../settingsShared';

export interface ApiServicesNavListProps {
  services: ApiServiceItem[];
  serviceSearch: string;
  setServiceSearch: (v: string) => void;
  selectedServiceId: string;
  setSelectedServiceId: (id: string) => void;
  isServiceConfigured: (id: string, defaultEnabled?: boolean) => boolean;
}

export function ApiServicesNavList({
  services,
  serviceSearch,
  setServiceSearch,
  selectedServiceId,
  setSelectedServiceId,
  isServiceConfigured,
}: ApiServicesNavListProps) {
  return (
    <div className="hidden md:flex @[640px]/settings-modal:flex w-48 sm:w-52 border-r border-slate-200/80 bg-slate-50/60 p-3 flex-col flex-shrink-0 min-h-0">
      {/* 搜索框 */}
      <div className="relative mb-2 shrink-0">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={serviceSearch}
          onChange={e => setServiceSearch(e.target.value)}
          placeholder="搜索服务..."
          className="w-full pl-8 pr-2.5 py-1.5 rounded-xl bg-white text-xs text-slate-800 placeholder-slate-400 outline-none border border-slate-200/80 focus:border-indigo-500 transition-all shadow-2xs"
        />
      </div>

      {/* 真实接口列表 */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 no-scrollbar">
        {services.map(service => {
          const isSelected = selectedServiceId === service.id;
          const shortName =
            service.id === 'comfly_gateway' ? 'Comfly 网关' :
            service.id === 'deepseek_official' ? 'DeepSeek 官方' :
            service.id === 'lianchi_images' ? '联池图像' :
            service.id === 'wanbang_ecommerce' ? '万邦电商' :
            service.id === 'apia_parser' ? 'APIA 解析' :
            service.id === 'qiyun_parser' ? '奇云解析' :
            service.id === 'cloud_storage' ? '云端存储' : service.name.split(' ')[0];

          const configured = isServiceConfigured(service.id, service.isEnabled);

          return (
            <div
              key={service.id}
              onClick={() => setSelectedServiceId(service.id)}
              className={`p-2 rounded-xl flex items-center justify-between transition-all cursor-pointer group ${
                isSelected 
                  ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80 ring-1 ring-slate-900/5' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 bg-white p-1 border transition-colors shadow-2xs ${
                  isSelected ? 'border-indigo-100' : 'border-slate-100'
                }`}>
                  {service.renderLogo("w-4 h-4")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs truncate font-bold text-slate-900 leading-tight">
                    {shortName}
                  </div>
                  <div className="text-[10.5px] text-slate-400 font-normal truncate mt-0.5 leading-tight">
                    {service.tag || service.subTitle}
                  </div>
                </div>
              </div>

              {/* 在线指示灯 */}
              {service.id !== 'defaults' && <div className="flex items-center flex-shrink-0 ml-1.5">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${
                    configured ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-slate-300'
                  }`}
                  title={configured ? '接口凭证已配置' : '未配置接口密钥'}
                />
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
