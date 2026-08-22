'use client';

import {
  X,
  Settings,
  Loader2,
  Zap,
  Eye,
  EyeOff,
  ShoppingBag,
  Sparkles,
  Layers,
  Video,
  Search,
  Plus,
  RefreshCw,
  Database,
  Palette,
  Trash2,
  RotateCcw,
  Bot,
  Activity,
  Link2,
  ExternalLink
} from 'lucide-react';
import { useMemo } from 'react';
import { apiFetch, setClientAccessToken } from '@/lib/apiClient';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { ComflyLogo, OneBoundLogo, ApiaLogo } from '@/shared/ui/BrandIcons';
import { ExternalLinkAnchor } from '@/shared/ui/ExternalLinkAnchor';
import { API_SERVICES, type WorkflowModel } from '../settingsShared';
import { isMultimodalWorkflowModel } from '@/lib/workflowModels';
import { formatUserError } from '@/lib/upstreamErrors';

export interface ApiServicesTabProps {
  selectedServiceId: string;
  setSelectedServiceId: (id: string) => void;
  serviceSearch: string;
  setServiceSearch: (v: string) => void;
  isGatewayEnabled: boolean;
  setIsGatewayEnabled: (v: boolean) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  appAccessToken: string;
  setAppAccessToken: (v: string) => void;
  handleSaveApiConfig: (url: string, key: string) => void;
  handleTestPing: () => void;
  isTesting: boolean;
  handleOpenGatewayDiscovery: () => void;
  isFetchingGateway: boolean;
  allGatewayModels: unknown[];
  customModels: WorkflowModel[];
  modelSearch: string;
  setModelSearch: (v: string) => void;
  modelCapabilityFilter: 'all' | 'multimodal' | 'image' | 'video';
  setModelCapabilityFilter: (v: 'all' | 'multimodal' | 'image' | 'video') => void;
  handleToggleCapability: (modelId: string, field: 'isMultimodal' | 'isImage' | 'isVideo' | 'isVision' | 'isAssistant' | 'isDistill' | 'isThinking') => void;
  handleDeleteModel: (modelId: string) => void;
  handleResetDefaultModels: () => void;
  setIsAddingModelModalOpen: (v: boolean) => void;
  wanbangKey: string;
  setWanbangKey: (v: string) => void;
  wanbangSecret: string;
  setWanbangSecret: (v: string) => void;
  isWanbangEnabled: boolean;
  setIsWanbangEnabled: (v: boolean) => void;
  handleTestWanbang: () => void;
  isTestingWanbang: boolean;
  handleSaveWanbangConfig: () => void;
  scraperId: string;
  setScraperId: (v: string) => void;
  scraperSecret: string;
  setScraperSecret: (v: string) => void;
  handleSaveScraperConfig: () => void;
  isApiaEnabled: boolean;
  setIsApiaEnabled: (v: boolean) => void;
  storageEnabled: boolean;
  setStorageEnabled: (v: boolean) => void;
  storageProvider: 'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase';
  setStorageProvider: (v: 'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase') => void;
  storageAccountId: string;
  setStorageAccountId: (v: string) => void;
  storageEndpoint: string;
  setStorageEndpoint: (v: string) => void;
  storageAccessKeyId: string;
  setStorageAccessKeyId: (v: string) => void;
  storageSecretAccessKey: string;
  setStorageSecretAccessKey: (v: string) => void;
  showStorageSecret: boolean;
  setShowStorageSecret: (v: boolean) => void;
  storageBucketName: string;
  setStorageBucketName: (v: string) => void;
  storagePublicDomain: string;
  setStoragePublicDomain: (v: string) => void;
  isTestingStorage: boolean;
  setIsTestingStorage: (v: boolean) => void;
  isMigratingStorage: boolean;
  setIsMigratingStorage: (v: boolean) => void;
  handleSaveStorageConfig: () => void;
  showToast: (msg: string) => void;
}

