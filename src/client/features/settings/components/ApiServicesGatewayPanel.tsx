import { ComflyLogo } from '@client/shared/icons';
import { SettingsServiceHeader, SettingsField, SettingsSecretField, SettingsActions } from './SettingsControls';
export interface ApiServicesGatewayPanelProps {
  apiKey: string;
  setApiKey: (v: string) => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  handleSaveApiConfig: (url: string, key: string, notify?: boolean) => void;
  handleTestPing: () => void;
  isTesting: boolean;

}

export function ApiServicesGatewayPanel({
  apiKey,
  setApiKey,
  baseUrl,
  setBaseUrl,
  showKey,
  setShowKey,
  handleSaveApiConfig,
  handleTestPing,
  isTesting,
}: ApiServicesGatewayPanelProps) {
  return <div className="settings-service-form">
    <SettingsServiceHeader icon={<ComflyLogo className="h-6 w-6" />} title="Comfly 网关" description="对话、图像与视频生成" actions={<SettingsActions onTest={handleTestPing} onSave={() => handleSaveApiConfig(baseUrl, apiKey, true)} testing={isTesting} testDisabled={!apiKey.trim()} />} />
    <div className="settings-fields-grid">
      <SettingsField id="comfly-base-url" label="接口地址 · Base URL" value={baseUrl} onChange={event => { setBaseUrl(event.target.value); handleSaveApiConfig(event.target.value, apiKey); }} placeholder="https://ai.comfly.org" />
      <SettingsSecretField id="comfly-api-key" label="API 密钥" value={apiKey} onChange={event => { setApiKey(event.target.value); handleSaveApiConfig(baseUrl, event.target.value); }} visible={showKey} onVisibleChange={setShowKey} placeholder="输入 API Key" />
    </div>
  </div>;
}
