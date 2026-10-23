import { ApiaLogo } from '@client/shared/icons';
import { SettingsServiceHeader, SettingsField, SettingsSecretField, SettingsActions } from '../SettingsControls';

export interface ApiServicesApiaPanelProps {
  scraperId: string;
  setScraperId: (v: string) => void;
  scraperSecret: string;
  setScraperSecret: (v: string) => void;
  isApiaEnabled: boolean;
  setIsApiaEnabled: (v: boolean) => void;
  handleSaveScraperConfig: () => void;
  handleTestScraper: () => void;
  isTestingScraper: boolean;
}

export function ApiServicesApiaPanel({
  scraperId,
  setScraperId,
  scraperSecret,
  setScraperSecret,
  handleSaveScraperConfig,
  handleTestScraper,
  isTestingScraper,
}: ApiServicesApiaPanelProps) {
  return <div className="settings-service-form">
    <SettingsServiceHeader icon={<ApiaLogo className="h-6 w-6" />} title="APIA 内容解析" description="小红书、抖音与快手图集及视频解析" links={[{ label: '获取凭证', href: 'https://apia.vip' }]} actions={<SettingsActions onTest={handleTestScraper} onSave={handleSaveScraperConfig} testing={isTestingScraper} testDisabled={!scraperId.trim() || !scraperSecret.trim()} />} />
    <div className="settings-fields-grid">
      <SettingsField id="scraperId" label="Client ID" value={scraperId} onChange={event => { setScraperId(event.target.value); }} placeholder="输入Client ID" />
      <SettingsSecretField id="scraperSecret" label="Secret Key" value={scraperSecret} onChange={event => { setScraperSecret(event.target.value); }} placeholder="输入Secret Key" />
    </div>
    <details className="settings-details"><summary>接口信息</summary><p className="break-all">固定接口地址：https://apia.vip</p></details>
  </div>;
}
