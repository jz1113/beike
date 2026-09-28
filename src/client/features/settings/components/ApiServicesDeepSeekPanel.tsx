import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { SettingsServiceHeader, SettingsField, SettingsSecretField, SettingsActions } from './SettingsControls';

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
  return <div className="settings-service-form">
    <SettingsServiceHeader icon={<ModelIcon modelId="deepseek-flash" className="h-6 w-6" />} title="DeepSeek" description="助手对话、文案创作、图像理解与关键词审核" links={[{ label: '获取密钥', href: 'https://platform.deepseek.com' }]} actions={<SettingsActions onTest={onTest} onSave={onSave} testing={isTesting} testDisabled={!apiKey.trim()} />} />
    <div className="settings-fields-grid">
      <SettingsField id="deepseek-endpoint" label="接口地址" value="https://api.deepseek.com" readOnly />
      <SettingsSecretField id="deepseek-key" label="API 密钥" value={apiKey} onChange={event => setApiKey(event.target.value)} visible={showKey} onVisibleChange={setShowKey} placeholder="输入 API Key" />
    </div>
    <p className="settings-field-note">启用下方官方模型后，可在各功能中选择；Flash 支持图像理解，V4 Pro 用于文本对话。</p>
  </div>;
}
