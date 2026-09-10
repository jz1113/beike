import React from 'react';
import { 
  X, 
  Settings2, 
  Camera, 
  Cpu, 
  Sparkles, 
  UserCheck, 
  Package, 
  CheckCircle2,
} from 'lucide-react';

export interface WorkshopSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedArchId: string;
  setSelectedArchId: (id: string) => void;
  recipes: Array<{ id: string; name: string }>;
  selectedShotCount: number;
  setSelectedShotCount: (cnt: number) => void;
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  setSelectedAspect: (asp: '3:4' | '1:1' | '9:16' | '16:9') => void;
  hasHumanPersona: boolean;
  setHasHumanPersona: (has: boolean) => void;
  selectedQuality: 'high' | 'medium' | 'low';
  setSelectedQuality: (q: 'high' | 'medium' | 'low') => void;
  selectedVisionModel: string;
  setSelectedVisionModel: (m: string) => void;
  availableVisionModels: Array<{ id: string; name?: string; shortName?: string }>;
  selectedImageGenModel: string;
  setSelectedImageGenModel: (m: string) => void;
  availableImageModels: Array<{ id: string; name?: string; shortName?: string }>;
  generationStrategy: 'grid_first' | 'single_shot';
  setGenerationStrategy?: (s: 'grid_first' | 'single_shot') => void;
  imageGenConcurrency: number;
  setImageGenConcurrency?: (n: number) => void;
  analyzeConcurrency: number;
  setAnalyzeConcurrency?: (n: number) => void;
  useAssetLibrary?: boolean;
  setUseAssetLibrary?: (use: boolean) => void;
  lockedPersonaId?: string;
  setLockedPersonaId?: (id: string) => void;
  availablePersonas?: Array<{ id: string; name?: string; code?: string }>;
  lockedSceneId?: string;
  setLockedSceneId?: (id: string) => void;
  availableScenes?: Array<{ id: string; title?: string; code?: string }>;
  lockedOutfitId?: string;
  setLockedOutfitId?: (id: string) => void;
  availableOutfits?: Array<{ id: string; title?: string; code?: string }>;
}

