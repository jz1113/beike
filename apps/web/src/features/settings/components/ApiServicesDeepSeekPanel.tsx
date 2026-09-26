import { DeepSeekModelDirectory } from './DeepSeekModelDirectory';
import { Activity, ExternalLink, Eye, EyeOff, Image, Loader2, Save } from 'lucide-react';
import { ExternalLinkAnchor } from '@/shared/ui/ExternalLinkAnchor';
import { ModelIcon } from '@/shared/ui/ModelIcons';

export interface ApiServicesDeepSeekPanelProps {
  apiKey: string;
  setApiKey: (value: string) => void;
  showKey: boolean;
  setShowKey: (value: boolean) => void;
  isTesting: boolean;
  onTest: () => void;
  onSave: () => void;
}

/** DeepSeek uses the standard OpenAI-compatible Chat Completions API. */
export function ApiServicesDeepSeekPanel({
  apiKey, setApiKey, showKey, setShowKey, isTesting, onTest, onSave,
}: ApiServicesDeepSeekPanelProps) {
  return (
    <div className="space-y-4">
      <div className="bg-transparent py-1 space-y-4">
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#f3f6ff] border border-[#dbe4ff] flex items-center justify-center shrink-0 mt-0.5 p-1.5">
              <ModelIcon modelId="deepseek-flash" className="w-full h-full" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">DeepSeek 官方接口</h2>
                <ExternalLinkAnchor href="https://platform.deepseek.com" className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200/70 text-[11px] font-bold flex items-center gap-1" title="打开 DeepSeek Platform 获取 API Key">
                  获取 API Key <ExternalLink className="w-3 h-3" />
                </ExternalLinkAnchor>
              </div>
              <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">官方 OpenAI 兼容 Chat Completions 接口，支持 deepseek-flash 的图像理解与文本对话。</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">官方 API 接口地址 (Base URL)</label>
            <input value="https://api.deepseek.com" readOnly className="w-full h-9 px-3.5 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs font-mono text-slate-600 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">DeepSeek API Key</label>
            <div className="relative">
              <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." className="w-full h-9 px-3.5 pr-9 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200/80 text-xs font-mono text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer" title={showKey ? '隐藏密钥' : '显示密钥'}>
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-sky-50/70 border border-sky-100 px-3 py-2.5 text-[11.5px] text-sky-900 flex gap-2">
          <Image className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" />
          <span>官方接口调用路径为 <code className="font-mono">/v1/chat/completions</code>。独立凭证供关键词审核等已支持的业务调用，不会覆盖 Comfly。通用模型池暂未接入 DeepSeek 独立线路，请勿将它当作 Comfly 的开关。</span>
        </div>

        <div className="flex items-center justify-end gap-2 flex-wrap pt-1 border-t border-slate-100">
          <button type="button" onClick={onTest} disabled={isTesting} className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 cursor-pointer">
            {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />} 测试接口
          </button>
          <button type="button" onClick={onSave} className="h-9 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Save className="w-3.5 h-3.5" />保存 Key</button>
        </div>
      </div>
      <DeepSeekModelDirectory apiKey={apiKey} />
    </div>
  );
}