export default function ApiServicesTab({
  selectedServiceId,
  setSelectedServiceId,
  serviceSearch,
  setServiceSearch,
  isGatewayEnabled,
  setIsGatewayEnabled,
  apiKey,
  setApiKey,
  baseUrl,
  setBaseUrl,
  showKey,
  setShowKey,
  appAccessToken,
  setAppAccessToken,
  handleSaveApiConfig,
  handleTestPing,
  isTesting,
  handleOpenGatewayDiscovery,
  isFetchingGateway,
  allGatewayModels,
  customModels,
  modelSearch,
  setModelSearch,
  modelCapabilityFilter,
  setModelCapabilityFilter,
  handleToggleCapability,
  handleDeleteModel,
  handleResetDefaultModels,
  setIsAddingModelModalOpen,
  wanbangKey,
  setWanbangKey,
  wanbangSecret,
  setWanbangSecret,
  isWanbangEnabled,
  setIsWanbangEnabled,
  handleTestWanbang,
  isTestingWanbang,
  handleSaveWanbangConfig,
  scraperId,
  setScraperId,
  scraperSecret,
  setScraperSecret,
  handleSaveScraperConfig,
  isApiaEnabled,
  setIsApiaEnabled,
  storageEnabled,
  setStorageEnabled,
  storageProvider,
  setStorageProvider,
  storageAccountId,
  setStorageAccountId,
  storageEndpoint,
  setStorageEndpoint,
  storageAccessKeyId,
  setStorageAccessKeyId,
  storageSecretAccessKey,
  setStorageSecretAccessKey,
  showStorageSecret,
  setShowStorageSecret,
  storageBucketName,
  setStorageBucketName,
  storagePublicDomain,
  setStoragePublicDomain,
  isTestingStorage,
  setIsTestingStorage,
  isMigratingStorage,
  setIsMigratingStorage,
  handleSaveStorageConfig,
  showToast,
}: ApiServicesTabProps) {
  const filteredServices = useMemo(() => {
    const q = serviceSearch.toLowerCase().trim();
    if (!q) return API_SERVICES;
    return API_SERVICES.filter(s => {
      const matchName = s.name.toLowerCase().includes(q);
      const matchSub = s.subTitle.toLowerCase().includes(q);
      const matchTag = (s.tag || '').toLowerCase().includes(q);
      return matchName || matchSub || matchTag;
    });
  }, [serviceSearch]);

  const filteredModels = useMemo(() => {
    let list = customModels;
    if (modelCapabilityFilter === 'video') {
      list = list.filter(m => m.isVideo);
    } else if (modelCapabilityFilter === 'image') {
      list = list.filter(m => m.isImage);
    } else if (modelCapabilityFilter === 'multimodal') {
      list = list.filter(isMultimodalWorkflowModel);
    }

    if (!modelSearch.trim()) return list;
    const q = modelSearch.toLowerCase().trim();
    return list.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q)
    );
  }, [customModels, modelSearch, modelCapabilityFilter]);

  return (
    <>
      {/* Middle service list column — 窄屏隐藏，改由详情区顶部下拉选择 */}
            <div className="hidden lg:flex w-72 xl:w-80 border-r border-slate-100 bg-white p-3.5 flex-col flex-shrink-0 min-h-0">
              {/* 搜索框 */}
              <div className="relative mb-2.5">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={e => setServiceSearch(e.target.value)}
                  placeholder="搜索接口服务..."
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#F3F4F6] text-sm text-slate-800 placeholder-slate-400 outline-none border border-transparent focus:border-slate-300 focus:bg-white transition-all shadow-2xs"
                />
              </div>

              {/* 真实接口列表 */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 no-scrollbar">
                {filteredServices.map(service => {
                  const isSelected = selectedServiceId === service.id;
                  return (
                    <div
                      key={service.id}
                      onClick={() => setSelectedServiceId(service.id)}
                      className={`px-3.5 py-3 rounded-xl flex items-center justify-between transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-[#EAEAEA] text-slate-900 font-bold shadow-2xs' 
                          : 'text-slate-700 hover:bg-[#F3F4F6]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-2xs p-0.5 border border-slate-100">
                          {service.renderLogo("w-5 h-5")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] truncate font-bold text-slate-900">
                            {service.name.split(' ')[0]}
                          </div>
                          <div className="text-xs text-slate-500 font-normal truncate mt-0.5">
                            {service.subTitle}
                          </div>
                        </div>
                      </div>

                      {/* 在线指示灯 */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${service.isEnabled ? 'bg-[#22C55E]' : 'bg-slate-300'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 底部 */}
              <div className="pt-3 border-t border-slate-100 text-xs text-slate-400 text-center font-mono">
                共配置 {API_SERVICES.length} 项核心业务服务与接口
              </div>
            </div>
      {/* Right detail panel */}
      <div className="flex-1 overflow-y-auto bg-white min-h-0 min-w-0">
              <div className="p-6 sm:p-8 space-y-6 max-w-4xl">
                {/* 窄屏：服务切换下拉 */}
                <div className="lg:hidden">
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">接口服务</label>
                  <select
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 font-medium outline-none cursor-pointer"
                  >
                    {API_SERVICES.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name.split(' ')[0]} — {service.subTitle}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* 1. 🌟 Comfly AI 大模型网关接口 */}
                {selectedServiceId === 'comfly_gateway' && (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 flex-wrap gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <ComflyLogo className="w-9 h-9 rounded-xl shadow-2xs flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                              Comfly AI 智能大模型网关
                            </h2>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold font-mono">
                              🟢 正常运行 (已连接)
                            </span>
                            <ExternalLinkAnchor
                              href="https://ai.comfly.org"
                              className="px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-bold flex items-center gap-1 transition-all shadow-2xs group"
                              title="在新窗口打开 Comfly 官网注册账号并获取 API Key"
                            >
                              <span>官网注册 / 申请 Key</span>
                              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </ExternalLinkAnchor>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            负责驱动全系统视觉分析 (Step 2)、商业生图 (Step 3)、AI 助手对话与 Skill 提炼
                          </p>
                        </div>
                      </div>

                      {/* 绿色大开关 */}
                      <div 
                        onClick={() => setIsGatewayEnabled(!isGatewayEnabled)}
                        className={`w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner flex-shrink-0 ${
                          isGatewayEnabled ? 'bg-[#22C55E]' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-5.5 h-5.5 rounded-full bg-white shadow-xs transition-transform ${
                          isGatewayEnabled ? 'translate-x-5.5' : 'translate-x-0'
                        }`} />
                      </div>
                    </div>

                    {/* API 密钥 */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-slate-800 block">网关 API 密钥 (API Key)</label>
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex-1">
                          <input
                            type={showKey ? "text" : "password"}
                            value={apiKey}
                            onChange={e => {
                              setApiKey(e.target.value);
                              handleSaveApiConfig(baseUrl, e.target.value);
                            }}
                            placeholder="sk-..."
                            className="w-full px-4 py-2.5 pr-10 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-all shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* 测速 Ping 按钮 */}
                        <button
                          onClick={handleTestPing}
                          disabled={isTesting}
                          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs"
                          title="测试连接延迟 (Ping)"
                        >
                          {isTesting ? <Loader2 className="w-4 h-4 animate-spin text-slate-600" /> : <Activity className="w-4 h-4" />}
                          <span>测速 Ping</span>
                        </button>
                      </div>
                    </div>

                    {/* 本地访问令牌（局域网/穿透鉴权） */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-slate-800 block">本地访问令牌 (x-app-token)</label>
                      <input
                        type="text"
                        value={appAccessToken}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAppAccessToken(v);
                          setClientAccessToken(v);
                        }}
                        placeholder="azhuo-local-dev"
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-all shadow-2xs"
                      />
                      <p className="text-[11px] text-slate-500">
                        须与服务端 LOCAL_ACCESS_TOKEN 一致。生产环境必须设置该环境变量（禁止使用开发默认口令）。局域网/穿透时请更换强口令。
                      </p>
                    </div>

                    {/* API 地址 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="text-sm font-bold text-slate-800">网关 API 接口地址 (Base URL)</label>
                        <button 
                          onClick={() => {
                            const newUrl = prompt('请输入自定义端点 URL:', baseUrl);
                            if (newUrl) {
                              setBaseUrl(newUrl.trim());
                              handleSaveApiConfig(newUrl.trim(), apiKey);
                            }
                          }}
                          className="text-xs text-blue-600 hover:underline cursor-pointer font-semibold"
                        >
                          + 添加自定义端点
                        </button>
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={baseUrl}
                          onChange={e => {
                            setBaseUrl(e.target.value);
                            handleSaveApiConfig(e.target.value, apiKey);
                          }}
                          placeholder="https://ai.comfly.org"
                          className="w-full px-4 py-2.5 pr-10 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-all shadow-2xs"
                        />
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                          <button
                            type="button"
                            onClick={() => {
                              const newUrl = prompt('修改网关端点 URL:', baseUrl);
                              if (newUrl) {
                                setBaseUrl(newUrl.trim());
                                handleSaveApiConfig(newUrl.trim(), apiKey);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="设置自定义端点"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 模型工作流列表 */}
                    <div className="space-y-3.5 pt-2">
                      <div className="flex items-center justify-between flex-wrap gap-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm sm:text-base font-bold text-slate-800">该网关已启用的工作流模型</span>
                          <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                            {filteredModels.length} 款
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleResetDefaultModels}
                            className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            title="恢复系统出厂预设模型列表"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span className="hidden sm:inline">恢复预设</span>
                          </button>

                          <button
                            onClick={handleOpenGatewayDiscovery}
                            disabled={isFetchingGateway}
                            className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                          >
                            <RefreshCw className={`w-4 h-4 text-indigo-600 ${isFetchingGateway ? 'animate-spin' : ''}`} />
                            <span>获取网关模型库 ({allGatewayModels.length || '854+'})</span>
                          </button>

                          <button
                            onClick={() => setIsAddingModelModalOpen(true)}
                            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>添加模型</span>
                          </button>
                        </div>
                      </div>

                      {/* 🌟 分类药丸与搜索过滤条 (高端 Apple / Linear 分段控制风格) */}
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 border border-slate-200/60 rounded-2xl text-xs sm:text-sm select-none overflow-x-auto">
                          {/* 全部模型 */}
                          <button
                            type="button"
                            onClick={() => setModelCapabilityFilter('all')}
                            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              modelCapabilityFilter === 'all'
                                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5 text-slate-500" />
                            <span>全部</span>
                            <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                              modelCapabilityFilter === 'all' ? 'bg-slate-900 text-white font-bold' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {customModels.length}
                            </span>
                          </button>

                          {/* 多模态 */}
                          <button
                            type="button"
                            onClick={() => setModelCapabilityFilter('multimodal')}
                            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              modelCapabilityFilter === 'multimodal'
                                ? 'bg-white text-indigo-600 shadow-2xs border border-indigo-200'
                                : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/60'
                            }`}
                          >
                            <Bot className="w-3.5 h-3.5 text-indigo-500" />
                            <span>多模态</span>
                            <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                              modelCapabilityFilter === 'multimodal' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {customModels.filter(isMultimodalWorkflowModel).length}
                            </span>
                          </button>

                          {/* 商业生图 */}
                          <button
                            type="button"
                            onClick={() => setModelCapabilityFilter('image')}
                            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              modelCapabilityFilter === 'image'
                                ? 'bg-white text-amber-600 shadow-2xs border border-amber-200'
                                : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50/60'
                            }`}
                          >
                            <Palette className="w-3.5 h-3.5 text-amber-500" />
                            <span>生图</span>
                            <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                              modelCapabilityFilter === 'image' ? 'bg-amber-500 text-white font-bold' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {customModels.filter(m => m.isImage).length}
                            </span>
                          </button>

                          {/* 视频生成 */}
                          <button
                            type="button"
                            onClick={() => setModelCapabilityFilter('video')}
                            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              modelCapabilityFilter === 'video'
                                ? 'bg-white text-sky-600 shadow-2xs border border-sky-200'
                                : 'text-slate-500 hover:text-sky-600 hover:bg-sky-50/60'
                            }`}
                          >
                            <Video className="w-3.5 h-3.5 text-sky-500" />
                            <span>视频</span>
                            <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                              modelCapabilityFilter === 'video' ? 'bg-sky-500 text-white font-bold' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {customModels.filter(m => m.isVideo).length}
                            </span>
                          </button>
                        </div>

                        {/* 搜索框 */}
                        <div className="relative min-w-[200px] sm:min-w-[240px]">
                          <input
                            type="text"
                            value={modelSearch}
                            onChange={e => setModelSearch(e.target.value)}
                            placeholder="搜索模型 ID / 名称..."
                            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl bg-slate-50 border border-slate-200/80 text-slate-800 outline-none focus:bg-white focus:border-slate-400 shadow-2xs transition-all placeholder-slate-400"
                          />
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          {modelSearch && (
                            <button 
                              onClick={() => setModelSearch('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 模型列表 */}
                      <div className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
                        <div className="px-5 py-3 bg-[#F9FAFB] border-b border-slate-200 flex items-center justify-between text-sm text-slate-600 font-mono">
                          <span className="font-bold text-slate-800">工作流模型清单 ({filteredModels.length})</span>
                          <span className="text-xs text-slate-400 font-normal">点击彩色药丸开关各功能权限 (多模态 / 生图 / 视频)</span>
                        </div>

                        <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                          {filteredModels.length === 0 ? (
                            <div className="px-5 py-10 text-center space-y-2">
                              <p className="text-sm font-semibold text-slate-700">暂无工作流模型</p>
                              <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                                请点击上方「获取网关模型库」，从您的 API 网关拉取并勾选需要的模型；未从网关接入的模型不会自动显示。
                              </p>
                            </div>
                          ) : filteredModels.map(m => (
                            <div
                              key={m.id}
                              className="px-5 py-3.5 hover:bg-[#F9FAFB] transition-colors flex items-center justify-between gap-4 group"
                            >
                              {/* 左侧：模型标识与名称 */}
                              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center flex-shrink-0 shadow-2xs">
                                  {getModelIcon(m.id, "w-5.5 h-5.5")}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-slate-900 font-bold text-sm truncate">
                                      {m.id}
                                    </span>
                                    {m.name && m.name !== m.id && (
                                      <span className="text-xs text-slate-500 truncate font-normal">
                                        ({m.name})
                                      </span>
                                    )}
                                    {m.badge && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                                        {m.badge}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 右侧：3 种核心能力开关药丸与操作 */}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleCapability(m.id, 'isMultimodal')}
                                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border select-none ${
                                    isMultimodalWorkflowModel(m)
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-2xs font-bold' 
                                      : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-100 hover:text-slate-600 hover:border-slate-200'
                                  }`}
                                  title="多模态大模型 (涵盖视觉审图、逆向提炼、分镜策划与AI对话)"
                                >
                                  <Bot className={`w-3.5 h-3.5 ${isMultimodalWorkflowModel(m) ? 'text-indigo-600' : 'text-slate-300'}`} />
                                  <span>多模态</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleCapability(m.id, 'isImage')}
                                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border select-none ${
                                    m.isImage 
                                      ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-2xs font-bold' 
                                      : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-100 hover:text-slate-600 hover:border-slate-200'
                                  }`}
                                  title="商业生图能力 (Step 3 绘图)"
                                >
                                  <Palette className={`w-3.5 h-3.5 ${m.isImage ? 'text-amber-600' : 'text-slate-300'}`} />
                                  <span>生图</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleCapability(m.id, 'isVideo')}
                                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border select-none ${
                                    m.isVideo 
                                      ? 'bg-sky-50 text-sky-700 border-sky-300 shadow-2xs font-bold' 
                                      : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-100 hover:text-slate-600 hover:border-slate-200'
                                  }`}
                                  title="视频生成能力 (首页/即梦视频)"
                                >
                                  <Video className={`w-3.5 h-3.5 ${m.isVideo ? 'text-sky-600' : 'text-slate-300'}`} />
                                  <span>视频</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteModel(m.id)}
                                  className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors ml-1 cursor-pointer"
                                  title="移出此模型"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* 2. 🛒 ONEBOUND 万邦电商数据采集接口 */}
                {selectedServiceId === 'wanbang_ecommerce' && (
                  <>
                    <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 flex-wrap gap-3">
                      <div className="flex items-center gap-3.5">
                        <OneBoundLogo className="w-9 h-9 rounded-xl shadow-2xs flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                              ONEBOUND 万邦电商全网数据采集接口
                            </h2>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold font-mono">
                              🟢 已配置
                            </span>
                            <ExternalLinkAnchor
                              href="https://open.onebound.cn"
                              className="px-2.5 py-1 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 text-xs font-bold flex items-center gap-1 transition-all shadow-2xs group"
                              title="前往万邦开放平台注册账号并申请 API Key"
                            >
                              <span>前往万邦注册 / 获取 Key</span>
                              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </ExternalLinkAnchor>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            支持从淘宝、天猫、京东、拼多多、1688 全网一键抓取商品高清主图与商品参数
                          </p>
                        </div>
                      </div>

                      <div 
                        onClick={() => setIsWanbangEnabled(!isWanbangEnabled)}
                        className={`w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner flex-shrink-0 ${
                          isWanbangEnabled ? 'bg-[#22C55E]' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-5.5 h-5.5 rounded-full bg-white shadow-xs transition-transform ${
                          isWanbangEnabled ? 'translate-x-5.5' : 'translate-x-0'
                        }`} />
                      </div>
                    </div>

                    <div className="space-y-4 pt-2 text-sm">
                      <div>
                        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                          <label className="font-bold text-slate-700 block">万邦 API Key (调用接口凭证)</label>
                        </div>
                        <input
                          type="text"
                          value={wanbangKey}
                          onChange={e => setWanbangKey(e.target.value)}
                          placeholder="填入万邦开放平台 API Key"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">万邦 API Secret</label>
                        <input
                          type="password"
                          value={wanbangSecret}
                          onChange={e => setWanbangSecret(e.target.value)}
                          placeholder="填入万邦开放平台 API Secret"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      <div className="p-4.5 rounded-2xl bg-amber-50/50 border border-amber-200/60 text-amber-800 space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5 text-sm">
                          <ShoppingBag className="w-4 h-4 text-amber-600" />
                          <span>全网商品采集触发场景</span>
                        </div>
                        <p className="text-xs sm:text-sm text-amber-700 leading-relaxed">
                          在系统首页直接粘贴电商商品链接（如 item.jd.com 或 detail.tmall.com），系统将自动调用万邦接口批量下载无水印主图并导入 Step 1。
                        </p>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={handleSaveWanbangConfig}
                          className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors cursor-pointer shadow-xs"
                        >
                          保存万邦接口配置
                        </button>
                        <button
                          onClick={handleTestWanbang}
                          disabled={isTestingWanbang}
                          className="px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 font-bold text-sm transition-colors cursor-pointer flex items-center gap-2 shadow-2xs"
                        >
                          {isTestingWanbang ? <Loader2 className="w-4 h-4 animate-spin text-amber-600" /> : <Zap className="w-4 h-4 text-amber-600" />}
                          <span>{isTestingWanbang ? '正在诊断连通性...' : '⚡ 测试接口连通性'}</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* 3. 🌟 APIA 第三方短视频/图集解析接口 (apia.vip) */}
                {selectedServiceId === 'apia_parser' && (
                  <>
                    <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 flex-wrap gap-3">
                      <div className="flex items-center gap-3.5">
                        <ApiaLogo className="w-9 h-9 rounded-xl shadow-2xs flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                              APIA 第三方短视频/图集解析接口 (apia.vip)
                            </h2>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold font-mono">
                              🟢 运行中
                            </span>
                            <ExternalLinkAnchor
                              href="https://apia.vip"
                              className="px-2.5 py-1 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/80 text-xs font-bold flex items-center gap-1 transition-all shadow-2xs group"
                              title="前往 APIA 官网注册账号获取 Client ID 与 Secret"
                            >
                              <span>前往 APIA 官网注册 ↗</span>
                              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </ExternalLinkAnchor>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            支持小红书、抖音、快手等全网爆款买家秀图集与视频分镜一键无水印提取
                          </p>
                        </div>
                      </div>

                      <div 
                        onClick={() => setIsApiaEnabled(!isApiaEnabled)}
                        className={`w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner flex-shrink-0 ${
                          isApiaEnabled ? 'bg-[#22C55E]' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-5.5 h-5.5 rounded-full bg-white shadow-xs transition-transform ${
                          isApiaEnabled ? 'translate-x-5.5' : 'translate-x-0'
                        }`} />
                      </div>
                    </div>

                    <div className="space-y-4 pt-2 text-sm">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">APIA 接口端点地址</label>
                        <input
                          type="text"
                          value="https://apia.vip"
                          disabled
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm font-mono text-slate-600 outline-none shadow-2xs cursor-not-allowed"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">APIA Client ID (客户编号)</label>
                        <input
                          type="text"
                          value={scraperId}
                          onChange={e => {
                            setScraperId(e.target.value);
                            localStorage.setItem('external_scraper_id', e.target.value);
                          }}
                          placeholder="202037331"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">APIA Secret Key (接口密钥)</label>
                        <input
                          type="password"
                          value={scraperSecret}
                          onChange={e => setScraperSecret(e.target.value)}
                          placeholder="请输入外站抓取 Secret"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      <div className="p-4.5 rounded-2xl bg-indigo-50/50 border border-indigo-200/60 text-indigo-800 space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5 text-sm">
                          <Link2 className="w-4 h-4 text-indigo-600" />
                          <span>支持的社媒链接类型</span>
                        </div>
                        <p className="text-xs sm:text-sm text-indigo-700 leading-relaxed">
                          • 小红书分享短链 (xhslink.com) 与 PC 端笔记链接 (xiaohongshu.com/discovery/item/...)<br />
                          • 抖音短视频与图文图集分享链接 (v.douyin.com)<br />
                          • 快手作品分享链接 (v.kuaishou.com)
                        </p>
                      </div>

                      <button
                        onClick={handleSaveScraperConfig}
                        className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors cursor-pointer shadow-xs"
                      >
                        保存 APIA 接口配置
                      </button>
                    </div>
                  </>
                )}

                {/* 4. 🌟 云端永久对象存储配置 (Cloudflare R2 / OSS / COS / S3) */}
                {selectedServiceId === 'cloud_storage' && (
                  <>
                    <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 flex-wrap gap-3">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
                          <Database className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                              云端永久对象存储配置 (Cloudflare R2 / OSS / S3)
                            </h2>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono border ${
                              storageEnabled 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                              {storageEnabled ? '🟢 自动转存已开启' : '⚪ 未启用'}
                            </span>
                            <ExternalLinkAnchor
                              href="https://dash.cloudflare.com/sign-up"
                              className="px-2.5 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/80 text-xs font-bold flex items-center gap-1 transition-all shadow-2xs group"
                              title="前往 Cloudflare 官网免费开通 R2 存储空间 (每月 10GB 免费)"
                            >
                              <span>前往 Cloudflare 免费开通 ↗</span>
                              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </ExternalLinkAnchor>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            自动将生图与生视频任务的短期临时链接流式转存为您专属的永久 CDN 链接，0 本地硬盘占用
                          </p>
                        </div>
                      </div>

                      <div 
                        onClick={() => {
                          const nextVal = !storageEnabled;
                          setStorageEnabled(nextVal);
                          localStorage.setItem('storage_enabled', String(nextVal));
                          showToast(nextVal ? '🟢 已开启媒体自动转存' : '⚪ 已关闭自动转存');
                        }}
                        className={`w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner flex-shrink-0 ${
                          storageEnabled ? 'bg-[#22C55E]' : 'bg-slate-300'
                        }`}
                        title={storageEnabled ? '点击关闭自动转存' : '点击开启自动转存'}
                      >
                        <div className={`w-5.5 h-5.5 rounded-full bg-white shadow-xs transition-transform ${
                          storageEnabled ? 'translate-x-5.5' : 'translate-x-0'
                        }`} />
                      </div>
                    </div>

                    <div className="space-y-4 pt-2 text-sm">
                      {/* 存储服务提供商切换 */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-2">存储服务商 (Provider)</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { id: 'r2', name: 'Cloudflare R2', badge: '首选·免费10G' },
                            { id: 'oss', name: '阿里云 OSS', badge: '国内极速' },
                            { id: 'cos', name: '腾讯云 COS', badge: '腾讯云' },
                            { id: 's3', name: '通用 S3 / MinIO', badge: 'S3 兼容' }
                          ].map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setStorageProvider(p.id as any);
                                localStorage.setItem('storage_provider', p.id);
                              }}
                              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                storageProvider === p.id 
                                  ? 'bg-indigo-50/60 border-indigo-300 text-indigo-900 shadow-2xs' 
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="font-bold text-xs">{p.name}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{p.badge}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* R2 Account ID 或 S3 Endpoint */}
                      {storageProvider === 'r2' ? (
                        <div>
                          <label className="font-bold text-slate-700 block mb-1.5">
                            Cloudflare 账户 ID (Account ID)
                          </label>
                          <input
                            type="text"
                            value={storageAccountId}
                            onChange={e => {
                              setStorageAccountId(e.target.value);
                              localStorage.setItem('storage_account_id', e.target.value);
                            }}
                            placeholder="如: 7d6c8b9a0e1f2a3b4c5d6e7f8a9b0c1d"
                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                          />
                          <p className="text-[11px] text-slate-400 mt-1">可在 Cloudflare 控制台 R2 概览页右侧「账户详细信息」中复制</p>
                        </div>
                      ) : (
                        <div>
                          <label className="font-bold text-slate-700 block mb-1.5">
                            对象存储 Endpoint (端点 URL)
                          </label>
                          <input
                            type="text"
                            value={storageEndpoint}
                            onChange={e => {
                              setStorageEndpoint(e.target.value);
                              localStorage.setItem('storage_endpoint', e.target.value);
                            }}
                            placeholder={storageProvider === 'oss' ? 'https://oss-cn-hangzhou.aliyuncs.com' : storageProvider === 'cos' ? 'https://cos.ap-guangzhou.myqcloud.com' : 'https://s3.us-east-1.amazonaws.com'}
                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                          />
                        </div>
                      )}

                      {/* 存储桶名称 */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">存储桶名称 (Bucket Name)</label>
                        <input
                          type="text"
                          value={storageBucketName}
                          onChange={e => {
                            setStorageBucketName(e.target.value);
                            localStorage.setItem('storage_bucket_name', e.target.value);
                          }}
                          placeholder="例如: beikeyuntu-assets"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      {/* Access Key ID */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">
                          访问密钥 ID
                          <span className="ml-1.5 text-[10px] font-normal text-slate-400">Access Key ID</span>
                        </label>
                        <input
                          type="text"
                          value={storageAccessKeyId}
                          onChange={e => {
                            setStorageAccessKeyId(e.target.value);
                            localStorage.setItem('storage_access_key_id', e.target.value);
                          }}
                          placeholder="填写您的 S3 / R2 API Access Key"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      {/* Secret Access Key */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">
                          秘密访问密钥
                          <span className="ml-1.5 text-[10px] font-normal text-slate-400">Secret Access Key</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showStorageSecret ? "text" : "password"}
                            value={storageSecretAccessKey}
                            onChange={e => setStorageSecretAccessKey(e.target.value)}
                            placeholder="填写您的 S3 / R2 API Secret Key"
                            className="w-full pl-4 pr-11 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowStorageSecret(!showStorageSecret)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showStorageSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* 公开访问域名 (Public Domain) */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">公开访问域名 (Public Domain / CDN)</label>
                        <input
                          type="text"
                          value={storagePublicDomain}
                          onChange={e => {
                            setStoragePublicDomain(e.target.value);
                            localStorage.setItem('storage_public_domain', e.target.value);
                          }}
                          placeholder="例如: https://pub-xxx.r2.dev 或 https://cdn.yourdomain.com"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          在 R2 存储桶「设置 ➔ 公开访问」中开启并获取，用于在前端快速加载图片与视频
                        </p>
                      </div>

                      {/* 提示与优势说明 */}
                      <div className="p-4.5 rounded-2xl bg-indigo-50/50 border border-indigo-200/60 text-indigo-800 space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5 text-sm">
                          <Sparkles className="w-4 h-4 text-indigo-600" />
                          <span>为什么推荐 Cloudflare R2？</span>
                        </div>
                        <p className="text-xs sm:text-sm text-indigo-700 leading-relaxed">
                          • 每月提供 <b>10GB 永久免费存储空间</b>，支持存储数万张 2K 图片与数千个高清短视频；<br />
                          • <b>永远 0 出网流量费（Egress Free）</b>，全球极速 CDN 加速，绝不占用本地电脑硬盘；<br />
                          • 开启后，AI 生成的图片/视频将由服务端在后台自动转存为永久 URL，旧链接永久有效。
                        </p>
                      </div>

                      {/* 操作按钮组 */}
                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                          type="button"
                          disabled={isTestingStorage}
                          onClick={async () => {
                            setIsTestingStorage(true);
                            try {
                              const res = await apiFetch('/api/assets/storage/test', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  config: {
                                    enabled: storageEnabled,
                                    provider: storageProvider,
                                    accountId: storageAccountId,
                                    endpoint: storageEndpoint,
                                    accessKeyId: storageAccessKeyId,
                                    secretAccessKey: storageSecretAccessKey,
                                    bucketName: storageBucketName,
                                    publicDomain: storagePublicDomain
                                  }
                                })
                              });
                              const data = await res.json();
                              if (data.success) {
                                showToast('🟢 ' + (data.message || '存储桶连接成功！'));
                              } else {
                                showToast('🔴 ' + (data.message || '存储桶连接失败'));
                              }
                            } catch (e: any) {
                              showToast('🔴 测试异常: ' + formatUserError(e));
                            } finally {
                              setIsTestingStorage(false);
                            }
                          }}
                          className="px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          {isTestingStorage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          <span>测试存储连接</span>
                        </button>

                        <button
                          type="button"
                          disabled={isMigratingStorage}
                          onClick={async () => {
                            if (!storageAccessKeyId.trim() || !storageBucketName.trim()) {
                              showToast('⚠️ 请先填写 Access Key 与 存储桶名称');
                              return;
                            }
                            setIsMigratingStorage(true);
                            try {
                              const res = await apiFetch('/api/assets/storage/migrate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  config: {
                                    enabled: true,
                                    provider: storageProvider,
                                    accountId: storageAccountId,
                                    endpoint: storageEndpoint,
                                    accessKeyId: storageAccessKeyId,
                                    secretAccessKey: storageSecretAccessKey,
                                    bucketName: storageBucketName,
                                    publicDomain: storagePublicDomain
                                  }
                                })
                              });
                              const data = await res.json();
                              if (data.success) {
                                showToast('🎉 ' + data.message);
                              } else {
                                showToast('🔴 迁移失败: ' + (data.error || '执行异常'));
                              }
                            } catch (e: any) {
                              showToast('🔴 迁移异常: ' + formatUserError(e));
                            } finally {
                              setIsMigratingStorage(false);
                            }
                          }}
                          className="px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          {isMigratingStorage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          <span>一键批量迁移历史临时链接</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSaveStorageConfig}
                          className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs ml-auto"
                        >
                          保存存储配置
                        </button>
                      </div>
                    </div>
                  </>
                )}

              </div>
      </div>
    </>
  );
}