export function WorkshopSettingsModal({
  isOpen,
  onClose,
  selectedArchId,
  setSelectedArchId,
  recipes,
  selectedShotCount,
  setSelectedShotCount,
  selectedAspect,
  setSelectedAspect,
  hasHumanPersona,
  setHasHumanPersona,
  selectedQuality,
  setSelectedQuality,
  selectedVisionModel,
  setSelectedVisionModel,
  availableVisionModels,
  selectedImageGenModel,
  setSelectedImageGenModel,
  availableImageModels,
  generationStrategy,
  setGenerationStrategy,
  imageGenConcurrency,
  setImageGenConcurrency,
  analyzeConcurrency,
  setAnalyzeConcurrency,
  useAssetLibrary = true,
  setUseAssetLibrary,
  lockedPersonaId = 'auto',
  setLockedPersonaId,
  availablePersonas = [],
  lockedSceneId = 'auto',
  setLockedSceneId,
  availableScenes = [],
  lockedOutfitId = 'auto',
  setLockedOutfitId,
  availableOutfits = [],
}: WorkshopSettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-200">
      {/* 背景遮罩 */}
      <div 
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* 模态框主体：宽幅自适应 + 针对小高度窗口深度优化的响应式弹性视窗 */}
      <div className="relative w-full max-w-4xl bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] z-10 animate-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white/95">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100/80 flex items-center justify-center text-indigo-600 shadow-2xs shrink-0">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                  种草工坊 · 全局生产预设与大模型配置
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black font-mono border border-indigo-200/60 shadow-2xs">
                  PRESETS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 font-normal">
                配置工坊默认拍摄架构、分镜画幅与 AI 底座模型，对后续所有采编生产批次自动生效
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer border border-slate-200/60"
            title="关闭配置窗口"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容区域：大/小窗口自适应两列网格，大幅缩减垂直高度，杜绝小窗口展示不全 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* 左列：板块 1 - 默认拍摄规格 */}
            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-indigo-100/80 text-indigo-700 flex items-center justify-center">
                    <Camera className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-900">默认拍摄规格</h3>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">景别构图与模式</span>
              </div>

              {/* 拍摄大架构 */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>默认拍摄大架构</span>
                  <span className="text-[10px] text-slate-400 font-normal">决定镜头景别与构图</span>
                </label>
                <select
                  value={selectedArchId}
                  onChange={e => setSelectedArchId(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none cursor-pointer shadow-2xs"
                >
                  {recipes.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* 出镜主体模式 */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  默认出镜主体模式
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setHasHumanPersona(true)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      hasHumanPersona
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xs shadow-indigo-500/25 ring-2 ring-indigo-500/20'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs'
                    }`}
                  >
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <div className="text-left">
                      <div>真人出镜佩戴</div>
                      <div className={`text-[9px] font-normal ${hasHumanPersona ? 'text-white/80' : 'text-slate-400'}`}>
                        模特真实穿戴展示
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHasHumanPersona(false)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      !hasHumanPersona
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xs shadow-indigo-500/25 ring-2 ring-indigo-500/20'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs'
                    }`}
                  >
                    <Package className="w-4 h-4 shrink-0" />
                    <div className="text-left">
                      <div>纯商品静物实拍</div>
                      <div className={`text-[9px] font-normal ${!hasHumanPersona ? 'text-white/80' : 'text-slate-400'}`}>
                        纯净特写静物摄影
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* 默认画幅比例 */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  默认出图画幅比例
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['3:4', '1:1', '9:16', '16:9'] as const).map(asp => (
                    <button
                      key={asp}
                      type="button"
                      onClick={() => setSelectedAspect(asp)}
                      className={`py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                        selectedAspect === asp
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xs shadow-indigo-500/25 ring-2 ring-indigo-500/20'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs'
                      }`}
                    >
                      <span>{asp}</span>
                      <span className={`text-[9px] font-normal ${selectedAspect === asp ? 'text-white/80' : 'text-slate-400'}`}>
                        {asp === '3:4' ? '种草' : asp === '1:1' ? '方图' : asp === '9:16' ? '竖屏' : '横屏'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 分镜数量与画质 */}
              <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    默认分镜数量
                  </label>
                  <select
                    value={selectedShotCount}
                    onChange={e => setSelectedShotCount(parseInt(e.target.value, 10))}
                    className="w-full py-1.5 px-3 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none cursor-pointer shadow-2xs"
                  >
                    {[1, 4].map(cnt => (
                      <option key={cnt} value={cnt}>{cnt} 镜</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    交付画质
                  </label>
                  <select
                    value={selectedQuality}
                    onChange={e => setSelectedQuality(e.target.value as 'high' | 'medium' | 'low')}
                    className="w-full py-1.5 px-3 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none cursor-pointer shadow-2xs"
                  >
                    <option value="high">4K 极清 (推荐)</option>
                    <option value="medium">1080P 高清</option>
                    <option value="low">极速草图</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 右列：板块 2 (模型与并发) + 板块 3 (原子积木人设绑定) */}
            <div className="space-y-4">
              {/* 板块 2: AI 模型与性能并发 */}
              <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-violet-100/80 text-violet-700 flex items-center justify-center">
                      <Cpu className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-xs font-bold text-slate-900">AI 模型与性能并发</h3>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">反推与生图引擎</span>
                </div>

                {/* 模型选择：并排两列 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      多模态视觉模型
                    </label>
                    <select
                      value={selectedVisionModel}
                      onChange={e => setSelectedVisionModel(e.target.value)}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                    >
                      {availableVisionModels.map(m => (
                        <option key={m.id} value={m.id}>{m.name || m.shortName || m.id}</option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-400 block truncate">负责材质与微观纹理反推</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      底座生图引擎
                    </label>
                    <select
                      value={selectedImageGenModel}
                      onChange={e => setSelectedImageGenModel(e.target.value)}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                    >
                      {availableImageModels.map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name || m.shortName || m.id}</option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-400 block truncate">负责终稿成片级极清摄影渲染</span>
                  </div>
                </div>

                {/* 并发与策略：并排三列 */}
                <div className="grid grid-cols-3 gap-2 pt-0.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block truncate">
                      分析并发
                    </label>
                    <select
                      value={analyzeConcurrency}
                      onChange={e => setAnalyzeConcurrency?.(Number(e.target.value))}
                      className="w-full py-1.5 px-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                    >
                      <option value={1}>1 线程</option>
                      <option value={2}>2 并发 (推荐)</option>
                      <option value={3}>3 并发</option>
                      <option value={4}>4 并发</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block truncate">
                      生图并发
                    </label>
                    <select
                      value={imageGenConcurrency}
                      onChange={e => setImageGenConcurrency?.(Number(e.target.value))}
                      className="w-full py-1.5 px-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                    >
                      <option value={4}>4 并发</option>
                      <option value={8}>8 并发</option>
                      <option value={16}>16 并发 (推荐)</option>
                      <option value={32}>32 并发</option>
                      <option value={50}>50 并发</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block truncate">
                      执行策略
                    </label>
                    <select
                      value={generationStrategy}
                      onChange={e => setGenerationStrategy?.(e.target.value as 'grid_first' | 'single_shot')}
                      className="w-full py-1.5 px-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                    >
                      <option value="grid_first">四宫格拼图 (同人锁脸)</option>
                      <option value="single_shot">单张独立分镜</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 板块 3: 原子积木人设绑定 */}
              <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-amber-100/80 text-amber-700 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-xs font-bold text-slate-900">原子积木人设绑定</h3>
                  </div>

                  <label className="flex items-center gap-1.5 cursor-pointer select-none bg-white px-2.5 py-1 rounded-xl border border-slate-200/90 shadow-2xs hover:border-indigo-300 transition-colors">
                    <input
                      type="checkbox"
                      checked={useAssetLibrary}
                      onChange={e => setUseAssetLibrary && setUseAssetLibrary(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-indigo-700">启用资产库联动</span>
                  </label>
                </div>

                <p className="text-[10px] text-slate-500">
                  自动从提示词资产中台召回模特人设 (#P)、置景空间 (#S) 与私服穿搭 (#O)
                </p>

                {useAssetLibrary && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5 animate-in fade-in duration-150">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block truncate">
                        模特人设 (#P)
                      </label>
                      <select
                        value={lockedPersonaId}
                        onChange={e => setLockedPersonaId && setLockedPersonaId(e.target.value)}
                        className="w-full py-1.5 px-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                      >
                        <option value="auto">智能多元轮循 (推荐)</option>
                        {availablePersonas.map((p, idx) => (
                          <option key={p.id} value={p.id}>
                            {p.code ? `[#${p.code.replace(/^#/, '')}]` : `[#P-${String(idx + 1).padStart(2, '0')}]`} {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block truncate">
                        置景空间 (#S)
                      </label>
                      <select
                        value={lockedSceneId}
                        onChange={e => setLockedSceneId && setLockedSceneId(e.target.value)}
                        className="w-full py-1.5 px-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                      >
                        <option value="auto">智能多元轮循 (推荐)</option>
                        {availableScenes.map((s, idx) => (
                          <option key={s.id} value={s.id}>
                            {s.code ? `[#${s.code.replace(/^#/, '')}]` : `[#S-${String(idx + 1).padStart(2, '0')}]`} {s.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block truncate">
                        私服穿搭 (#O)
                      </label>
                      <select
                        value={lockedOutfitId}
                        onChange={e => setLockedOutfitId && setLockedOutfitId(e.target.value)}
                        className="w-full py-1.5 px-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                      >
                        <option value="auto">智能多元轮循 (推荐)</option>
                        {availableOutfits.map((o, idx) => (
                          <option key={o.id} value={o.id}>
                            {o.code ? `[#${o.code.replace(/^#/, '')}]` : `[#O-${String(idx + 1).padStart(2, '0')}]`} {o.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="px-5 sm:px-6 py-3 bg-slate-50/90 border-t border-slate-200/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>修改已实时自动持久化</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer shadow-xs active:scale-98"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

export default WorkshopSettingsModal;
