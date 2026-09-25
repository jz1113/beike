import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Settings2, 
} from 'lucide-react';
import type { GenerationStrategy } from '../model/batchTypes';
import { WorkshopAssetBindings } from './WorkshopAssetBindings';

export interface WorkshopSettingsModalProps {
  isOpen: boolean;
  workspaceStatus?: string;
  workspaceError?: string | null;
  busy?: boolean;
  assetLoadState?: 'loading' | 'ready' | 'error';
  assetLoadError?: string;
  onReloadAssets?: () => void;
  onOpenAssets?: () => void;
  onClose: () => void;
  selectedArchId: string;
  setSelectedArchId: (id: string) => void;
  recipes: Array<{ id: string; name: string }>;
  selectedShotCount: number;
  setSelectedShotCount: (cnt: number) => void;
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  setSelectedAspect: (asp: '3:4' | '1:1' | '9:16' | '16:9') => void;
  selectedQuality: 'high' | 'medium' | 'low';
  setSelectedQuality: (q: 'high' | 'medium' | 'low') => void;
  selectedVisionModel: string;
  setSelectedVisionModel: (m: string) => void;
  availableVisionModels: Array<{ id: string; name?: string; shortName?: string }>;
  selectedImageGenModel: string;
  setSelectedImageGenModel: (m: string) => void;
  availableImageModels: Array<{ id: string; name?: string; shortName?: string }>;
  generationStrategy: GenerationStrategy;
  setGenerationStrategy: (strategy: GenerationStrategy) => void;
  autoGenerateCopywriting: boolean;
  setAutoGenerateCopywriting: (enabled: boolean) => void;
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
  lockedActionId?: string;
  setLockedActionId?: (id: string) => void;
  availableActions?: Array<{ id: string; title?: string; code?: string }>;
  lockedFullPromptId?: string;
  setLockedFullPromptId?: (id: string) => void;
  availableFullPrompts?: Array<{ id: string; title?: string; name?: string; code?: string; shotPromptsJson?: string; hasHuman?: boolean }>;
  personaMode?: 'asset_driven' | 'none';
  setPersonaMode?: (mode: 'asset_driven' | 'none') => void;
}

