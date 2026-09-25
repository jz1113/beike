import { API_SERVICES } from '../settingsShared';
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
import { MODEL_CHANNELS, type ModelChannel } from '../modelManagement';
import { serviceStatuses } from '../serviceStatuses';
import type { ApiServicesTabProps } from './apiServicesTabTypes';

export default function ApiServicesTab({ config: c, models: m, group, selectedServiceId, setSelectedServiceId, serviceSearch, setServiceSearch, onAddModel, onManageModels, defaultRouteIds, showToast }: ApiServicesTabProps) {
  const services = API_SERVICES.filter(service => (service.category === 'core') === (group === 'models'));
  const query = serviceSearch.trim().toLowerCase();
  const filteredServices = services.filter(service => [service.name, service.subTitle, service.tag].some(text => text.toLowerCase().includes(query)));
  const statuses = serviceStatuses(c);
  const activeId = services.some(service => service.id === selectedServiceId) ? selectedServiceId : services[0].id;
  const status = statuses[activeId];
  const channel = MODEL_CHANNELS.find(item => item.serviceId === activeId)?.id;
  const discover = (id: ModelChannel) => {
    if (id === 'openai') void m.handleOpenOpenAIDiscovery(c.openAIBaseUrl, c.openAIApiKey, c.openAIAllowInsecureHttp, true);
    else if (id === 'lianchi') void m.handleOpenLianchiDiscovery(c.lianchiApiKey, true);
    else void m.handleOpenGatewayDiscovery();
  };
  return <>
    <ApiServicesNavList services={filteredServices} serviceSearch={serviceSearch} setServiceSearch={setServiceSearch} selectedServiceId={activeId} setSelectedServiceId={setSelectedServiceId} statuses={statuses} />
    <div className="flex-1 min-w-0 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 space-y-5">
        <label className="lg:hidden block text-xs text-slate-600">{group === 'models' ? '选择模型渠道' : '选择服务'}<select aria-label="选择接口服务" value={activeId} onChange={event => setSelectedServiceId(event.target.value)} className="block w-full mt-2 p-2.5 rounded-xl border border-slate-200 bg-white">{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
        <div role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`text-xs font-semibold ${SERVICE_STATUS_COLORS[status.state]}`}>{status.label}</span><span className="text-[11px] text-slate-500 break-words">{status.detail}</span>
        </div>
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
        {channel && <>
          <div className="flex justify-between items-center gap-3"><p className="text-xs text-slate-500">这里只管理本渠道；同名模型的其他渠道线路保持独立。</p><button type="button" onClick={onManageModels} className="text-xs text-indigo-600 shrink-0">查看全部渠道模型 →</button></div>
          <ModelManagementPanel key={channel} models={m} scope={channel} onAdd={onAddModel} onConfigure={() => {}} onDiscover={discover} isDiscovering={m.isFetchingGateway || m.isFetchingOpenAI || m.isFetchingLianchi} defaultRouteIds={defaultRouteIds} />
        </>}
      </div>
    </div>
  </>;
}
