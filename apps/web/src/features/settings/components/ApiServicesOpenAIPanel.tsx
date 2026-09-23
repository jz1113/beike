import { Activity, ExternalLink, Eye, EyeOff, Loader2, RefreshCw, Save } from 'lucide-react';
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
  onSave: () => void;
  onTest: () => void;
  onFetchModels: () => void;
  isTesting: boolean;
  isFetchingModels: boolean;
  modelCount: number;
}

export function ApiServicesOpenAIPanel({
  baseUrl, setBaseUrl, apiKey, setApiKey, showKey, setShowKey, enabled, setEnabled,
  onSave, onTest, onFetchModels, isTesting, isFetchingModels, modelCount,
}: Props) {
  return <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs p-4 sm:p-5 space-y-4">
    <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
      <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 p-1.5">
        <ModelIcon modelId="gpt-6-luna" className="w-full h-full" />
      </div>
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm sm:text-base font-black text-slate-900">OpenAI 官方 Responses 接口</h2>
          <ExternalLinkAnchor href="https://platform.openai.com/api-keys" className="px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-bold flex items-center gap-1" title="获取 OpenAI API Key">
            获取 API Key <ExternalLink className="w-3 h-3" />
          </ExternalLinkAnchor>
          <ExternalLinkAnchor href="https://developers.openai.com/api/docs/guides/images-vision" className="text-[11px] font-bold text-indigo-600 flex items-center gap-1" title="查看 OpenAI 图像理解文档">
            官方文档 <ExternalLink className="w-3 h-3" />
          </ExternalLinkAnchor>
        </div>
        <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">GPT 5.6 / GPT 6 图片分析使用 <code>/v1/responses</code>，模型目录使用 <code>/v1/models</code>。</p>
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
    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
      <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="accent-indigo-600" />
      GPT 5.6 / GPT 6 多模态视觉任务使用此接口
    </label>
    <p className="text-[11px] text-slate-500">可填写 OpenAI 官方地址或支持 Responses API 的自有网关。启用后只影响这些模型的图像理解请求；模型需要在默认业务模型中选择。</p>
    <div className="flex items-center justify-end gap-2 flex-wrap pt-1 border-t border-slate-100">
      <button type="button" onClick={onTest} disabled={isTesting || !apiKey.trim()} className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">
        {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />} 测试目录
      </button>
      <button type="button" onClick={onFetchModels} disabled={isFetchingModels || !apiKey.trim()} className="h-9 px-3 rounded-xl border border-indigo-200 text-indigo-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">
        <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin' : ''}`} /> 获取模型 ({modelCount})
      </button>
      <button type="button" onClick={onSave} className="h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5">
        <Save className="w-3.5 h-3.5" /> 保存配置
      </button>
    </div>
  </div>;
}