export function WorkshopSettingsModal({
  isOpen, workspaceStatus, workspaceError, busy = false,
  assetLoadState = 'ready', assetLoadError, onReloadAssets, onOpenAssets,
  onClose,
  selectedArchId,
  setSelectedArchId,
  recipes,
  selectedShotCount,
  setSelectedShotCount,
  selectedAspect,
  setSelectedAspect,
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
  autoGenerateCopywriting,
  setAutoGenerateCopywriting,
  imageGenConcurrency,
  setImageGenConcurrency,
  analyzeConcurrency,
  setAnalyzeConcurrency,
  lockedPersonaId = 'auto',
  setLockedPersonaId,
  availablePersonas = [],
  lockedSceneId = 'auto',
  setLockedSceneId,
  availableScenes = [],
  lockedOutfitId = 'auto',
  setLockedOutfitId,
  availableOutfits = [],
  lockedFullPromptId = 'auto',
  setLockedFullPromptId,
  availableFullPrompts = [],
}: WorkshopSettingsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, select, input, textarea, a[href], [tabindex="0"]',
      ) || []).filter((el) => !el.matches(':disabled') && el.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px] select-none animate-in fade-in duration-200">
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0"
        onClick={onClose}
      />

      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="workshop-settings-title" tabIndex={-1} className="relative z-10 outline-none flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)] animate-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="flex shrink-0 items-start justify-between gap-5 px-5 pb-3 pt-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 ring-1 ring-indigo-100">
              <Settings2 className="h-3.5 w-3.5 text-indigo-600" />
            </div>
            <h2 id="workshop-settings-title" className="text-sm font-black tracking-tight">生产设置</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="关闭配置窗口"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-2 sm:px-6">
          {busy && <p role="status" className="mb-3 text-xs text-amber-700">任务执行中，生产设置暂时只读，避免同批次混用配置。</p>}
          <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-black">模型策略</h3>
                <span className="text-xs text-slate-400">分析与生图引擎</span>
              </div>
              <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
                <label className="flex min-w-0 items-center gap-2.5 pb-2 md:pb-0 md:pr-4">
                  <span className="w-[90px] shrink-0 text-xs font-bold text-slate-700">视觉分析模型</span>
                  <select value={selectedVisionModel} onChange={e => setSelectedVisionModel(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500">
                    {availableVisionModels.map(m => <option key={m.id} value={m.id}>{m.shortName || m.name || m.id}</option>)}
                  </select>
                </label>
                <label className="flex min-w-0 items-center gap-2.5 pt-2 md:pl-4 md:pt-0">
                  <span className="w-[90px] shrink-0 text-xs font-bold text-slate-700">成图生成模型</span>
                  <select value={selectedImageGenModel} onChange={e => setSelectedImageGenModel(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500">
                    {availableImageModels.map(m => <option key={m.id} value={m.id}>{m.shortName || m.name || m.id}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <section className="border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-black">拍摄预设</h3>
                <span className="text-xs text-slate-400">构图、画幅与交付规格</span>
              </div>
              <label className="flex min-w-0 items-center gap-2.5">
                <span className="w-[90px] shrink-0 text-xs font-bold text-slate-700">拍摄大架构</span>
                <select value={selectedArchId} onChange={e => setSelectedArchId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500">
                  {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <fieldset className="mt-3">
                <legend className="mb-2 text-xs font-bold text-slate-700">生图策略</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {([
                    ['grid_first', '四宫格生成 4 镜', '一次生成四宫格后拆为 4 张；画质设置用于整图。'],
                    ['single_shot', '单张逐镜生成', '每镜独立生成一张完整图片，支持 4 镜或 8 镜。'],
                  ] as const).map(([value, title, description]) => (
                    <label key={value} className={`flex cursor-pointer gap-2 rounded-xl border p-3 ${generationStrategy === value ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                      <input type="radio" name="workshop-generation-strategy" value={value} checked={generationStrategy === value} onChange={() => { if (value === 'grid_first' && selectedShotCount !== 4) setSelectedShotCount(4); setGenerationStrategy(value); }} className="mt-0.5 accent-indigo-600" />
                      <span><span className="block text-xs font-bold">{title}</span><span className="mt-1 block text-[11px] text-slate-500">{description}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-3 grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="py-2 sm:py-0 sm:pr-4">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">出图画幅</span>
                  <div className="grid grid-cols-4 gap-1">
                    {(['3:4', '1:1', '9:16', '16:9'] as const).map(asp => (
                      <button key={asp} type="button" onClick={() => setSelectedAspect(asp)} className={`rounded-lg py-1.5 text-[11px] font-bold transition-colors ${selectedAspect === asp ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>{asp}</button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center justify-between gap-3 py-2 sm:px-4 sm:py-0">
                  <span className="shrink-0 text-xs font-bold text-slate-700">分镜数量</span>
                  <select value={selectedShotCount} onChange={e => setSelectedShotCount(parseInt(e.target.value, 10))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500">
                    {(generationStrategy === 'grid_first' ? [4] : [4, 8]).map(cnt => <option key={cnt} value={cnt}>{cnt === 8 ? '8 镜（原组扩写）' : '4 镜（原组）'}</option>)}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 py-2 sm:pl-4 sm:py-0">
                  <span className="shrink-0 text-xs font-bold text-slate-700">交付画质</span>
                  <select value={selectedQuality} onChange={e => setSelectedQuality(e.target.value as 'high' | 'medium' | 'low')} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500">
                    <option value="low">1K（low）</option><option value="medium">2K（medium）</option><option value="high">4K（high）</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-black">执行偏好</h3>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={autoGenerateCopywriting} onChange={event => setAutoGenerateCopywriting(event.target.checked)} className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500" />
                  生图后自动生成文案
                </label>
              </div>
              <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <label className="flex items-center justify-between gap-3 py-2 sm:py-0 sm:pr-4"><span className="text-xs font-bold text-slate-700">分析并发</span><select value={analyzeConcurrency} onChange={e => setAnalyzeConcurrency?.(Number(e.target.value))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"><option value={1}>1 并发</option><option value={2}>2 并发</option><option value={3}>3 并发</option><option value={4}>4 并发</option></select></label>
                <label className="flex items-center justify-between gap-3 py-2 sm:px-4 sm:py-0"><span className="text-xs font-bold text-slate-700">生图并发</span><select value={imageGenConcurrency} onChange={e => setImageGenConcurrency?.(Number(e.target.value))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"><option value={4}>4 并发</option><option value={8}>8 并发</option><option value={16}>16 并发</option><option value={32}>32 并发</option><option value={50}>50 并发</option></select></label>
                <div className="flex items-center justify-between gap-3 py-2 sm:pl-4 sm:py-0"><span className="text-xs font-bold text-slate-700">执行方式</span><span className="rounded-lg bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-700">商品图 + 图组提示词</span></div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 p-3 text-xs" aria-label="生产资源状态">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>生产资源 · 仅可用且已发布的资产进入生成</strong>
                <div className="flex gap-3"><button type="button" onClick={onReloadAssets} disabled={assetLoadState === 'loading'} className="text-indigo-600 disabled:opacity-50">重新加载资产</button>
                  <button type="button" onClick={onOpenAssets} className="text-indigo-600">管理资产库</button></div>
              </div>
              <p role={assetLoadState === 'error' ? 'alert' : 'status'} className={`mt-2 ${assetLoadState === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
                {assetLoadState === 'loading' ? '正在核对资产，请稍候；此时不能启动分析。' : assetLoadState === 'error'
                  ? `加载失败：${assetLoadError || '请重试'}。当前选项可能已过期，不能启动分析。`
                  : `可用母本 ${availableFullPrompts.length} · 人物 ${availablePersonas.length} · 穿搭 ${availableOutfits.length} · 场景 ${availableScenes.length}。资源管理中的待审核、停用及占位记录不参与生产。`}
              </p>
            </section>
            <WorkshopAssetBindings
              groupId={lockedFullPromptId} groups={availableFullPrompts}
              onGroupChange={(id) => setLockedFullPromptId?.(id)}
              personaId={lockedPersonaId} personas={availablePersonas} onPersonaChange={(id) => setLockedPersonaId?.(id)}
              sceneId={lockedSceneId} scenes={availableScenes} onSceneChange={(id) => setLockedSceneId?.(id)}
              outfitId={lockedOutfitId} outfits={availableOutfits} onOutfitChange={(id) => setLockedOutfitId?.(id)}
            />
          </fieldset>
        </div>

        {/* 底部操作栏 */}
        <div className="px-5 sm:px-6 py-3 bg-slate-50/90 border-t border-slate-200/70 flex items-center justify-between shrink-0">
          <p role="status" className={`text-xs ${workspaceError ? 'text-red-600' : 'text-slate-500'}`}>
            {workspaceError ? `保存未确认：${workspaceError}` : workspaceStatus || '修改将随当前批次自动保存'}
          </p>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer shadow-xs active:scale-98"
          >
            完成
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default WorkshopSettingsModal;
