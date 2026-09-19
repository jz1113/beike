import { Loader2, Link2 } from 'lucide-react';
import { ApiaLogo } from '@/shared/icons';
import { ExternalLinkAnchor } from '@/shared/ui/ExternalLinkAnchor';

export interface ApiServicesApiaPanelProps {
  scraperId: string;
  setScraperId: (v: string) => void;
  scraperSecret: string;
  setScraperSecret: (v: string) => void;
  isApiaEnabled: boolean;
  setIsApiaEnabled: (v: boolean) => void;
  handleSaveScraperConfig: () => void;
  handleTestScraper: () => void;
  isTestingScraper: boolean;
}

export function ApiServicesApiaPanel({
  scraperId,
  setScraperId,
  scraperSecret,
  setScraperSecret,
  isApiaEnabled,
  setIsApiaEnabled,
  handleSaveScraperConfig,
  handleTestScraper,
  isTestingScraper,
}: ApiServicesApiaPanelProps) {
  return (
    <div className="space-y-4">
      {/* 🌟 1. 服务概览卡片 */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shadow-2xs shrink-0">
            <ApiaLogo className="w-6 h-6 rounded-lg" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                APIA 第三方短视频/图集解析
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono border transition-colors ${
                scraperId.trim() && scraperSecret.trim()
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-2xs'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
                {scraperId.trim() && scraperSecret.trim() ? '🟢 已配置' : '⚪ 未配置'}
              </span>
              <ExternalLinkAnchor
                href="https://apia.vip"
                className="px-2.5 py-0.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/80 text-[11px] font-bold flex items-center gap-1 transition-all shadow-2xs group"
                title="前往 APIA 官网注册账号获取 Client ID 与 Secret"
              >
                <span>前往 APIA 官网 ↗</span>
              </ExternalLinkAnchor>
            </div>
            <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">
              支持小红书、抖音、快手等全网爆款买家秀图集与视频分镜一键无水印提取
            </p>
          </div>
        </div>

        {/* 现代平滑极简开关 */}
        <div 
          onClick={() => setIsApiaEnabled(!isApiaEnabled)}
          className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner flex-shrink-0 ${
            isApiaEnabled ? 'bg-emerald-500' : 'bg-slate-200 hover:bg-slate-300'
          }`}
          title={isApiaEnabled ? "点击停用" : "点击启用"}
        >
          <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-out ${
            isApiaEnabled ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </div>
      </div>

      {/* 🌟 2. 凭证配置卡片 */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3.5 text-xs">
        <div className="text-xs font-bold text-slate-900 tracking-tight border-b border-slate-100/90 pb-2.5">
          接口凭据设置
        </div>

        <div className="space-y-1.5">
          <label className="font-bold text-slate-700 block">APIA 接口端点地址</label>
          <input
            type="text"
            value="https://apia.vip"
            disabled
            className="w-full h-9 px-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono text-slate-500 outline-none shadow-2xs cursor-not-allowed"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-bold text-slate-700 block">APIA Client ID (客户编号)</label>
          <input
            type="text"
            value={scraperId}
            onChange={e => {
              setScraperId(e.target.value);
              localStorage.setItem('external_scraper_id', e.target.value);
            }}
            placeholder="202037331"
            className="w-full h-9 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 text-xs font-mono text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-2xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-bold text-slate-700 block">APIA Secret Key (接口密钥)</label>
          <input
            type="password"
            value={scraperSecret}
            onChange={e => {
              setScraperSecret(e.target.value);
              localStorage.setItem('external_scraper_secret', e.target.value);
            }}
            placeholder="••••••••••••"
            className="w-full h-9 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 text-xs font-mono text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleSaveScraperConfig}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all cursor-pointer shadow-xs active:scale-95"
          >
            保存 APIA 接口配置
          </button>
          <button
            type="button"
            onClick={handleTestScraper}
            disabled={isTestingScraper}
            className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200/80 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            {isTestingScraper ? <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" /> : <Link2 className="w-3.5 h-3.5 text-rose-600" />}
            <span>{isTestingScraper ? '正在测试连通性...' : '测试 APIA 连通性'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
