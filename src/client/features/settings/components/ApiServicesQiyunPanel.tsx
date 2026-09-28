import { QiyunLogo } from '@client/shared/icons';
import { SettingsServiceHeader, SettingsField, SettingsSecretField, SettingsActions, SettingsToggle } from './SettingsControls';

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

  return <div className="settings-service-form">
    <SettingsServiceHeader icon={<QiyunLogo className="h-6 w-6" />} title="奇云解析" description="短视频、图集与视频号内容解析" links={[{ label: '获取凭证', href: 'https://qyapi.ipaybuy.cn' }]} action={<SettingsToggle label="启用奇云解析" checked={isQiyunEnabled} onChange={setIsQiyunEnabled} />} actions={<SettingsActions onTest={handleTestQiyun} onSave={handleSaveQiyunConfig} testing={isTestingQiyun} testDisabled={!qiyunAppId.trim() || !qiyunAppKey.trim()} />} />
    <div className="settings-fields-grid">
      <SettingsField id="qiyunAppId" label="App ID" value={qiyunAppId} onChange={event => { setQiyunAppId(event.target.value); localStorage.setItem('qiyun_app_id', event.target.value); }} placeholder="输入App ID" />
      <SettingsSecretField id="qiyunAppKey" label="App Key" value={qiyunAppKey} onChange={event => { setQiyunAppKey(event.target.value); localStorage.setItem('qiyun_app_key', event.target.value); }} placeholder="输入App Key" />
    </div>
    <details className="settings-details"><summary>接口信息</summary><p className="break-all">固定接口地址：https://qyapi.ipaybuy.cn/api/video</p></details>
  </div>;
}
