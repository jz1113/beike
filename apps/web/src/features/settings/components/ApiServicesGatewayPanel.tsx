import {
  Settings,
  Loader2,
  Eye,
  EyeOff,
  Layers,
  Video,
  Search,
  Plus,
  RefreshCw,
  Palette,
  RotateCcw,
  Bot,
  Activity,
  X,
  ExternalLink,
  Info,
} from 'lucide-react';
import { ComflyLogo } from '@/shared/icons';
import { ExternalLinkAnchor } from '@/shared/ui/ExternalLinkAnchor';
import { isMultimodalWorkflowModel, workflowModelRouteId } from '@beike/domain/workflowModels';
import { APPROVED_MODELS } from '@beike/domain/modelCatalog';
import WorkflowModelRow from '../WorkflowModelRow';
import type { WorkflowModel } from '../settingsShared';
import type { ComflyPriceMap } from '../multimodalPriceSort';

export interface ApiServicesGatewayPanelProps {
  isGatewayEnabled: boolean;
  setIsGatewayEnabled: (v: boolean) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  handleSaveApiConfig: (url: string, key: string, notify?: boolean) => void;
  handleTestPing: () => void;
  isTesting: boolean;
  filteredModels: WorkflowModel[];
  customModels: WorkflowModel[];
  modelSearch: string;
  setModelSearch: (v: string) => void;
  modelCapabilityFilter: 'all' | 'multimodal' | 'image' | 'video';
  setModelCapabilityFilter: (v: 'all' | 'multimodal' | 'image' | 'video') => void;
  handleToggleCapability: (
    modelId: string,
    field: 'isMultimodal' | 'isImage' | 'isVideo' | 'isVision' | 'isAssistant' | 'isDistill' | 'isThinking',
  ) => void;
  handleDeleteModel: (modelId: string) => void;
  handleMoveModel?: (modelId: string, direction: 'up' | 'down' | 'top') => void;
  handleResetDefaultModels: () => void;
  comflyPrices: ComflyPriceMap | null;
  isFetchingPrices: boolean;
  handleSortByComflyPrice: () => void;
  handleOpenGatewayDiscovery: () => void;
  isFetchingGateway: boolean;
  allGatewayModels: unknown[];
  setIsAddingModelModalOpen: (v: boolean) => void;
  draggedModelId: string | null;
  dragOverModelId: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
}

