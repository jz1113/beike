import { LianchiLogo } from '@client/shared/icons';
import { SettingsServiceHeader, SettingsField, SettingsSecretField, SettingsActions } from './SettingsControls';

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

export function ApiServicesLianchiPanel({ apiKey, setApiKey, showKey, setShowKey, isTesting, onTest, onSave }: Props) {
  return <div className="settings-service-form">
    <SettingsServiceHeader icon={<LianchiLogo className="h-6 w-6" />} title="联池图像" description="图片生成与参考图编辑" actions={<SettingsActions onTest={onTest} onSave={onSave} testing={isTesting} testDisabled={!apiKey.trim()} />} />
    <div className="settings-fields-grid">
      <SettingsField id="lianchi-endpoint" label="接口地址" value="https://api.gapnet.ai/endpoint" readOnly />
      <SettingsSecretField id="lianchi-key" label="API 密钥" value={apiKey} onChange={event => setApiKey(event.target.value)} visible={showKey} onVisibleChange={setShowKey} placeholder="输入 API Key" />
    </div>
  </div>;
}
