import { Upload } from 'lucide-react';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { SettingsServiceHeader, SettingsField, SettingsSecretField, SettingsActions, SettingsToggle } from '../SettingsControls';

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
  onSave, onTest, onImportCodexCatalog,
  isTesting, modelCount, modelError, modelSource,
  suggestedBaseUrl, onUseSuggestedBaseUrl,
}: Props) {
  return <div className="settings-service-form">
    <SettingsServiceHeader icon={<ModelIcon modelId="gpt-6-luna" className="h-6 w-6" />} title="OpenAI / Responses" description="连接官方接口或兼容网关，用于视觉分析"
      links={[{ label: '获取密钥', href: 'https://platform.openai.com/api-keys' }, { label: '文档', href: 'https://developers.openai.com/api/docs/guides/images-vision' }]}
      action={<SettingsToggle label="启用 OpenAI 渠道视觉调用" checked={enabled} onChange={setEnabled} />} actions={<SettingsActions onTest={onTest} onSave={onSave} testing={isTesting} testDisabled={!apiKey.trim()} />} />
    <div className="settings-fields-grid">
      <SettingsField id="openai-base-url" label="接口地址 · Base URL" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.openai.com" />
      <SettingsSecretField id="openai-api-key" label="API 密钥" value={apiKey} onChange={event => setApiKey(event.target.value)} visible={showKey} onVisibleChange={setShowKey} placeholder="输入 API Key" />
    </div>
    {/^http:\/\//i.test(baseUrl.trim()) && <label className="settings-alert settings-alert-warning flex items-start gap-2"><input type="checkbox" checked={allowInsecureHttp} onChange={event => setAllowInsecureHttp(event.target.checked)} className="mt-1" /><span>允许此 HTTP 网关。API Key 将以明文传输，仅对此地址生效；建议使用 HTTPS。</span></label>}
    {modelError && (!suggestedBaseUrl || baseUrl.trim().replace(/\/+$/, '') !== suggestedBaseUrl) && <p role="alert" className="settings-alert settings-alert-error">{modelError}</p>}
    {suggestedBaseUrl && /^https:\/\//i.test(baseUrl.trim()) && <button type="button" onClick={() => onUseSuggestedBaseUrl(suggestedBaseUrl)} className="settings-alert settings-alert-warning text-left">改用 {suggestedBaseUrl} 并允许明文传输 API Key。确认地址后保存配置，再获取模型。</button>}
    {suggestedBaseUrl && baseUrl.trim().replace(/\/+$/, '') === suggestedBaseUrl && <p className="settings-alert settings-alert-warning">已选择 HTTP 地址并允许明文传输。请保存配置后重新获取模型。</p>}
    <details className="settings-details">
      <summary>本地模型目录 <span>{modelSource === 'codex' ? `已导入 ${modelCount} 个模型` : '可选'}</span></summary>
      <div className="settings-detail-content">
        <p>从 CC Switch / Codex 导入模型目录，实际调用仍使用上方接口和密钥。</p>
        <label className="settings-button-secondary cursor-pointer w-fit"><Upload className="h-4 w-4" />导入目录文件
          <input type="file" accept=".json,application/json" aria-label="导入 Codex 模型目录" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) onImportCodexCatalog(file); event.target.value = ''; }} />
        </label>
        <p className="break-all">在 CC Switch 更新 <code>~/.codex/cc-switch-model-catalog.json</code> 后导入。文件仅在本机读取。</p>
      </div>
    </details>
  </div>;
}
