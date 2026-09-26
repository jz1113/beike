import { Activity, Eye, EyeOff, Loader2, RefreshCw, Save } from 'lucide-react';
import { LianchiLogo } from '@/shared/icons';

interface Props {
  apiKey: string;
  setApiKey: (value: string) => void;
  showKey: boolean;
  setShowKey: (value: boolean) => void;
  isTesting: boolean;
  onTest: () => void;
  onSave: () => void;
  onFetchModels: () => void;
  isFetchingModels: boolean;
  modelCount: number;
}

export function ApiServicesLianchiPanel({ apiKey, setApiKey, showKey, setShowKey, isTesting, onTest, onSave, onFetchModels, isFetchingModels, modelCount }: Props) {
  return (
    <div className="bg-transparent py-1 space-y-4">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
        <div className="w-9 h-9 rounded-xl bg-white border border-slate-100 flex items-center justify-center"><LianchiLogo className="w-8 h-8" /></div>
        <div>
          <h2 className="text-sm sm:text-base font-black text-slate-900">联池图像接口</h2>
          <p className="text-xs text-slate-500 mt-1">GAPNET OpenAI Images 兼容接口。选择「联池image2」时自动使用此密钥。</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">接口地址 (Base URL)</label>
          <input readOnly value="https://api.gapnet.ai/endpoint" className="w-full h-9 px-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono text-slate-600" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">联池 API Key</label>
          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="填写联池密钥" className="w-full h-9 px-3.5 pr-9 rounded-xl border border-slate-200 text-xs font-mono outline-none focus:border-indigo-500" />
            <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-2.5 text-slate-400" aria-label={showKey ? '隐藏密钥' : '显示密钥'}>{showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
          </div>
        </div>
      </div>
      <p className="text-xs leading-6 text-slate-600 bg-indigo-50 rounded-xl px-3 py-2">
        文生图：<code>/v1/images/generations</code>，JSON 传入 model、prompt、size 等参数。参考图编辑：<code>/v1/images/edits</code>，以 multipart 的 <code>image[]</code> 上传图片。结果支持 URL 或 base64 图像。
      </p>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" onClick={onTest} disabled={isTesting} className="h-9 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">{isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}测试接口</button>
        <button type="button" onClick={onSave} className="h-9 px-3 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5"><Save className="w-4 h-4" />保存密钥</button>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-slate-800">联池可用模型库</p>
          <p className="text-[11px] text-slate-500 mt-1">从联池账户实时拉取模型；已拉取 {modelCount} 款，可在模型库中查看与接入已适配模型。</p>
        </div>
        <button type="button" onClick={onFetchModels} disabled={isFetchingModels || !apiKey.trim()} className="h-9 px-3 rounded-xl bg-white border border-indigo-200 text-indigo-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${isFetchingModels ? 'animate-spin' : ''}`} />获取联池模型库{modelCount ? ` (${modelCount})` : ''}
        </button>
      </div>
    </div>
  );
}
