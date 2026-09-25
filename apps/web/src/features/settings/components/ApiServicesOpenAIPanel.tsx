import { Activity, ExternalLink, Eye, EyeOff, Loader2, Plus, RefreshCw, Save, Upload } from 'lucide-react';
import { ExternalLinkAnchor } from '@/shared/ui/ExternalLinkAnchor';
import { ModelIcon } from '@/shared/ui/ModelIcons';

interface Props {
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  showKey: boolean;
  setShowKey: (value: boolean) => void;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  allowInsecureHttp: boolean;
  setAllowInsecureHttp: (value: boolean) => void;
  onSave: () => void;
  onTest: () => void;
  onFetchModels: () => void;
  onImportCodexCatalog: (file: File) => void;
  onAddManualModel: () => void;
  isTesting: boolean;
  isFetchingModels: boolean;
  modelCount: number;
  modelError: string;
  suggestedBaseUrl: string;
  onUseSuggestedBaseUrl: (baseUrl: string) => void;
  modelSource: 'gateway' | 'codex';
}

export function ApiServicesOpenAIPanel({
  baseUrl, setBaseUrl, apiKey, setApiKey, showKey, setShowKey, enabled, setEnabled,
  allowInsecureHttp, setAllowInsecureHttp,
  onSave, onTest, onFetchModels, onImportCodexCatalog, onAddManualModel,
  isTesting, isFetchingModels, modelCount, modelError, modelSource,
  suggestedBaseUrl, onUseSuggestedBaseUrl,
}: Props) {
  return <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs p-4 sm:p-5 space-y-4">
    <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
      <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 p-1.5">
        <ModelIcon modelId="gpt-6-luna" className="w-full h-full" />
      </div>
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm sm:text-base font-black text-slate-900">OpenAI / Responses 接口</h2>
          <ExternalLinkAnchor href="https://platform.openai.com/api-keys" className="px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-bold flex items-center gap-1" title="获取 OpenAI API Key">
            获取 API Key <ExternalLink className="w-3 h-3" />
          </ExternalLinkAnchor>
          <ExternalLinkAnchor href="https://developers.openai.com/api/docs/guides/images-vision" className="text-[11px] font-bold text-indigo-600 flex items-center gap-1" title="查看 OpenAI 图像理解文档">
            官方文档 <ExternalLink className="w-3 h-3" />
          </ExternalLinkAnchor>
        </div>
        <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">GPT 5.6 / GPT 6 图片分析使用 <code>/v1/responses</code>；API Key 网关优先从 <code>/v1/models</code> 读取模型。</p>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
      <div className="space-y-1.5">
        <label htmlFor="openai-base-url" className="text-xs font-bold text-slate-700 block">API Base URL</label>
        <input id="openai-base-url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.openai.com" className="w-full h-9 px-3.5 rounded-xl bg-slate-50/70 border border-slate-200 text-xs font-mono outline-none focus:border-indigo-500" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="openai-api-key" className="text-xs font-bold text-slate-700 block">OpenAI API Key</label>
        <div className="relative">
          <input id="openai-api-key" type={showKey ? 'text' : 'password'} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="sk-..." className="w-full h-9 px-3.5 pr-9 rounded-xl bg-slate-50/70 border border-slate-200 text-xs font-mono outline-none focus:border-indigo-500" />
          <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showKey ? '隐藏密钥' : '显示密钥'}>
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
    {/^http:\/\//i.test(baseUrl.trim()) && (
      <label className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 rounded-xl px-3 py-2 cursor-pointer">
        <input type="checkbox" checked={allowInsecureHttp} onChange={event => setAllowInsecureHttp(event.target.checked)} className="mt-0.5 accent-amber-700" />
        <span>允许此公网 IP 的 HTTP 网关。勾选后，API Key 会在服务器到网关之间以明文传输；仅对此地址生效。建议优先配置 HTTPS。</span>
      </label>
    )}
    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
      <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="accent-indigo-600" />
      启用 OpenAI 渠道视觉调用
    </label>
    <p className="text-[11px] text-slate-500">可填写 OpenAI 官方地址或支持 Responses API 的自有网关。只有从此渠道接入并选中的视觉模型会使用此地址与 API Key；Comfly 同名模型继续使用 Comfly 网关。</p>
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
      <p className="text-xs font-bold text-slate-800">模型目录来源</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onFetchModels} disabled={isFetchingModels || !apiKey.trim()} className="h-9 px-3 rounded-xl border border-indigo-200 bg-white text-indigo-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin' : ''}`} /> 从 API Key 网关获取
        </button>
        <label className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> 导入 CC Switch/Codex 目录
          <input type="file" accept=".json,application/json" className="sr-only" onChange={event => {
            const file = event.target.files?.[0];
            if (file) onImportCodexCatalog(file);
            event.target.value = '';
          }} />
        </label>
        <button type="button" onClick={onAddManualModel} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> 手动添加模型 ID
        </button>
      </div>
      <p className="text-[11px] text-slate-500">CC Switch 的 ChatGPT/Codex 登录账号使用独立模型目录。可在本机选择 <code>~/.codex/cc-switch-model-catalog.json</code> 导入；请先在 CC Switch 更新该目录。文件只在浏览器内读取，不会上传。目录仅用于选择模型，实际调用仍使用上方地址和 API Key。</p>
      <p className="text-[11px] text-slate-600">当前目录：{modelSource === 'codex' ? '本机 Codex 文件' : 'API Key 网关'} · {modelCount} 款</p>
      {modelError && (!suggestedBaseUrl || baseUrl.trim().replace(/\/+$/, '') !== suggestedBaseUrl) && <p role="alert" className="text-[11px] text-rose-700 bg-rose-50 rounded-lg px-2.5 py-2">{modelError}</p>}
      {suggestedBaseUrl && /^https:\/\//i.test(baseUrl.trim()) && <button type="button" onClick={() => onUseSuggestedBaseUrl(suggestedBaseUrl)} className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 text-left">
        改用 {suggestedBaseUrl} 并允许明文传输 API Key。请确认地址后保存配置，再重新获取模型。
      </button>}
      {suggestedBaseUrl && baseUrl.trim().replace(/\/+$/, '') === suggestedBaseUrl && <p className="text-[11px] text-amber-900 bg-amber-50 rounded-lg px-2.5 py-2">已切换到 HTTP 地址并勾选明文传输。请保存配置，再重新获取模型。</p>}
    </div>
    <div className="flex items-center justify-end gap-2 flex-wrap pt-1 border-t border-slate-100">
      <button type="button" onClick={onTest} disabled={isTesting || !apiKey.trim()} className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">
        {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />} 测试目录
      </button>
      <button type="button" onClick={onSave} className="h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5">
        <Save className="w-3.5 h-3.5" /> 保存配置
      </button>
    </div>
  </div>;
}
