import {
  Loader2,
  Zap,
} from 'lucide-react';
import { OneBoundLogo } from '@/shared/ui/BrandIcons';
import { ExternalLinkAnchor } from '@/shared/ui/ExternalLinkAnchor';

export interface ApiServicesWanbangPanelProps {
  wanbangKey: string;
  setWanbangKey: (v: string) => void;
  wanbangSecret: string;
  setWanbangSecret: (v: string) => void;
  isWanbangEnabled: boolean;
  setIsWanbangEnabled: (v: boolean) => void;
  handleSaveWanbangConfig: () => void;
  handleTestWanbang: () => void;
  isTestingWanbang: boolean;
}

export function ApiServicesWanbangPanel({
  wanbangKey,
  setWanbangKey,
  wanbangSecret,
  setWanbangSecret,
  isWanbangEnabled,
  setIsWanbangEnabled,
  handleSaveWanbangConfig,
  handleTestWanbang,
  isTestingWanbang,
}: ApiServicesWanbangPanelProps) {
  return (
    <div className="space-y-4">
      {/* 🌟 1. 服务概览卡片 */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shadow-2xs shrink-0">
            <OneBoundLogo className="w-6 h-6 rounded-lg" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                ONEBOUND 万邦电商数据采集
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono border transition-colors ${
                wanbangKey.trim() && wanbangSecret.trim()
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-2xs'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
                {wanbangKey.trim() && wanbangSecret.trim() ? '🟢 已配置' : '⚪ 未配置'}
              </span>
              <ExternalLinkAnchor
                href="https://open.onebound.cn"
                className="px-2.5 py-0.5 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 text-[11px] font-bold flex items-center gap-1 transition-all shadow-2xs group"
                title="前往万邦开放平台注册账号并申请 API Key"
              >
                <span>前往万邦注册 / 获取 Key</span>
              </ExternalLinkAnchor>
            </div>
            <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">
              支持从淘宝、天猫、京东、拼多多、1688 全网一键抓取商品高清主图与商品参数
            </p>
          </div>
        </div>

        {/* 现代平滑极简开关 */}
        <div 
          onClick={() => setIsWanbangEnabled(!isWanbangEnabled)}
          className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner flex-shrink-0 ${
            isWanbangEnabled ? 'bg-emerald-500' : 'bg-slate-200 hover:bg-slate-300'
          }`}
          title={isWanbangEnabled ? "点击停用" : "点击启用"}
        >
          <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-out ${
            isWanbangEnabled ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </div>
      </div>

      {/* 🌟 2. 凭证配置卡片 */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3.5 text-xs">
        <div className="text-xs font-bold text-slate-900 tracking-tight border-b border-slate-100/90 pb-2.5">
          万邦开放平台调用密钥
        </div>

        <div className="space-y-1.5">
          <label className="font-bold text-slate-700 block">万邦 API Key (调用接口凭证)</label>
          <input
            type="text"
            value={wanbangKey}
            onChange={e => setWanbangKey(e.target.value)}
            placeholder="填入万邦开放平台 API Key"
            className="w-full h-9 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 text-xs font-mono text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-2xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-bold text-slate-700 block">万邦 API Secret</label>
          <input
            type="password"
            value={wanbangSecret}
            onChange={e => setWanbangSecret(e.target.value)}
            placeholder="填入万邦开放平台 API Secret"
            className="w-full h-9 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 text-xs font-mono text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleSaveWanbangConfig}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all cursor-pointer shadow-xs active:scale-95"
          >
            保存万邦接口配置
          </button>
          <button
            type="button"
            onClick={handleTestWanbang}
            disabled={isTestingWanbang}
            className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            {isTestingWanbang ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" /> : <Zap className="w-3.5 h-3.5 text-amber-600" />}
            <span>{isTestingWanbang ? '正在诊断连通性...' : '测试接口连通性'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
