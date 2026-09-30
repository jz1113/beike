import { OneBoundLogo } from '@client/shared/icons';
import { SettingsServiceHeader, SettingsField, SettingsSecretField, SettingsActions } from './SettingsControls';

export interface ApiServicesWanbangPanelProps {
  wanbangKey: string;
  setWanbangKey: (v: string) => void;
  wanbangSecret: string;
  setWanbangSecret: (v: string) => void;
  isWanbangEnabled: boolean;
  setIsWanbangEnabled: (v: boolean) => void;
  handleSaveWanbangConfig: () => void;
  handleTestWanbang: () => void;
  isTestingWanbang: boolean;
}

export function ApiServicesWanbangPanel({
  wanbangKey,
  setWanbangKey,
  wanbangSecret,
  setWanbangSecret,
  handleSaveWanbangConfig,
  handleTestWanbang,
  isTestingWanbang,
}: ApiServicesWanbangPanelProps) {
  return <div className="settings-service-form">
    <SettingsServiceHeader icon={<OneBoundLogo className="h-6 w-6" />} title="万邦电商采集" description="商品图片、规格与详情采集" links={[{ label: '获取凭证', href: 'https://open.onebound.cn' }]} actions={<SettingsActions onTest={handleTestWanbang} onSave={handleSaveWanbangConfig} testing={isTestingWanbang} testDisabled={!wanbangKey.trim() || !wanbangSecret.trim()} />} />
    <div className="settings-fields-grid">
      <SettingsField id="wanbangKey" label="API Key" value={wanbangKey} onChange={event => { setWanbangKey(event.target.value); }} placeholder="输入API Key" />
      <SettingsSecretField id="wanbangSecret" label="API Secret" value={wanbangSecret} onChange={event => { setWanbangSecret(event.target.value); }} placeholder="输入API Secret" />
    </div>
  </div>;
}
