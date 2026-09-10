import React from 'react';
import { Loader2, Link2 } from 'lucide-react';
import { QiyunLogo } from '@/shared/ui/BrandIcons';
import { ExternalLinkAnchor } from '@/shared/ui/ExternalLinkAnchor';

export interface ApiServicesQiyunPanelProps {
  qiyunAppId: string;
  setQiyunAppId: (v: string) => void;
  qiyunAppKey: string;
  setQiyunAppKey: (v: string) => void;
  isQiyunEnabled: boolean;
  setIsQiyunEnabled: (v: boolean) => void;
  handleSaveQiyunConfig: () => void;
  handleTestQiyun: () => void;
  isTestingQiyun: boolean;
}

export function ApiServicesQiyunPanel({
  qiyunAppId,
  setQiyunAppId,
  qiyunAppKey,
  setQiyunAppKey,
  isQiyunEnabled,
  setIsQiyunEnabled,
  handleSaveQiyunConfig,
  handleTestQiyun,
  isTestingQiyun,
}: ApiServicesQiyunPanelProps) {
  const isConfigured = Boolean(qiyunAppId.trim() && qiyunAppKey.trim());

  return (
    <div className="space-y-4">
      {/* 🌟 1. 服务概览卡片 */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shadow-2xs shrink-0">
            <QiyunLogo className="w-6 h-6 rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                奇云解析
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono border transition-colors ${
                  isConfigured
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-2xs'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                {isConfigured ? '🟢 已配置' : '⚪ 未配置'}
              </span>
              <ExternalLinkAnchor
                href="https://qyapi.ipaybuy.cn"
                className="px-2.5 py-0.5 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200/80 text-[11px] font-bold flex items-center gap-1 transition-all shadow-2xs group"
                title="前往奇云平台注册账号获取 AppId 与 AppKey"
              >
                <span>前往奇云官网 ↗</span>
              </ExternalLinkAnchor>
            </div>
            <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">
              高可用短视频与图集去水印服务，支持抖音、快手、小红书、微信视频号、微博等 30+ 主流平台
            </p>
          </div>
        </div>

        {/* 现代平滑极简开关 */}
        <div
          onClick={() => setIsQiyunEnabled(!isQiyunEnabled)}
          className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner flex-shrink-0 ${
            isQiyunEnabled ? 'bg-emerald-500' : 'bg-slate-200 hover:bg-slate-300'
          }`}
          title={isQiyunEnabled ? '已启用奇云解析' : '已停用奇云解析'}
        >
          <div
            className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-out ${
              isQiyunEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </div>
      </div>

      {/* 🌟 2. 凭证配置卡片 */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3.5 text-xs">
        <div className="text-xs font-bold text-slate-900 tracking-tight border-b border-slate-100/90 pb-2.5">
          奇云解析凭据设置
        </div>

        <div className="space-y-1.5">
          <label className="font-bold text-slate-700 block">奇云接口端点地址</label>
          <input
            type="text"
            value="https://qyapi.ipaybuy.cn/api/video"
            disabled
            className="w-full h-9 px-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono text-slate-500 outline-none shadow-2xs cursor-not-allowed"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-bold text-slate-700 block">奇云 App ID (应用编号)</label>
          <input
            type="text"
            value={qiyunAppId}
            onChange={(e) => {
              setQiyunAppId(e.target.value);
              localStorage.setItem('qiyun_app_id', e.target.value);
            }}
            placeholder="在奇云平台申请获取的 AppId"
            className="w-full h-9 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 text-xs font-mono text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-2xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-bold text-slate-700 block">奇云 App Key (应用密钥)</label>
          <input
            type="password"
            value={qiyunAppKey}
            onChange={(e) => {
              setQiyunAppKey(e.target.value);
              localStorage.setItem('qiyun_app_key', e.target.value);
            }}
            placeholder="••••••••••••"
            className="w-full h-9 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 text-xs font-mono text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleSaveQiyunConfig}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all cursor-pointer shadow-xs active:scale-95"
          >
            保存奇云接口配置
          </button>
          <button
            type="button"
            onClick={handleTestQiyun}
            disabled={isTestingQiyun}
            className="px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200/80 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            {isTestingQiyun ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
            ) : (
              <Link2 className="w-3.5 h-3.5 text-sky-600" />
            )}
            <span>{isTestingQiyun ? '正在测试连通性...' : '测试奇云连通性'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
