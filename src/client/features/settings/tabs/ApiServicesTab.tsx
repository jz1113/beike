import { SettingsConnectionContext, SettingsSaveContext } from '../components/SettingsControls';
import { DeepSeekModelDirectory } from '../components/DeepSeekModelDirectory';
import { API_SERVICES } from '../components/settingsShared';
import { ApiServicesWanbangPanel } from '../components/ApiServicesWanbangPanel';
import { ApiServicesApiaPanel } from '../components/ApiServicesApiaPanel';
import { ApiServicesQiyunPanel } from '../components/ApiServicesQiyunPanel';
import { ApiServicesGatewayPanel } from '../components/ApiServicesGatewayPanel';
import { ApiServicesDeepSeekPanel } from '../components/ApiServicesDeepSeekPanel';
import { ApiServicesOpenAIPanel } from '../components/ApiServicesOpenAIPanel';
import { ApiServicesLianchiPanel } from '../components/ApiServicesLianchiPanel';
import { ApiServicesStoragePanel } from '../components/ApiServicesStoragePanel';
import { ApiServicesNavList, SERVICE_STATUS_COLORS } from '../components/ApiServicesNavList';
import { ModelManagementPanel } from '../components/ModelManagementPanel';
import { MODEL_CHANNELS, type ModelChannel } from '../model/modelManagement';
import { serviceStatuses } from '../model/serviceStatuses';
import type { ApiServicesTabProps } from './apiServicesTabTypes';

