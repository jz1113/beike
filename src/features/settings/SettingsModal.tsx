'use client';
import { apiFetch } from '@/lib/apiClient';
import { confirmAction } from '@/lib/confirmAction';
import { persistDesktopApiConfig } from '@/lib/persistDesktopEnv';
import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Settings,
  Server,
  SlidersHorizontal,
  Activity,
  Palette,
  Info,
  Shield,
  HardDrive
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getUsageSummary, type UsageSummary } from '@/lib/usageTracker';
import { logLatencyAudit } from '@/lib/latencyAudit';
import { getStoredMultimodalModelId, gatewayModelToWorkflowModel, inferWorkflowCapabilitiesFromId, repairWorkflowModelsForSettings } from '@/lib/workflowModels';
import { credentialSet, credentialHas } from '@/lib/credentialClient';
import { isTauriDesktop } from '@/lib/desktopRuntime';
import GatewayModelModal, { GatewayModelItem } from './GatewayModelModal';
import {
  DEFAULT_PRESET_MODELS,
  type WorkflowModel,
} from './settingsShared';
import ApiServicesTab from './tabs/ApiServicesTab';
import DefaultsTab from './tabs/DefaultsTab';
import UsageTab from './tabs/UsageTab';
import AppearanceTab from './tabs/AppearanceTab';
import AboutTab from './tabs/AboutTab';
import LocalStorageTab from './tabs/LocalStorageTab';

