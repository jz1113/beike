import type { WorkshopSettingsModalProps } from './workshopSettingsTypes';
import { WorkshopGridOutputSettings } from '../WorkshopGridOutputSettings';
import { WorkshopAssetBindings } from '../WorkshopAssetBindings';
import { recipeKind } from '@shared/domain/products/productRecipeSelection';
import { promptGroupMatchesMajorCategory } from '@shared/domain/workshop/workshop-pipeline';

const selectClass = 'mt-2 w-full min-w-0 rounded-lg border border-slate-200/70 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]';
const labelClass = 'block min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-200';

export function WorkshopContentSettings(props: WorkshopSettingsModalProps) {
  const { assetLoadState = 'ready', availableFullPrompts = [], availableProductCategories = [], availablePersonas = [], availableScenes = [], availableOutfits = [] } = props;
  const hasRecipes = props.recipes.length > 0;
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
    <label className={labelClass}>工坊技能
      <select aria-label="工坊技能" value={selectedArchId} disabled={!hasRecipes} onChange={event => props.setSelectedArchId(event.target.value)} className={selectClass}>
        {!selectedArchId && <option value="" disabled>{hasRecipes ? '请选择工坊技能' : '暂无可用工坊技能'}</option>}
        {hasRecipes && <option value="auto">自动按商品类目匹配</option>}
        {props.recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
      </select>
    </label>
    {hasRecipes && selectedArchId === 'auto' && <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">混合批次会逐款匹配工坊技能；无法匹配的商品会阻止分析。</p>}
    {!hasRecipes && <p role="status" className="text-xs leading-5 text-amber-700">暂未加载到可用工坊技能。请到“工坊技能”页检查、同步或新建后重试。</p>}
    <section className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-3.5 dark:bg-white/5 dark:border-white/10" aria-label="生产资源状态">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role={assetLoadState === 'error' ? 'alert' : 'status'} className={`text-xs ${assetLoadState === 'error' ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
          {assetLoadState === 'loading' ? '正在加载素材…' : assetLoadState === 'error' ? `加载失败：${props.assetLoadError || '请重试'}` : inventoryMessage}
        </p>
        <div className="flex gap-3 text-xs font-medium">
          <button type="button" onClick={props.onReloadAssets} disabled={assetLoadState === 'loading' || !props.onReloadAssets} className="text-slate-500 hover:text-indigo-600 disabled:opacity-50 dark:text-slate-400">刷新</button>
          <button type="button" onClick={() => props.onOpenAssets?.()} disabled={!props.onOpenAssets} className="text-indigo-600 disabled:opacity-50">管理素材 ↗</button>
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
  return <section className="py-5" aria-label="生成偏好">
    <h3 className="mb-3 text-sm font-semibold">生成偏好</h3>
    <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
      <label className={labelClass}>生成方式
        <select aria-label="生成方式" value={props.generationStrategy} className={selectClass} onChange={event => {
          const value = event.target.value as WorkshopSettingsModalProps['generationStrategy'];
          if (value === 'grid_first') props.setSelectedShotCount(4);
          props.setGenerationStrategy(value);
        }}><option value="grid_first">四宫格拆分</option><option value="single_shot">单张逐镜</option></select>
      </label>
      <label className={labelClass}>分镜数量
        <select aria-label="分镜数量" value={props.selectedShotCount} disabled={isGrid} onChange={event => props.setSelectedShotCount(Number(event.target.value))} className={selectClass}>
          {(isGrid ? [4] : [4, 8]).map(count => <option key={count} value={count}>{count} 镜{count === 8 ? ' · 生成衍生母组' : ''}</option>)}
        </select>
      </label>
      <label className={labelClass}>{isGrid ? '整图画幅' : '图片画幅'}
        <select aria-label="图片画幅" value={props.selectedAspect} onChange={event => props.setSelectedAspect(event.target.value as WorkshopSettingsModalProps['selectedAspect'])} className={selectClass}>
          {(['3:4', '1:1', '9:16', '16:9'] as const).map(aspect => <option key={aspect}>{aspect}</option>)}
        </select>
      </label>
      <fieldset><legend className={labelClass}>{isGrid ? '整图质量' : '图片质量'}</legend><div className="mt-2 flex gap-1">
        {([['low', '1K'], ['medium', '2K'], ['high', '4K']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={props.selectedQuality === value} onClick={() => props.setSelectedQuality(value)} className={`flex-1 rounded-lg py-2 text-xs transition-colors ${props.selectedQuality === value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 dark:bg-white/5'}`}>{label}</button>)}
      </div></fieldset>
    </div>
    <p className="mt-3 text-[11px] leading-5 text-slate-400">{isGrid ? '四宫格一次排成四格再裁切，每镜分到整图四分之一的像素；精细商品建议单张逐镜。' : props.selectedShotCount === 8 ? '前 4 镜沿用母组；后 4 镜由模型规划新的场景、动作与机位。生成并采用后，可重新反推为衍生母组。' : '推荐：每镜使用商品图与对应样本独立生成，画质应用于完整单张图片。'}</p>
    {isGrid && <WorkshopGridOutputSettings {...props} />}
  </section>;
}

export function WorkshopExecutionSettings(props: WorkshopSettingsModalProps) {
  return <section className="py-5" aria-label="模型与执行">
    <h3 className="mb-3 text-sm font-semibold">模型与执行</h3>
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <label className={labelClass}>视觉分析模型
        <select aria-label="视觉分析模型" value={props.selectedVisionModel} onChange={event => props.setSelectedVisionModel(event.target.value)} className={selectClass}>
          {props.availableVisionModels.map(model => <option key={model.id} value={model.id}>{model.shortName || model.name || model.id}</option>)}
        </select>
      </label>
      <label className={labelClass}>图片生成模型
        <select aria-label="图片生成模型" value={props.selectedImageGenModel} onChange={event => props.setSelectedImageGenModel(event.target.value)} className={selectClass}>
          {props.availableImageModels.map(model => <option key={model.id} value={model.id}>{model.shortName || model.name || model.id}</option>)}
        </select>
      </label>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500 dark:text-slate-400">
      <label className="flex items-center gap-2">分析并发<select aria-label="分析并发" value={props.analyzeConcurrency} disabled={!props.setAnalyzeConcurrency} onChange={event => props.setAnalyzeConcurrency?.(Number(event.target.value))} className="rounded-lg bg-slate-50 px-2 py-1.5 text-slate-800 dark:text-slate-100 dark:bg-white/5">{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="flex items-center gap-2">生图并发<select aria-label="生图并发" value={props.imageGenConcurrency} disabled={!props.setImageGenConcurrency} onChange={event => props.setImageGenConcurrency?.(Number(event.target.value))} className="rounded-lg bg-slate-50 px-2 py-1.5 text-slate-800 dark:text-slate-100 dark:bg-white/5">{[4, 8, 16, 32, 50].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={props.autoGenerateCopywriting} onChange={event => props.setAutoGenerateCopywriting(event.target.checked)} className="h-3.5 w-3.5 accent-slate-900" />生图后自动生成文案</label>
    </div>
  </section>;
}