export function ApiServicesGatewayPanel({
  isGatewayEnabled,
  setIsGatewayEnabled,
  apiKey,
  setApiKey,
  baseUrl,
  setBaseUrl,
  showKey,
  setShowKey,
  handleSaveApiConfig,
  handleTestPing,
  isTesting,
  filteredModels,
  customModels,
  modelSearch,
  setModelSearch,
  modelCapabilityFilter,
  setModelCapabilityFilter,
  handleToggleCapability,
  handleDeleteModel,
  handleMoveModel,
  handleResetDefaultModels,
  comflyPrices,
  isFetchingPrices,
  handleSortByComflyPrice,
  handleOpenGatewayDiscovery,
  isFetchingGateway,
  allGatewayModels,
  setIsAddingModelModalOpen,
  draggedModelId,
  dragOverModelId,
  onDragStart,
  onDragOver,
  onDrop,
}: ApiServicesGatewayPanelProps) {
  const onMoveModel = handleMoveModel ?? (() => {});

  return (
    <div className="space-y-4">
      {/* 🌟 1. 网关概览与接口凭证一体化卡片 */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs p-4 sm:p-5 space-y-4">
        {/* 卡片头部：Logo + 标题 + 状态徽章 + 官网申请链接 + 开关 */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shadow-2xs shrink-0 mt-0.5">
              <ComflyLogo className="w-6 h-6 rounded-lg" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                  Comfly AI 智能大模型网关
                </h2>
                <ExternalLinkAnchor
                  href="https://ai.comfly.org"
                  className="px-2.5 py-0.5 rounded-full bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 text-[11px] font-bold flex items-center gap-1 transition-all shadow-2xs group"
                  title="在新窗口打开 Comfly 官网注册账号并获取 API Key"
                >
                  <span>官网申请 Key</span>
                  <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </ExternalLinkAnchor>
              </div>
              <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">
                负责驱动全系统视觉分析 (Step 2)、商业生图 (Step 3)、AI 助手对话与 Skill 提炼
              </p>
            </div>
          </div>

          {/* iOS 风格平滑微拟态开关 */}
          <div 
            onClick={() => setIsGatewayEnabled(!isGatewayEnabled)}
            className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner shrink-0 ${
              isGatewayEnabled ? 'bg-emerald-500' : 'bg-slate-200 hover:bg-slate-300'
            }`}
            title={isGatewayEnabled ? "点击停用网关" : "点击启用网关"}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-out ${
              isGatewayEnabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </div>
        </div>

        {/* 凭证表单网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* API 接口地址 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">网关 API 接口地址 (Base URL)</label>
              <button 
                onClick={() => {
                  const newUrl = prompt('请输入自定义端点 URL:', baseUrl);
                  if (newUrl) {
                    setBaseUrl(newUrl.trim());
                    handleSaveApiConfig(newUrl.trim(), apiKey);
                  }
                }}
                className="text-[11px] text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer font-medium"
              >
                + 自定义端点
              </button>
            </div>
            <div className="relative flex items-center">
              <input
                type="text"
                value={baseUrl}
                onChange={e => {
                  const val = e.target.value;
                  setBaseUrl(val);
                  handleSaveApiConfig(val, apiKey);
                }}
                placeholder="https://ai.comfly.org"
                className="w-full h-9 px-3.5 pr-8 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200/80 text-xs font-mono text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-2xs placeholder-slate-400"
              />
              <button
                type="button"
                onClick={() => {
                  const newUrl = prompt('修改网关端点 URL:', baseUrl);
                  if (newUrl) {
                    setBaseUrl(newUrl.trim());
                    handleSaveApiConfig(newUrl.trim(), apiKey);
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                title="设置自定义端点"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* API 密钥 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">网关 API 密钥 (API Key)</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={e => {
                    const val = e.target.value;
                    setApiKey(val);
                    handleSaveApiConfig(baseUrl, val);
                  }}
                  placeholder="sk-..."
                  className="w-full h-9 px-3.5 pr-8 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200/80 text-xs font-mono text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-2xs placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={showKey ? "隐藏密钥" : "显示密钥"}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>


            </div>
          </div>
        </div>

        {/* 底部保存与即时生效工具栏 */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${apiKey.trim() ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-amber-400'}`} />
            <span>{apiKey.trim() ? '已加密同步至本地安全凭证中心' : '输入即刻自动保存，已同步到安全凭证中心'}</span>
          </div>

          <div className="flex items-center gap-2">
              {/* 测速 Ping 按钮 */}
              <button
                type="button"
                onClick={handleTestPing}
                disabled={isTesting}
                className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs shrink-0 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                title={apiKey.trim() ? "测试网关连接延迟 (Ping)" : "请先填写 API Key 后再进行测速"}
              >
                {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" /> : <Activity className="w-3.5 h-3.5 text-slate-500" />}
                <span>测速 Ping</span>
              </button>
          <button
            type="button"
            onClick={() => handleSaveApiConfig(baseUrl, apiKey, true)}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-bold flex items-center justify-center transition-all shadow-xs cursor-pointer"
          >
            <span>保存网关配置</span>
          </button>
          </div>
        </div>
      </div>

      {/* 🌟 2. 工作流模型配置卡片 (精简集成工作台) */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
        {/* 工具栏第一行：标题 + 数量 + 核心操作组 */}
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">已启用的工作流模型</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
              {filteredModels.length} 款
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleSortByComflyPrice}
              disabled={isFetchingPrices}
              className="px-2.5 py-1.5 rounded-xl border border-indigo-200/70 hover:bg-indigo-50 text-indigo-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              title="获取 Comfly 默认分组当前报价，按各 1K 输入和输出 token 的价格之和升序排列多模态模型"
            >
              <RefreshCw className={`w-3 h-3 ${isFetchingPrices ? 'animate-spin' : ''}`} />
              按 Comfly 价格排序
            </button>
            <button
              onClick={handleResetDefaultModels}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200/80 hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
              title="恢复系统出厂预设模型列表"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">恢复预设</span>
            </button>

            <button
              onClick={handleOpenGatewayDiscovery}
              disabled={isFetchingGateway}
              className="px-2.5 py-1.5 rounded-xl border border-indigo-200/70 hover:bg-indigo-50/60 text-indigo-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 text-indigo-600 ${isFetchingGateway ? 'animate-spin' : ''}`} />
              <span>获取网关模型库 ({allGatewayModels.length || APPROVED_MODELS.length})</span>
            </button>

            <button
              onClick={() => setIsAddingModelModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs active:scale-95"
            >
              <Plus className="w-3 h-3" />
              <span>添加模型</span>
            </button>
          </div>
        </div>

        {/* 工具栏第二行：分类药丸 Tab 与搜索框同行平铺 (大幅节省垂直空间) */}
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 border border-slate-200/60 rounded-xl text-xs select-none shadow-2xs">
            {/* 全部模型 */}
            <button
              type="button"
              onClick={() => setModelCapabilityFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                modelCapabilityFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers className="w-3 h-3 text-slate-500" />
              <span>全部</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                modelCapabilityFilter === 'all' ? 'bg-slate-900 text-white font-bold' : 'bg-slate-200 text-slate-600'
              }`}>
                {customModels.length}
              </span>
            </button>

            {/* 多模态 */}
            <button
              type="button"
              onClick={() => setModelCapabilityFilter('multimodal')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                modelCapabilityFilter === 'multimodal'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-indigo-600'
              }`}
            >
              <Bot className="w-3 h-3 text-indigo-500" />
              <span>多模态</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                modelCapabilityFilter === 'multimodal' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-200 text-slate-600'
              }`}>
                {customModels.filter(isMultimodalWorkflowModel).length}
              </span>
            </button>

            {/* 商业生图 */}
            <button
              type="button"
              onClick={() => setModelCapabilityFilter('image')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                modelCapabilityFilter === 'image'
                  ? 'bg-white text-amber-600 shadow-xs'
                  : 'text-slate-500 hover:text-amber-600'
              }`}
            >
              <Palette className="w-3 h-3 text-amber-500" />
              <span>生图</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                modelCapabilityFilter === 'image' ? 'bg-amber-500 text-white font-bold' : 'bg-slate-200 text-slate-600'
              }`}>
                {customModels.filter(m => m.isImage).length}
              </span>
            </button>

            {/* 视频生成 */}
            <button
              type="button"
              onClick={() => setModelCapabilityFilter('video')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                modelCapabilityFilter === 'video'
                  ? 'bg-white text-sky-600 shadow-xs'
                  : 'text-slate-500 hover:text-sky-600'
              }`}
            >
              <Video className="w-3 h-3 text-sky-500" />
              <span>视频</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                modelCapabilityFilter === 'video' ? 'bg-sky-500 text-white font-bold' : 'bg-slate-200 text-slate-600'
              }`}>
                {customModels.filter(m => m.isVideo).length}
              </span>
            </button>
          </div>

          {/* 紧凑搜索框 */}
          <div className="relative w-44 sm:w-56">
            <input
              type="text"
              value={modelSearch}
              onChange={e => setModelSearch(e.target.value)}
              placeholder="搜索模型..."
              className="w-full pl-8 pr-6 py-1.5 text-xs rounded-xl bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200/80 text-slate-800 outline-none focus:border-indigo-500 shadow-2xs transition-all placeholder-slate-400"
            />
            <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            {modelSearch && (
              <button 
                onClick={() => setModelSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 模型列表容器 (去掉重复标题，列表直观展开) */}
        <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs min-w-0">
          {/* 轻柔小提示栏 */}
          <div className="px-3.5 py-2 bg-slate-50/70 border-b border-slate-100 text-[11px] text-slate-500 font-medium flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{modelCapabilityFilter === 'multimodal'
                ? '按 Comfly 默认分组各 1K 输入与输出 token 报价之和升序；可手动调序，实际扣费以所用分组账单为准'
                : '自上而下决定主调与降级优先级，支持拖拽行或上下箭头调序'}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono shrink-0 hidden sm:inline">
              {modelCapabilityFilter === 'all' ? '全局综合排序' : '分类独立排序'}
            </span>
          </div>
          <div className="px-3.5 py-1.5 border-b border-slate-100 text-[11px] text-slate-600 flex gap-3">
            <span>Comfly 渠道 {customModels.filter(model => model.channel !== 'openai' && model.channel !== 'lianchi').length}</span>
            <span>OpenAI 渠道 {customModels.filter(model => model.channel === 'openai').length}</span>
            <span>联池渠道 {customModels.filter(model => model.channel === 'lianchi').length}</span>
          </div>

          <div className="divide-y divide-slate-100/90 max-h-[min(48vh,420px)] overflow-y-auto overflow-x-auto">
            {filteredModels.length === 0 ? (
              <div className="px-5 py-10 text-center space-y-2">
                <p className="text-sm font-semibold text-slate-700">暂无工作流模型</p>
                <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                  请点击上方「获取网关模型库」，从您的 API 网关拉取并勾选需要的模型；未从网关接入的模型不会自动显示。
                </p>
              </div>
            ) : filteredModels.map((m, index) => (
              <WorkflowModelRow
                key={workflowModelRouteId(m)}
                model={m}
                price={comflyPrices?.[m.id.toLowerCase()]}
                index={index}
                isFirst={index === 0}
                isLast={index === filteredModels.length - 1}
                isDragged={draggedModelId === workflowModelRouteId(m)}
                isDragOver={dragOverModelId === workflowModelRouteId(m)}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onMoveModel={onMoveModel}
                onToggleCapability={handleToggleCapability}
                onDeleteModel={handleDeleteModel}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