export type { WorkflowModel } from './settingsShared';
export { DEFAULT_PRESET_MODELS, API_SERVICES, type ApiServiceItem } from './settingsShared';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: Props) {
  const { 
    selectedVisionModel, 
    setSelectedVisionModel,
    selectedImageGenModel,
    setSelectedImageGenModel,
    quickVideoModel,
    setQuickVideoModel
  } = useAppStore();

  // 1. 左侧大类导航
  const [navSection, setNavSection] = useState<'api_services' | 'defaults' | 'usage' | 'local_storage' | 'appearance' | 'about'>('api_services');
  
  // 2. 中间选中的 API 接口
  const [selectedServiceId, setSelectedServiceId] = useState<string>('comfly_gateway');
  const [serviceSearch, setServiceSearch] = useState('');

  // 2.1 用量统计面板状态 (基于真实调用记录)
  const [usageRange, setUsageRange] = useState<'30d' | '90d' | '1y'>('30d');
  const [activityMetric, setActivityMetric] = useState<'token' | 'cost'>('token');
  const [exploreFilter, setExploreFilter] = useState<string>('provider');
  const [usageModelSearch, setUsageModelSearch] = useState<string>('');
  const [usageRefreshKey, setUsageRefreshKey] = useState<number>(0);

  const usageSummary: UsageSummary = useMemo(() => {
    return getUsageSummary(usageRange);
  }, [usageRange, usageRefreshKey, navSection]);

  // 3. Comfly API Key 与 Base URL
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://ai.comfly.org');
  const [showKey, setShowKey] = useState(false);
  const [isGatewayEnabled, setIsGatewayEnabled] = useState(true);

  // 4. 万邦 (OneBound) 电商数据采集接口状态
  const [wanbangKey, setWanbangKey] = useState('');
  const [wanbangSecret, setWanbangSecret] = useState('');
  const [showWanbangSecret, setShowWanbangSecret] = useState(false);
  const [isWanbangEnabled, setIsWanbangEnabled] = useState(true);
  const [isTestingWanbang, setIsTestingWanbang] = useState(false);

  // 5. 备用第三方电商爬虫接口状态 (天猫/淘宝/1688等)
  const [scraperId, setScraperId] = useState('');
  const [scraperSecret, setScraperSecret] = useState('');
  const [showScraperSecret, setShowScraperSecret] = useState(false);
  const [appAccessToken, setAppAccessToken] = useState('');

  // 6. APIA 第三方短视频/图集解析接口 (小红书/抖音/快手)
  const [apiaKey, setApiaKey] = useState('');
  const [apiaBaseUrl, setApiaBaseUrl] = useState('https://apia.vip');
  const [showApiaKey, setShowApiaKey] = useState(false);
  const [isApiaEnabled, setIsApiaEnabled] = useState(true);

  // 7. 云端永久对象存储 (Cloudflare R2 / 阿里云 OSS / 腾讯云 COS / 通用 S3)
  const [storageEnabled, setStorageEnabled] = useState(false);
  const [storageProvider, setStorageProvider] = useState<'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase'>('r2');
  const [storageAccountId, setStorageAccountId] = useState('');
  const [storageEndpoint, setStorageEndpoint] = useState('');
  const [storageAccessKeyId, setStorageAccessKeyId] = useState('');
  const [storageSecretAccessKey, setStorageSecretAccessKey] = useState('');
  const [showStorageSecret, setShowStorageSecret] = useState(false);
  const [storageBucketName, setStorageBucketName] = useState('');
  const [storagePublicDomain, setStoragePublicDomain] = useState('');
  const [isTestingStorage, setIsTestingStorage] = useState(false);
  const [isMigratingStorage, setIsMigratingStorage] = useState(false);

  // 7. 网关发现模态窗 (854+)
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [isFetchingGateway, setIsFetchingGateway] = useState(false);
  const [allGatewayModels, setAllGatewayModels] = useState<GatewayModelItem[]>([]);

  // 8. 手动添加模型模态窗
  const [isAddingModelModalOpen, setIsAddingModelModalOpen] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelDesc, setNewModelDesc] = useState('');
  const [newModelFeatures, setNewModelFeatures] = useState({
    isMultimodal: true,
    isImage: false,
    isVideo: false,
    isVision: true,
    isAssistant: true,
    isDistill: false,
    isThinking: false
  });

  // 9. 业务默认模型路由状态 (多模态大模型、商业生图、视频生成)
  const [activeVisionModel, setActiveVisionModel] = useState('gemini-3.1-pro-preview-thinking-high');
  const [activeImageGenModel, setActiveImageGenModel] = useState('gpt-image-2');
  const [activeVideoGenModel, setActiveVideoGenModel] = useState('doubao-seedance-2.5');
  const [activeAssistantModel, setActiveAssistantModel] = useState('gemini-3.1-pro-preview-thinking-high');
  const [activeDistillModel, setActiveDistillModel] = useState('claude-opus-5');

  // 8. 自定义模型库 (Custom Models) — 仅含用户从网关拉取 / 手动添加的模型
  const [customModels, setCustomModels] = useState<WorkflowModel[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [modelCapabilityFilter, setModelCapabilityFilter] = useState<'all' | 'multimodal' | 'image' | 'video'>('all');

  // 9. 添加/编辑模型抽屉状态
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<WorkflowModel | null>(null);

  // 10. 临时表单状态 (新增/修改模型)
  const [formModel, setFormModel] = useState<{
    id: string;
    name: string;
    shortName: string;
    desc: string;
    badge: string;
    isMultimodal: boolean;
    isImage: boolean;
    isVideo: boolean;
    isVision?: boolean;
    isAssistant?: boolean;
    isDistill?: boolean;
    isThinking?: boolean;
  }>({
    id: '',
    name: '',
    shortName: '',
    desc: '',
    badge: '',
    isMultimodal: true,
    isVision: true,
    isImage: false,
    isVideo: false,
    isAssistant: true,
    isDistill: false,
    isThinking: false
  });

  // 11. 连接测试状态与 Toast
  const [isTesting, setIsTesting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // 初始化加载配置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      void (async () => {
        const savedUrl = localStorage.getItem('ai_base_url') || 'https://ai.comfly.org';
        setBaseUrl(savedUrl);
        if (isTauriDesktop()) {
          const hasKey = await credentialHas('ai_api_key');
          setApiKey(hasKey ? '' : (localStorage.getItem('ai_api_key') || ''));
        } else {
          setApiKey(localStorage.getItem('ai_api_key') || '');
        }

      const savedWbKey = localStorage.getItem('wanbang_api_key') || '';
      const savedWbSec = localStorage.getItem('wanbang_api_secret') || '';
      setWanbangKey(savedWbKey);
      setWanbangSecret(savedWbSec);

      const savedScraperId = localStorage.getItem('external_scraper_id') || '';
      const savedScraperSec = localStorage.getItem('external_scraper_secret') || '';
      setScraperId(savedScraperId);
      setScraperSecret(savedScraperSec);

      const savedAppToken = localStorage.getItem('app_access_token') || '';
      setAppAccessToken(savedAppToken || 'azhuo-local-dev');

      // 加载对象存储配置
      const savedStorageEnabled = localStorage.getItem('storage_enabled') === 'true';
      const savedStorageProvider = (localStorage.getItem('storage_provider') as any) || 'r2';
      const savedStorageAccId = localStorage.getItem('storage_account_id') || '';
      const savedStorageEndpoint = localStorage.getItem('storage_endpoint') || '';
      const savedStorageKeyId = localStorage.getItem('storage_access_key_id') || '';
      const savedStorageSecret = localStorage.getItem('storage_secret_access_key') || '';
      const savedStorageBucket = localStorage.getItem('storage_bucket_name') || '';
      const savedStorageDomain = localStorage.getItem('storage_public_domain') || '';

      setStorageEnabled(savedStorageEnabled);
      setStorageProvider(savedStorageProvider);
      setStorageAccountId(savedStorageAccId);
      setStorageEndpoint(savedStorageEndpoint);
      setStorageAccessKeyId(savedStorageKeyId);
      setStorageSecretAccessKey(savedStorageSecret);
      setStorageBucketName(savedStorageBucket);
      setStoragePublicDomain(savedStorageDomain);

      const savedVision = getStoredMultimodalModelId();
      setActiveVisionModel(savedVision);
      setActiveAssistantModel(savedVision);

      const savedImage = localStorage.getItem('ai_image_gen_model');
      if (savedImage) setActiveImageGenModel(savedImage);

      const savedVideo = localStorage.getItem('ai_video_gen_model');
      if (savedVideo) {
        setActiveVideoGenModel(savedVideo);
      } else if (quickVideoModel) {
        setActiveVideoGenModel(quickVideoModel);
      }

      const savedDistill = localStorage.getItem('ai_distill_model');
      if (savedDistill && (savedDistill.includes('claude') || savedDistill.includes('opus') || savedDistill.includes('fable'))) {
        setActiveDistillModel(savedDistill);
      } else {
        setActiveDistillModel('claude-opus-5');
        localStorage.setItem('ai_distill_model', 'claude-opus-5');
      }

      const savedCustom = localStorage.getItem('custom_models');
      if (savedCustom !== null) {
        try {
          const parsed = JSON.parse(savedCustom);
          if (Array.isArray(parsed)) {
            setCustomModels(repairWorkflowModelsForSettings());
          } else {
            setCustomModels([]);
            localStorage.setItem('custom_models', JSON.stringify([]));
          }
        } catch (e) {
          setCustomModels([]);
          localStorage.setItem('custom_models', JSON.stringify([]));
        }
      } else {
        setCustomModels([]);
        localStorage.setItem('custom_models', JSON.stringify([]));
      }
      })();
    }
  }, [isOpen]);

  // 测试 Comfly 网关延迟 Ping
  const handleTestPing = async () => {
    if (!apiKey.trim()) {
      showToast('⚠️ 请先填写 API Key');
      return;
    }
    setIsTesting(true);
    const start = Date.now();
    try {
      const res = await apiFetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'hi' }],
          model: activeAssistantModel || 'gemini-3.1-pro-preview-thinking-high',
          customBaseUrl: baseUrl || undefined,
          customApiKey: apiKey || undefined
        })
      });
      const latency = Date.now() - start;
      logLatencyAudit({
        hypothesisId: 'H0',
        location: 'SettingsModal.tsx:handleTestPing',
        message: 'gateway ping latency',
        data: {
          latencyMs: latency,
          httpStatus: res.status,
          ok: res.ok,
          baseUrl: baseUrl || null,
          anomaly: latency > 5000 || !res.ok,
        },
      });
      if (res.ok) {
        showToast(`🟢 连通正常！响应延迟: ${latency}ms`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`🔴 连接异常 (${res.status}): ${err.error || '无法访问 API 网关'}`);
      }
    } catch (e: any) {
      logLatencyAudit({
        hypothesisId: 'H0',
        location: 'SettingsModal.tsx:handleTestPing-catch',
        message: 'gateway ping failed',
        data: { error: String(e?.message || e), elapsedMs: Date.now() - start },
      });
      showToast(`🔴 网络超时: ${e.message || '网关连接失败'}`);
    } finally {
      setIsTesting(false);
    }
  };

  // 测试万邦电商数据采集接口连通性
  const handleTestWanbang = async () => {
    setIsTestingWanbang(true);
    try {
      const res = await apiFetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'wanbang',
          wanbangKey: wanbangKey.trim() || undefined,
          wanbangSecret: wanbangSecret.trim() || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🟢 ${data.message || '万邦电商接口连通正常！'}`);
      } else {
        showToast(`🔴 万邦接口异常: ${data.error || '无法连通万邦网关'}`);
      }
    } catch (err: any) {
      showToast(`🔴 网络超时: ${err.message || '测试失败'}`);
    } finally {
      setIsTestingWanbang(false);
    }
  };

  // 自动保存 API 配置
  const handleSaveApiConfig = (newUrl: string, newKey: string) => {
    localStorage.setItem('ai_base_url', newUrl);
    if (newKey.trim()) {
      void credentialSet('ai_api_key', newKey.trim());
      localStorage.removeItem('ai_api_key');
    }
    void persistDesktopApiConfig(newUrl, newKey);
    apiFetch('/api/system/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ai', baseUrl: newUrl, apiKey: newKey, model: activeImageGenModel || 'gpt-image-2' })
    }).catch(() => {});
  };

  // 获取网关模型列表 (854+)
  const handleOpenGatewayDiscovery = async () => {
    if (allGatewayModels.length > 0) {
      setIsGatewayModalOpen(true);
      return;
    }

    if (!apiKey.trim()) {
      alert('请先填入有效的 API 密钥 (API Key)');
      return;
    }

    setIsFetchingGateway(true);
    setIsGatewayModalOpen(true);
    try {
      const res = await apiFetch('/api/system/models/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '获取失败');
      setAllGatewayModels(data.models || []);
    } catch (err: any) {
      alert(err.message || '获取网关模型列表失败');
    } finally {
      setIsFetchingGateway(false);
    }
  };

  // 安全触发模型更新事件通知 (微任务异步派发，杜绝跨组件并发 setState 冲突)
  const notifyModelsUpdated = () => {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new Event('models_updated'));
      }, 0);
    }
  };

  // 单个模型切换能力标签 (3 大核心能力)
  const handleToggleCapability = (modelId: string, field: 'isMultimodal' | 'isImage' | 'isVideo' | 'isVision' | 'isAssistant' | 'isDistill' | 'isThinking') => {
    setCustomModels(prev => {
      const updated = prev.map(m => {
        if (m.id === modelId) {
          if (field === 'isMultimodal' || field === 'isVision' || field === 'isAssistant' || field === 'isDistill' || field === 'isThinking') {
            const currentMulti = m.isMultimodal ?? m.isVision ?? true;
            const nextVal = !currentMulti;
            return {
              ...m,
              isMultimodal: nextVal,
              isVision: nextVal,
              isAssistant: nextVal,
              isDistill: nextVal,
              isThinking: nextVal
            };
          }
          return { ...m, [field]: !m[field] };
        }
        return m;
      });
      localStorage.setItem('custom_models', JSON.stringify(updated));
      return updated;
    });
    notifyModelsUpdated();
  };

  // 单个模型移出/删除
  const handleDeleteModel = (modelId: string) => {
    setCustomModels(prev => {
      const updated = prev.filter(m => m.id !== modelId);
      localStorage.setItem('custom_models', JSON.stringify(updated));
      return updated;
    });
    notifyModelsUpdated();
    showToast(`已移出模型 ${modelId}`);
  };

  // 恢复系统默认预设模型列表
  const handleResetDefaultModels = async () => {
    if (await confirmAction('确定恢复系统默认预设模型列表吗？这将覆盖当前的模型修改。')) {
      setCustomModels(DEFAULT_PRESET_MODELS);
      localStorage.setItem('custom_models', JSON.stringify(DEFAULT_PRESET_MODELS));
      notifyModelsUpdated();
      showToast('已恢复系统默认预设模型');
    }
  };

  // 手动添加模型
  const handleAddCustomModel = () => {
    if (!newModelId.trim()) {
      alert('请填写模型 ID');
      return;
    }
    const id = newModelId.trim();
    const name = newModelName.trim() || id;
    const isMulti = newModelFeatures.isMultimodal ?? newModelFeatures.isVision;

    const modelObj: WorkflowModel = {
      id,
      name,
      shortName: name.split(' ')[0],
      badge: '自定义',
      desc: newModelDesc.trim() || '用户自定义模型',
      isMultimodal: !!isMulti,
      isVision: !!isMulti,
      isAssistant: !!isMulti,
      isDistill: !!isMulti,
      isThinking: !!isMulti,
      isImage: newModelFeatures.isImage,
      isVideo: newModelFeatures.isVideo,
      isCustom: true
    };

    setCustomModels(prev => {
      const updated = [modelObj, ...prev.filter(m => m.id !== id)];
      localStorage.setItem('custom_models', JSON.stringify(updated));
      return updated;
    });
    notifyModelsUpdated();

    setIsAddingModelModalOpen(false);
    setNewModelId('');
    setNewModelName('');
    setNewModelDesc('');
    showToast(`✨ 成功添加模型【${name}】`);
  };



  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-950/60 backdrop-blur-xs select-none animate-fade-in">
      <div 
        className="w-[94vw] max-w-[1280px] 2xl:max-w-[1380px] h-[90vh] max-h-[860px] bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col font-sans relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Toast 提示条 */}
        {toastMsg && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center gap-2 border border-slate-700 animate-fade-in">
            <span>{toastMsg}</span>
          </div>
        )}

        {/* 1. 顶部标准窗口控制条 */}
        <div className="h-14 px-6 border-b border-slate-100 bg-[#FBFBFB] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-2xs">
              <Settings className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <div className="text-sm sm:text-base font-bold text-slate-900 leading-tight">系统与接口配置中心</div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">Comfly AI · ONEBOUND 万邦 · APIA 社媒解析</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200/60 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>服务就绪</span>
            </div>

            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
              title="关闭设置"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* 2. Cherry Studio 经典三栏架构 */}
        <div className="flex-1 flex overflow-hidden min-h-0 bg-white">
          
          {/* ===================== COLUMN 1: 左侧大类导航栏 (~210px) ===================== */}
          <div className="w-48 sm:w-54 border-r border-slate-100 bg-[#F9FAFB] p-3.5 flex flex-col flex-shrink-0 overflow-y-auto justify-between text-sm">
            <div className="space-y-5">
              {/* 分组：接口与服务 */}
              <div className="space-y-1.5">
                <div className="px-2.5 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">调用接口与服务</div>
                
                <button
                  onClick={() => setNavSection('api_services')}
                  className={`w-full px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    navSection === 'api_services'
                      ? 'bg-slate-200/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Server className="w-4.5 h-4.5 text-indigo-600" />
                  <span>服务接口配置</span>
                </button>

                <button
                  onClick={() => setNavSection('defaults')}
                  className={`w-full px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    navSection === 'defaults'
                      ? 'bg-slate-200/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <SlidersHorizontal className="w-4.5 h-4.5 text-purple-600" />
                  <span>默认业务模型</span>
                </button>

                <button
                  onClick={() => setNavSection('usage')}
                  className={`w-full px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    navSection === 'usage'
                      ? 'bg-slate-200/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Activity className="w-4.5 h-4.5 text-emerald-600" />
                  <span>用量统计</span>
                </button>
              </div>

              {/* 分组：偏好 */}
              <div className="space-y-1.5">
                <div className="px-2.5 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">偏好与系统</div>

                <button
                  onClick={() => setNavSection('local_storage')}
                  className={`w-full px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    navSection === 'local_storage'
                      ? 'bg-slate-200/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <HardDrive className="w-4.5 h-4.5 text-blue-600" />
                  <span>本地存储管理</span>
                </button>

                <button
                  onClick={() => setNavSection('appearance')}
                  className={`w-full px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    navSection === 'appearance'
                      ? 'bg-slate-200/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Palette className="w-4.5 h-4.5 text-slate-500" />
                  <span>外观偏好</span>
                </button>

                <button
                  onClick={() => setNavSection('about')}
                  className={`w-full px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    navSection === 'about'
                      ? 'bg-slate-200/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Info className="w-4.5 h-4.5 text-slate-500" />
                  <span>关于系统</span>
                </button>
              </div>
            </div>

            {/* 底部状态徽章 */}
            <div className="p-3 rounded-2xl bg-white border border-slate-200/80 text-xs text-slate-600 space-y-1 shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>核心接口就绪</span>
              </div>
              <p className="text-[11px] text-slate-400">Comfly + 万邦 + APIA 解析</p>
            </div>
          </div>

          {navSection === 'api_services' && (
            <ApiServicesTab
              selectedServiceId={selectedServiceId}
              setSelectedServiceId={setSelectedServiceId}
              serviceSearch={serviceSearch}
              setServiceSearch={setServiceSearch}
              isGatewayEnabled={isGatewayEnabled}
              setIsGatewayEnabled={setIsGatewayEnabled}
              apiKey={apiKey}
              setApiKey={setApiKey}
              baseUrl={baseUrl}
              setBaseUrl={setBaseUrl}
              showKey={showKey}
              setShowKey={setShowKey}
              appAccessToken={appAccessToken}
              setAppAccessToken={setAppAccessToken}
              handleSaveApiConfig={handleSaveApiConfig}
              handleTestPing={handleTestPing}
              isTesting={isTesting}
              handleOpenGatewayDiscovery={handleOpenGatewayDiscovery}
              isFetchingGateway={isFetchingGateway}
              allGatewayModels={allGatewayModels}
              customModels={customModels}
              modelSearch={modelSearch}
              setModelSearch={setModelSearch}
              modelCapabilityFilter={modelCapabilityFilter}
              setModelCapabilityFilter={setModelCapabilityFilter}
              handleToggleCapability={handleToggleCapability}
              handleDeleteModel={handleDeleteModel}
              handleResetDefaultModels={handleResetDefaultModels}
              setIsAddingModelModalOpen={setIsAddingModelModalOpen}
              wanbangKey={wanbangKey}
              setWanbangKey={setWanbangKey}
              wanbangSecret={wanbangSecret}
              setWanbangSecret={setWanbangSecret}
              isWanbangEnabled={isWanbangEnabled}
              setIsWanbangEnabled={setIsWanbangEnabled}
              handleTestWanbang={handleTestWanbang}
              isTestingWanbang={isTestingWanbang}
              scraperId={scraperId}
              setScraperId={setScraperId}
              scraperSecret={scraperSecret}
              setScraperSecret={setScraperSecret}
              isApiaEnabled={isApiaEnabled}
              setIsApiaEnabled={setIsApiaEnabled}
              storageEnabled={storageEnabled}
              setStorageEnabled={setStorageEnabled}
              storageProvider={storageProvider}
              setStorageProvider={setStorageProvider}
              storageAccountId={storageAccountId}
              setStorageAccountId={setStorageAccountId}
              storageEndpoint={storageEndpoint}
              setStorageEndpoint={setStorageEndpoint}
              storageAccessKeyId={storageAccessKeyId}
              setStorageAccessKeyId={setStorageAccessKeyId}
              storageSecretAccessKey={storageSecretAccessKey}
              setStorageSecretAccessKey={setStorageSecretAccessKey}
              showStorageSecret={showStorageSecret}
              setShowStorageSecret={setShowStorageSecret}
              storageBucketName={storageBucketName}
              setStorageBucketName={setStorageBucketName}
              storagePublicDomain={storagePublicDomain}
              setStoragePublicDomain={setStoragePublicDomain}
              isTestingStorage={isTestingStorage}
              setIsTestingStorage={setIsTestingStorage}
              isMigratingStorage={isMigratingStorage}
              setIsMigratingStorage={setIsMigratingStorage}
              showToast={showToast}
            />
          )}

          {navSection !== 'api_services' && (
            <div className="flex-1 overflow-y-auto bg-white min-h-0">
              {navSection === 'defaults' && (
                <DefaultsTab
                  customModels={customModels}
                  activeVisionModel={activeVisionModel}
                  setActiveVisionModel={setActiveVisionModel}
                  setActiveAssistantModel={setActiveAssistantModel}
                  setSelectedVisionModel={setSelectedVisionModel}
                  activeImageGenModel={activeImageGenModel}
                  setActiveImageGenModel={setActiveImageGenModel}
                  setSelectedImageGenModel={setSelectedImageGenModel}
                  activeVideoGenModel={activeVideoGenModel}
                  setActiveVideoGenModel={setActiveVideoGenModel}
                  setQuickVideoModel={setQuickVideoModel}
                  notifyModelsUpdated={notifyModelsUpdated}
                  showToast={showToast}
                />
              )}

              {navSection === 'usage' && (
                <UsageTab
                  usageRange={usageRange}
                  setUsageRange={setUsageRange}
                  usageModelSearch={usageModelSearch}
                  setUsageModelSearch={setUsageModelSearch}
                  setUsageRefreshKey={setUsageRefreshKey}
                  usageSummary={usageSummary}
                  showToast={showToast}
                />
              )}

              {navSection === 'local_storage' && (
                <LocalStorageTab showToast={showToast} />
              )}

              {navSection === 'appearance' && <AppearanceTab />}

              {navSection === 'about' && <AboutTab />}
            </div>
          )}
        </div>

        {/* 3. 网关模型库多厂商发现模态窗 (854+) */}
        {isGatewayModalOpen && (
          <GatewayModelModal
            isOpen={isGatewayModalOpen}
            onClose={() => setIsGatewayModalOpen(false)}
            allGatewayModels={allGatewayModels}
            activeModelIds={new Set(customModels.map(m => m.id))}
            isLoading={isFetchingGateway}
            onToggleAddModel={(model) => {
              setCustomModels(prev => {
                const exists = prev.some(m => m.id === model.id);
                let updated;
                if (exists) {
                  updated = prev.filter(m => m.id !== model.id);
                  showToast(`已移出模型 ${model.id}`);
                } else {
                  updated = [...prev, gatewayModelToWorkflowModel(model) as WorkflowModel];
                  showToast(`✨ 已接入模型 ${model.id}`);
                }
                localStorage.setItem('custom_models', JSON.stringify(updated));
                return updated;
              });
              notifyModelsUpdated();
            }}
            onAddAllUsefulModels={() => {
              const useful = allGatewayModels.filter((m: GatewayModelItem) => {
                const caps = inferWorkflowCapabilitiesFromId(m.id);
                return caps.isImage || caps.isVideo || caps.isMultimodal;
              });
              setCustomModels(prev => {
                const existingMap = new Map(prev.map(m => [m.id, m]));
                useful.forEach((m: GatewayModelItem) => {
                  if (!existingMap.has(m.id)) {
                    existingMap.set(m.id, gatewayModelToWorkflowModel(m) as WorkflowModel);
                  }
                });
                const updated = Array.from(existingMap.values());
                localStorage.setItem('custom_models', JSON.stringify(updated));
                return updated;
              });
              notifyModelsUpdated();
              showToast(`🎉 成功接入 ${useful.length} 款核心模型！`);
              setIsGatewayModalOpen(false);
            }}
          />
        )}

        {/* 4. 手动添加自定义模型模态窗 */}
        {isAddingModelModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
            <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">添加自定义大模型</h3>
                <button onClick={() => setIsAddingModelModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">模型 ID (精确对应网关名称)</label>
                  <input
                    type="text"
                    value={newModelId}
                    onChange={e => setNewModelId(e.target.value)}
                    placeholder="如: gpt-image-2-4k, image2-4k, flux-pro, doubao-seedream"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono text-slate-900 outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">显示名称</label>
                  <input
                    type="text"
                    value={newModelName}
                    onChange={e => setNewModelName(e.target.value)}
                    placeholder="如: Claude Opus 5 旗舰推理"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* 能力勾选 */}
                <div className="space-y-1.5 pt-1">
                  <label className="font-bold text-slate-700 block">该模型支持的核心能力</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isVision}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isVision: e.target.checked }))}
                      />
                      <span>👁️ 视觉策划 (Step 2)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isImage}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isImage: e.target.checked }))}
                      />
                      <span>🎨 商业生图 (Step 3)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isVideo}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isVideo: e.target.checked }))}
                      />
                      <span>🎬 视频生成 (首页/视频)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isAssistant}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isAssistant: e.target.checked }))}
                      />
                      <span>💬 AI 助手对话</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isDistill}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isDistill: e.target.checked }))}
                      />
                      <span>🔧 Skill 提炼架构</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isThinking}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isThinking: e.target.checked }))}
                      />
                      <span>💡 深度思考/推理</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsAddingModelModalOpen(false)}
                  className="px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleAddCustomModel}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold transition-colors shadow-xs"
                >
                  确认添加
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