export default function ApiServicesTab({ config: c, models: m, group, selectedServiceId, setSelectedServiceId, serviceSearch, setServiceSearch, onAddModel, onManageModels, defaultRouteIds, showToast }: ApiServicesTabProps) {
  const services = group === 'storage'
    ? API_SERVICES.filter(service => service.id === 'cloud_storage')
    : group === 'all'
      ? API_SERVICES
      : API_SERVICES.filter(service => (service.category === 'core') === (group === 'models'));
  const query = serviceSearch.trim().toLowerCase();
  const filteredServices = services.filter(service => [service.name, service.subTitle, service.tag].some(text => text.toLowerCase().includes(query)));
  const statuses = serviceStatuses(c);
  const activeId = services.some(service => service.id === selectedServiceId) ? selectedServiceId : services[0].id;
  const status = statuses[activeId];
  const saving = ({ comfly_gateway: c.isSavingGateway, deepseek_official: c.isSavingDeepSeek,
    openai_official: c.isSavingOpenAI, lianchi_images: c.isSavingLianchi, wanbang_ecommerce: c.isSavingWanbang,
    apia_parser: c.isSavingScraper, qiyun_parser: c.isSavingQiyun, cloud_storage: c.isSavingStorage } as Record<string, boolean>)[activeId];
  const channel = MODEL_CHANNELS.find(item => item.serviceId === activeId)?.id;
  const discover = (id: ModelChannel) => {
    if (id === 'openai') void m.handleOpenOpenAIDiscovery(c.openAIBaseUrl, c.openAIApiKey, c.openAIAllowInsecureHttp, true);
    else if (id === 'lianchi') void m.handleOpenLianchiDiscovery(c.lianchiApiKey, true);
    else void m.handleOpenGatewayDiscovery();
  };
  return <>
    {group !== 'storage' && <ApiServicesNavList services={filteredServices} serviceSearch={serviceSearch} setServiceSearch={setServiceSearch} selectedServiceId={activeId} setSelectedServiceId={setSelectedServiceId} statuses={statuses} />}
    <div className="settings-page-scroll flex-1 min-w-0 overflow-y-auto">
      <div className="settings-page-content w-full p-4 lg:p-5 space-y-4">
        <label className="@[840px]/settings-modal:hidden block text-xs text-slate-600">{group === 'models' ? '选择模型渠道' : '选择服务'}<select aria-label="选择接口服务" value={activeId} onChange={event => setSelectedServiceId(event.target.value)} className="block w-full mt-2 p-2.5 rounded-xl border border-slate-200 bg-white">{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
        <form className="settings-config-card" onSubmit={event => event.preventDefault()}>
        <SettingsSaveContext.Provider value={Boolean(saving)}>
        <fieldset disabled={!c.configLoaded || saving} className="border-0 p-0 m-0 min-w-0">
        <SettingsConnectionContext.Provider value={<span role="status" title={status.detail} className={`settings-connection-status inline-flex items-center gap-1.5 text-xs font-medium ${SERVICE_STATUS_COLORS[status.state]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status.label}</span>}>
        {activeId === 'comfly_gateway' && <ApiServicesGatewayPanel {...c} />}
        {activeId === 'deepseek_official' && <ApiServicesDeepSeekPanel apiKey={c.deepSeekApiKey} setApiKey={c.setDeepSeekApiKey} showKey={c.showDeepSeekKey} setShowKey={c.setShowDeepSeekKey} isTesting={c.isTestingDeepSeek} onTest={c.handleTestDeepSeek} onSave={c.handleSaveDeepSeekConfig} />}
        {activeId === 'openai_official' && <ApiServicesOpenAIPanel
          baseUrl={c.openAIBaseUrl} setBaseUrl={c.setOpenAIBaseUrl} apiKey={c.openAIApiKey} setApiKey={c.setOpenAIApiKey}
          showKey={c.showOpenAIKey} setShowKey={c.setShowOpenAIKey} enabled={c.openAIEnabled} setEnabled={c.setOpenAIEnabled}
          allowInsecureHttp={c.openAIAllowInsecureHttp} setAllowInsecureHttp={c.setOpenAIAllowInsecureHttp}
          suggestedBaseUrl={m.openAIModelSuggestedBaseUrl} onUseSuggestedBaseUrl={c.switchOpenAIToHttpGateway}
          onTest={c.handleTestOpenAI} onSave={c.handleSaveOpenAIConfig} onFetchModels={() => discover('openai')}
          onImportCodexCatalog={m.handleImportCodexCatalog} onAddManualModel={() => onAddModel('openai')}
          isTesting={c.isTestingOpenAI} isFetchingModels={m.isFetchingOpenAI} modelCount={m.openAIModels.length}
          modelError={m.openAIModelError} modelSource={m.openAIModelSource}
        />}
        {activeId === 'lianchi_images' && <ApiServicesLianchiPanel apiKey={c.lianchiApiKey} setApiKey={c.setLianchiApiKey} showKey={c.showLianchiKey} setShowKey={c.setShowLianchiKey} isTesting={c.isTestingLianchi} onTest={c.handleTestLianchi} onSave={c.handleSaveLianchiConfig} onFetchModels={() => discover('lianchi')} isFetchingModels={m.isFetchingLianchi} modelCount={m.lianchiModels.length} />}
        {activeId === 'wanbang_ecommerce' && <ApiServicesWanbangPanel {...c} />}
        {activeId === 'apia_parser' && <ApiServicesApiaPanel {...c} />}
        {activeId === 'qiyun_parser' && <ApiServicesQiyunPanel {...c} />}
        {activeId === 'cloud_storage' && <ApiServicesStoragePanel {...c} showToast={showToast} />}
        </SettingsConnectionContext.Provider>
        {status.state === 'failed' && <p role="alert" className="mt-3 text-xs text-rose-600 break-words">{status.detail}</p>}
        </fieldset>
        </SettingsSaveContext.Provider>
        </form>
        {activeId === 'deepseek_official' && <DeepSeekModelDirectory apiKey={c.deepSeekApiKey} configuredModels={m.customModels} onAdd={m.handleAddCustomModel} />}
        {channel && <>
          <ModelManagementPanel key={channel} models={m} scope={channel} onManageAll={onManageModels} onAdd={onAddModel} onConfigure={() => {}} onDiscover={discover} isDiscovering={m.isFetchingGateway || m.isFetchingOpenAI || m.isFetchingLianchi} defaultRouteIds={defaultRouteIds} />
        </>}
      </div>
    </div>
  </>;
}
