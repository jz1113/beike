import type { WorkshopSettingsModalProps } from './workshopSettingsTypes';
import { WorkshopAssetBindings } from './WorkshopAssetBindings';

const selectClass = 'mt-2 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50';
const labelClass = 'block min-w-0 text-xs font-semibold text-slate-700';

export function WorkshopContentSettings(props: WorkshopSettingsModalProps) {
  const { assetLoadState = 'ready', availableFullPrompts = [], availablePersonas = [], availableScenes = [], availableOutfits = [] } = props;
  return <>
    <label className={labelClass}>拍摄类型
      <select aria-label="拍摄类型" value={props.selectedArchId} onChange={event => props.setSelectedArchId(event.target.value)} className={selectClass}>
        {props.recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
      </select>
    </label>
    <WorkshopAssetBindings
      groupId={props.lockedFullPromptId || 'auto'} groups={availableFullPrompts} onGroupChange={id => props.setLockedFullPromptId?.(id)}
      personaId={props.lockedPersonaId || 'auto'} personas={availablePersonas} onPersonaChange={id => props.setLockedPersonaId?.(id)}
      sceneId={props.lockedSceneId || 'auto'} scenes={availableScenes} onSceneChange={id => props.setLockedSceneId?.(id)}
      outfitId={props.lockedOutfitId || 'auto'} outfits={availableOutfits} onOutfitChange={id => props.setLockedOutfitId?.(id)}
    />
    <section className="border-t border-slate-100 pt-4" aria-label="生产资源状态">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-700">可用素材</h4>
        <div className="flex gap-4 text-xs">
          <button type="button" onClick={props.onReloadAssets} disabled={assetLoadState === 'loading' || !props.onReloadAssets} className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50">{assetLoadState === 'loading' ? '加载中…' : '重新加载'}</button>
          <button type="button" onClick={props.onOpenAssets} disabled={!props.onOpenAssets} className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50">管理资产库 ↗</button>
        </div>
      </div>
      <p role={assetLoadState === 'error' ? 'alert' : 'status'} className={`mt-2 text-xs leading-5 ${assetLoadState === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
        {assetLoadState === 'loading' ? '正在核对资产，请稍候；此时不能启动分析。' : assetLoadState === 'error'
          ? `加载失败：${props.assetLoadError || '请重试'}。当前选项可能已过期，不能启动分析。`
          : `母本 ${availableFullPrompts.length} · 人物 ${availablePersonas.length} · 穿搭 ${availableOutfits.length} · 场景 ${availableScenes.length}`}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-slate-400">仅使用可用且已发布的资产；待审核、停用及占位记录不参与生产。</p>
    </section>
  </>;
}

export function WorkshopOutputSettings(props: WorkshopSettingsModalProps) {
  const isGrid = props.generationStrategy === 'grid_first';
  return <>
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">生成方式</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ['grid_first', '四宫格生成', '一次生成整张四宫格，再拆分为 4 张图片。', '固定 4 镜'],
          ['single_shot', '单张逐镜生成', '每个分镜独立生成一张完整图片。', '支持 4 镜 / 8 镜'],
        ] as const).map(([value, title, description, tag]) => <label key={value}
          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${props.generationStrategy === value ? 'border-indigo-400 bg-indigo-50/70' : 'border-slate-200 hover:bg-slate-50'}`}>
          <input type="radio" name="workshop-generation-strategy" value={value} checked={props.generationStrategy === value}
            onChange={() => { if (value === 'grid_first' && props.selectedShotCount !== 4) props.setSelectedShotCount(4); props.setGenerationStrategy(value); }} className="mt-1 accent-indigo-600" />
          <span><span className="block text-sm font-semibold">{title}</span><span className="mt-2 block text-xs leading-5 text-slate-500">{description}</span><span className="mt-3 block text-[11px] font-medium text-slate-600">{tag}</span></span>
        </label>)}
      </div>
    </fieldset>
    <section className="border-t border-slate-100 pt-5">
      <h4 className="mb-4 text-sm font-semibold">交付规格</h4>
      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-slate-700">出图画幅</legend>
        <div className="grid grid-cols-4 gap-2">
          {(['3:4', '1:1', '9:16', '16:9'] as const).map(aspect => <button key={aspect} type="button" aria-pressed={props.selectedAspect === aspect}
            onClick={() => props.setSelectedAspect(aspect)} className={`flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-xs font-medium transition-colors focus-visible:outline-indigo-500 ${props.selectedAspect === aspect ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <span className="flex h-8 w-9 items-center justify-center" aria-hidden="true"><span className="block rounded-sm border-[1.5px] border-current" style={{ aspectRatio: aspect.replace(':', '/'), height: aspect === '16:9' ? 20 : 28 }} /></span>{aspect}
          </button>)}
        </div>
      </fieldset>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>分镜数量
          <select aria-label="分镜数量" value={props.selectedShotCount} disabled={isGrid} onChange={event => props.setSelectedShotCount(Number(event.target.value))} className={selectClass}>
            {(isGrid ? [4] : [4, 8]).map(count => <option key={count} value={count}>{count === 8 ? '8 镜（原组扩写）' : '4 镜（原组）'}</option>)}
          </select>
          <span className="mt-2 block text-[11px] font-normal leading-5 text-slate-500">{isGrid ? '四宫格固定为 4 镜。' : '8 镜将在原图组基础上扩写。'}</span>
        </label>
        <label className={labelClass}>交付画质
          <select aria-label="交付画质" value={props.selectedQuality} onChange={event => props.setSelectedQuality(event.target.value as WorkshopSettingsModalProps['selectedQuality'])} className={selectClass}>
            <option value="low">1K（low）</option><option value="medium">2K（medium）</option><option value="high">4K（high）</option>
          </select>
          <span className="mt-2 block text-[11px] font-normal leading-5 text-slate-500">{isGrid ? '画质应用于整张四宫格，不是拆分后的单张。' : '画质应用于每张独立生成的图片。'}</span>
        </label>
      </div>
    </section>
    <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">两种生成方式使用相同的图组与内容替换设置。商品始终使用你挑选的商品图。</p>
  </>;
}

export function WorkshopExecutionSettings(props: WorkshopSettingsModalProps) {
  return <>
    <section>
      <h4 className="text-sm font-semibold">模型选择</h4>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>视觉分析模型
          <select aria-label="视觉分析模型" value={props.selectedVisionModel} onChange={event => props.setSelectedVisionModel(event.target.value)} className={selectClass}>
            {props.availableVisionModels.map(model => <option key={model.id} value={model.id}>{model.shortName || model.name || model.id}</option>)}
          </select>
          <span className="mt-2 block text-[11px] font-normal text-slate-500">分析商品与图组，生成分镜提示词。</span>
        </label>
        <label className={labelClass}>成图生成模型
          <select aria-label="成图生成模型" value={props.selectedImageGenModel} onChange={event => props.setSelectedImageGenModel(event.target.value)} className={selectClass}>
            {props.availableImageModels.map(model => <option key={model.id} value={model.id}>{model.shortName || model.name || model.id}</option>)}
          </select>
          <span className="mt-2 block text-[11px] font-normal text-slate-500">根据商品图与图组提示词生成图片。</span>
        </label>
      </div>
    </section>
    <section className="border-t border-slate-100 pt-5">
      <h4 className="text-sm font-semibold">执行效率</h4>
      <p className="mt-1.5 text-xs leading-5 text-slate-500">设置同时处理的任务数，请结合模型服务的并发限制调整。</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>分析并发
          <select aria-label="分析并发" value={props.analyzeConcurrency} disabled={!props.setAnalyzeConcurrency} onChange={event => props.setAnalyzeConcurrency?.(Number(event.target.value))} className={selectClass}>
            {[1, 2, 3, 4].map(count => <option key={count} value={count}>{count} 并发</option>)}
          </select>
        </label>
        <label className={labelClass}>生图并发
          <select aria-label="生图并发" value={props.imageGenConcurrency} disabled={!props.setImageGenConcurrency} onChange={event => props.setImageGenConcurrency?.(Number(event.target.value))} className={selectClass}>
            {[4, 8, 16, 32, 50].map(count => <option key={count} value={count}>{count} 并发</option>)}
          </select>
        </label>
      </div>
    </section>
    <section className="border-t border-slate-100 pt-5">
      <h4 className="mb-4 text-sm font-semibold">后续流程</h4>
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
        <span><span className="block text-sm font-medium">生图后自动生成文案</span><span className="mt-1.5 block text-xs text-slate-500">关闭后，可在需要时手动生成文案。</span></span>
        <input type="checkbox" aria-label="生图后自动生成文案" checked={props.autoGenerateCopywriting} onChange={event => props.setAutoGenerateCopywriting(event.target.checked)} className="h-4 w-4 shrink-0 accent-indigo-600" />
      </label>
    </section>
  </>;
}
