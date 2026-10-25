import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import type { WorkshopSettingsModalProps } from './workshopSettingsTypes';
import { WorkshopGridOutputSettings } from './WorkshopGridOutputSettings';
import { WorkshopAssetBindings } from './WorkshopAssetBindings';
import { recipeKind } from '@shared/domain/products/productRecipeSelection';
import { promptGroupMatchesMajorCategory } from '@shared/domain/workshop/workshop-pipeline';
import { workshopOutputSettings, WORKSHOP_ANALYSIS_CONCURRENCY, WORKSHOP_IMAGE_CONCURRENCY } from '../../model/workshopOutputSettings';

const selectClass = 'mt-2 w-full min-w-0 rounded-lg border border-slate-200/70 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]';
const labelClass = 'block min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-200';

export function WorkshopContentSettings(props: WorkshopSettingsModalProps) {
  const { assetLoadState = 'ready', availableFullPrompts = [], availableProductCategories = [], availablePersonas = [], availableScenes = [], availableOutfits = [] } = props;
  const hasRecipes = props.recipes.length > 0;
  const manualRecipes = props.recipes.filter(recipe => recipe.id !== '__category_skill__');
  const hasRecipeChoice = manualRecipes.length > 0 || (props.selectedArchId !== 'auto' && props.selectedArchId !== '__category_skill__');
  const selectedArchId = hasRecipes && (props.selectedArchId === 'auto' || props.recipes.some(recipe => recipe.id === props.selectedArchId))
    ? props.selectedArchId
    : '';
  const selectedRecipe = props.recipes.find(recipe => recipe.id === selectedArchId);
  const selectedKind = selectedRecipe ? recipeKind(selectedRecipe) : undefined;
  const architectureMajor = selectedKind === 'phone' ? 'digital' : selectedKind === 'jewelry' ? 'jewelry' : undefined;
  const architectureName = availableProductCategories.find(category => !category.parentId && !category.isArchived && architectureMajor
    && promptGroupMatchesMajorCategory({ productCategoryIds: JSON.stringify([category.id]), productCategoryNames: [category.name] }, architectureMajor))?.name || selectedRecipe?.name || '';
  const architectureGroupCount = architectureMajor
    ? availableFullPrompts.filter(group => promptGroupMatchesMajorCategory(group, architectureMajor)).length : 0;
  const inventoryMessage = availableFullPrompts.length
    ? architectureMajor
      ? architectureGroupCount
        ? `${architectureName} · ${architectureGroupCount} 组完整母本，文件夹已同步`
        : `当前${architectureName}架构暂无母本，请先到资产库补充`
      : `全库 ${availableFullPrompts.length} 组完整母本 · 添加商品后按类目与细分匹配`
    : '暂无可用四图母本，请到资产库导入并解构图组。';
  return <section className="space-y-3 py-5" aria-label="内容与素材">
    <h3 className="text-sm font-semibold">内容与素材</h3>
    {hasRecipeChoice ? <label className={labelClass}>电商图文技能
      <select aria-label="电商图文技能" value={selectedArchId} disabled={!hasRecipes} onChange={event => props.setSelectedArchId(event.target.value)} className={selectClass}>
        {!selectedArchId && <option value="" disabled>{hasRecipes ? '请选择电商图文技能' : '暂无可用电商图文技能'}</option>}
        {hasRecipes && <option value="auto">按参考图组应用类目技能</option>}
        {selectedArchId === '__category_skill__' && <option value="__category_skill__">按参考图组应用类目技能</option>}
        {manualRecipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
      </select>
    </label> : hasRecipes && <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">类目技能随参考图组自动应用，无需单独选择。</p>}
    {!hasRecipes && <p role="status" className="text-xs leading-5 text-amber-700 dark:text-amber-300">暂未加载到可用电商图文技能。请在“素材与技能”检查类目技能，或在全局“技能”管理手动技能后重试。</p>}
    {props.personaMode === 'none' && <p role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">此历史批次启用了无人像限制，仅使用无人物图组。
      {props.setPersonaMode && <button type="button" className="font-semibold underline" onClick={() => props.setPersonaMode?.('asset_driven')}>改为跟随图组出镜范围</button>}
    </p>}
    <section className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-3.5 dark:bg-white/5 dark:border-white/10" aria-label="生产资源状态">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role={assetLoadState === 'error' ? 'alert' : 'status'} className={`text-xs ${assetLoadState === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
          {assetLoadState === 'loading' ? '正在加载素材…' : assetLoadState === 'error' ? `加载失败：${props.assetLoadError || '请重试'}` : inventoryMessage}
        </p>
        <div className="flex gap-3 text-xs font-medium">
          <button type="button" onClick={props.onReloadAssets} disabled={assetLoadState === 'loading' || !props.onReloadAssets} className="text-slate-500 hover:text-indigo-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-indigo-300">刷新</button>
          <button type="button" onClick={() => props.onOpenAssets?.()} disabled={!props.onOpenAssets} className="text-indigo-600 disabled:opacity-50 dark:text-indigo-400">管理素材 ↗</button>
        </div>
      </div>
    </section>
    <WorkshopAssetBindings
      groupId={props.lockedFullPromptId || 'auto'} groups={availableFullPrompts} onGroupChange={id => props.setLockedFullPromptId?.(id)}
      products={props.products}
      architectureMajor={architectureMajor}
      categories={availableProductCategories} folderId={props.promptGroupFolderId} onFolderChange={props.setPromptGroupFolderId}
      personaMode={props.personaMode}
      personaId={props.lockedPersonaId || 'auto'} personas={availablePersonas} onPersonaChange={id => props.setLockedPersonaId?.(id)}
      sceneId={props.lockedSceneId || 'auto'} scenes={availableScenes} onSceneChange={id => props.setLockedSceneId?.(id)}
      outfitId={props.lockedOutfitId || 'auto'} outfits={availableOutfits} onOutfitChange={id => props.setLockedOutfitId?.(id)}
      onOpenAssets={props.onOpenAssets}
    />
  </section>;
}

export function WorkshopOutputSettings(props: WorkshopSettingsModalProps) {
  const isGrid = props.generationStrategy === 'grid_first';
  const output = workshopOutputSettings(props.selectedImageGenModel, props.selectedAspect, props.selectedQuality);
  return <section className="space-y-3 py-5" aria-label="图片与交付">
    <h3 className="text-sm font-semibold">图片与交付</h3>
    <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
      <label className={labelClass}>生成方式
        <select aria-label="生成方式" value={props.generationStrategy} className={selectClass} onChange={event => {
          const value = event.target.value as WorkshopSettingsModalProps['generationStrategy'];
          if (value === 'grid_first') props.setSelectedShotCount(4);
          props.setGenerationStrategy(value);
        }}><option value="grid_first">四宫格拆分</option><option value="single_shot">单张逐镜</option></select>
      </label>
      <label className={labelClass}>分镜数量
        {isGrid ? <span className="mt-2 block rounded-lg bg-slate-50 px-2.5 py-2 text-xs font-normal dark:bg-white/5">固定 4 镜</span> : <select aria-label="分镜数量" value={props.selectedShotCount} onChange={event => props.setSelectedShotCount(Number(event.target.value))} className={selectClass}>
          {[4, 8].map(count => <option key={count} value={count}>{count} 镜{count === 8 ? ' · 含 4 镜扩展' : ''}</option>)}
        </select>}
      </label>
      <label className={labelClass}>{isGrid ? '整图画幅' : '图片画幅'}
        <select aria-label="图片画幅" value={props.selectedAspect} onChange={event => props.setSelectedAspect(event.target.value as WorkshopSettingsModalProps['selectedAspect'])} className={selectClass}>
          {(['3:4', '1:1', '9:16', '16:9'] as const).map(aspect => <option key={aspect}>{aspect}</option>)}
        </select>
      </label>
    </div>
    <fieldset><legend className={labelClass}>{isGrid ? '整图画质与请求尺寸' : '单张画质与请求尺寸'}</legend>
      {output.fixedQuality ? <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">当前模型使用固定档位 · {output.size.replace('x', ' × ')} px，无需另选画质。</p>
        : <div className="mt-2 grid grid-cols-3 gap-2">{output.choices.map(({ value, label, size }) => <button key={value} type="button" aria-pressed={props.selectedQuality === value} onClick={() => props.setSelectedQuality(value)} className={`rounded-lg px-2 py-2 text-xs transition-colors ${props.selectedQuality === value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 dark:bg-white/5'}`}>
          <span className="block font-medium">{label}</span><span className="mt-1 block text-[10px] tabular-nums opacity-75">{size.replace('x', ' × ')} px</span>
        </button>)}</div>}
    </fieldset>
    <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">显示当前模型的请求尺寸，实际原图以服务商返回为准。{isGrid ? '整图拆为 4 张，每张获得四分之一像素；精细商品建议单张逐镜。' : props.selectedShotCount === 8 ? '前 4 镜沿用母本，后 4 镜扩展场景、动作与机位；采用后可每四镜提炼为新母本。' : '每镜独立使用商品图与对应母本原图生成。'}</p>
    {isGrid && <details className="rounded-xl border border-slate-200 p-3 dark:border-white/10" open={props.gridOutputSize ? true : undefined}>
      <summary className="cursor-pointer text-xs font-medium">切图交付尺寸 <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{props.gridOutputSize ? `自定义 ${props.gridOutputSize.replace('x', ' × ')} px` : '默认按原图四等分'}</span></summary>
      <WorkshopGridOutputSettings {...props} />
    </details>}
    <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-slate-50 p-3 dark:bg-white/5"><input type="checkbox" checked={props.autoGenerateCopywriting} onChange={event => props.setAutoGenerateCopywriting(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-indigo-600" />
      <span className="text-xs font-medium">成图后自动生成文案<span className="mt-1 block text-[11px] font-normal leading-5 text-slate-500 dark:text-slate-400">为已有有效成图且缺少完整文案的商品生成标题与正文，会调用文本模型。关闭后可在交付页手动生成。</span></span>
    </label>
  </section>;
}

export function WorkshopModelSettings(props: WorkshopSettingsModalProps) {
  return <section className="py-5" aria-label="生成模型">
    <h3 className="mb-3 text-sm font-semibold">生成模型</h3>
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <span className={labelClass}>视觉分析模型</span>
        <ConfiguredModelPicker
          ariaLabel="视觉分析模型"
          options={props.availableVisionModels}
          value={props.selectedVisionModel}
          onChange={props.setSelectedVisionModel}
          modalityKind="chat"
          isUp={false}
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <span className={labelClass}>图片生成模型</span>
        <ConfiguredModelPicker
          ariaLabel="图片生成模型"
          options={props.availableImageModels}
          value={props.selectedImageGenModel}
          onChange={props.setSelectedImageGenModel}
          modalityKind="image"
          isUp={false}
        />
      </div>
    </div>
    <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">视觉模型用于新分析；图片模型用于后续生图。文案优先沿用视觉模型，官方 OpenAI 通道会使用可用的文案通道。</p>
  </section>;
}

export function WorkshopExecutionSettings(props: WorkshopSettingsModalProps) {
  return <section className="py-4" aria-label="高级执行设置"><details>
    <summary className="cursor-pointer text-xs font-semibold">高级执行设置 <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">分析 {props.analyzeConcurrency} · 生图 {props.imageGenConcurrency} 并发</span></summary>
    <div className="mt-3 grid grid-cols-2 gap-5">
      <label className={labelClass}>分析与文案并发<select aria-label="分析与文案并发" value={props.analyzeConcurrency} disabled={!props.setAnalyzeConcurrency} onChange={event => props.setAnalyzeConcurrency?.(Number(event.target.value))} className={selectClass}>{WORKSHOP_ANALYSIS_CONCURRENCY.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className={labelClass}>生图并发<select aria-label="生图并发" value={props.imageGenConcurrency} disabled={!props.setImageGenConcurrency} onChange={event => props.setImageGenConcurrency?.(Number(event.target.value))} className={selectClass}>{WORKSHOP_IMAGE_CONCURRENCY.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    </div>
    <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">并发只控制同时执行的任务数，不改变画质。限流或失败较多时请降低；此设置在本机共用，不随批次保存。</p>
  </details></section>;
}
