import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { Check, Crop, Images, Sparkles } from 'lucide-react';
import type { WorkshopSettingsModalProps } from './workshopSettingsTypes';
import { WorkshopGridOutputSettings } from './WorkshopGridOutputSettings';
import { workshopOutputSettings, WORKSHOP_ANALYSIS_CONCURRENCY, WORKSHOP_IMAGE_CONCURRENCY } from '../../model/workshopOutputSettings';
import { savedWorkshopOutputSize } from '../../model/generation/generationHelpers';

const selectClass = 'mt-2 w-full min-w-0 rounded-lg border border-slate-200/70 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]';
const labelClass = 'block min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-200';

export function WorkshopContentSettings(props: WorkshopSettingsModalProps) {
  const { skillLoadState = 'ready', recipes } = props;
  const automatic = props.selectedArchId === 'auto' || props.selectedArchId === '__category_skill__';
  const manualRecipes = recipes.filter(recipe => recipe.id !== '__category_skill__');
  const selected = recipes.find(recipe => recipe.id === props.selectedArchId);
  const selectedId = automatic ? 'auto' : selected?.id || '';
  return <section className="space-y-3 py-4" aria-label="创作技能">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">创作技能</h3><span className="text-[11px] text-slate-500">{automatic ? '按商品细分匹配' : '当前批次指定'}</span></div>
    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">根据商品图与创作技能设计分镜。人物、穿搭、场景由技能和商品决定；参考素材用于学习技能，生产无需采集或指定参考素材。</p>
    {(manualRecipes.length > 0 || !automatic) && <label className={labelClass}>当前技能
      <select aria-label="电商图文技能" value={selectedId} disabled={skillLoadState === 'loading'} onChange={event => props.setSelectedArchId(event.target.value)} className={selectClass}>
        {!selectedId && <option value="" disabled>所选技能已失效，请重新选择</option>}
        <option value="auto">按商品细分应用创作技能</option>
        {manualRecipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
      </select>
    </label>}
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-3 dark:bg-white/5 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role={skillLoadState === 'error' ? 'alert' : 'status'} className={`text-xs ${skillLoadState === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
          {skillLoadState === 'loading' ? '正在加载创作技能…' : skillLoadState === 'error' ? `技能加载失败：${props.skillLoadError || '请重试'}` : !recipes.length ? '暂无可用创作技能，请刷新后重试' : automatic ? '自动使用当前试用版或正式版；未提炼的细分使用基础创作技能' : selected?.name || '所选技能已失效，请重新选择'}
        </p>
        <div className="flex gap-3 text-xs font-medium">
          <button type="button" onClick={props.onReloadSkills} disabled={skillLoadState === 'loading' || !props.onReloadSkills} className="text-slate-500 hover:text-indigo-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-indigo-300">刷新技能</button>
          <button type="button" onClick={() => props.onOpenAssets?.()} disabled={!props.onOpenAssets} className="text-slate-700 disabled:opacity-50 dark:text-slate-200">管理创作技能 ↗</button>
        </div>
      </div>
    </div>
  </section>;
}

export function WorkshopOutputSettings(props: WorkshopSettingsModalProps) {
  const isGrid = props.generationStrategy === 'grid_first';
  const output = workshopOutputSettings(props.selectedImageGenModel, props.selectedAspect, props.selectedQuality);
  const tileSize = props.gridOutputSize || savedWorkshopOutputSize({ gridSize: output.size });
  const deliveryCount = isGrid ? 4 : props.selectedShotCount;
  const deliverySize = isGrid ? tileSize || output.size : output.size;
  return <section className="workshop-output-settings space-y-5 py-5" aria-label="图片输出">
    <div className="flex items-start justify-between gap-4">
      <div><h3 className="text-sm font-semibold">图片输出</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">先确定生成方式，再调整画幅与清晰度。</p></div>
      <div className="workshop-output-summary shrink-0" aria-label="当前输出摘要"><Images className="h-4 w-4" /><span>{deliveryCount} 张</span><i aria-hidden="true" /> <span>{deliverySize?.replace('x', ' × ')} px</span></div>
    </div>
    <fieldset><legend className="workshop-settings-label">生成方式</legend><div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {([['grid_first', '四宫格拆图', '一次生成整图，自动拆成 4 张', <Crop key="crop" />], ['single_shot', '单张逐镜', '每镜独立生成，可选 4 或 8 镜', <Sparkles key="sparkles" />]] as const).map(([strategy, title, description, icon]) => {
        const selected = props.generationStrategy === strategy;
        return <button type="button" key={strategy} aria-label={title} aria-pressed={selected} onClick={() => props.setGenerationStrategy(strategy)} className={`workshop-output-mode ${selected ? 'is-selected' : ''}`}>
          <span className="workshop-output-mode-icon">{icon}</span><span className="min-w-0 flex-1"><strong>{title}{strategy === 'grid_first' && <em>默认</em>}</strong><small>{description}</small></span><span className="workshop-output-mode-check" aria-hidden="true">{selected && <Check />}</span>
        </button>;
      })}
    </div></fieldset>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className={labelClass}>分镜数量
        {isGrid ? <span className="workshop-output-static mt-2"><span>固定 4 镜</span><small>四格分别对应一个完整机位</small></span> : <select aria-label="分镜数量" value={props.selectedShotCount} onChange={event => props.setSelectedShotCount(Number(event.target.value))} className={selectClass}>
          {[4, 8].map(count => <option key={count} value={count}>{count} 镜{count === 8 ? ' · 完整创作' : ''}</option>)}
        </select>}
      </label>
      <label className={labelClass}>{isGrid ? '整图画幅' : '图片画幅'}
        <select aria-label="图片画幅" value={props.selectedAspect} onChange={event => props.setSelectedAspect(event.target.value as WorkshopSettingsModalProps['selectedAspect'])} className={selectClass}>
          {(['3:4', '1:1', '9:16', '16:9'] as const).map(aspect => <option key={aspect}>{aspect}</option>)}
        </select>
      </label>
    </div>
    <fieldset aria-label="画质档位"><legend className="workshop-settings-label">{isGrid ? '整图画质与请求尺寸' : '单张画质与请求尺寸'}</legend>
      {output.fixedQuality ? <p className="workshop-output-fixed mt-2"><Check className="h-4 w-4" />当前模型使用固定档位<span>{output.size.replace('x', ' × ')} px</span></p>
        : <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">{output.choices.map(({ value, label, size }) => { const selected = props.selectedQuality === value; return <button key={value} type="button" aria-pressed={selected} onClick={() => props.setSelectedQuality(value)} className={`workshop-quality-option ${selected ? 'is-selected' : ''}`}>
          <span>{label}</span><strong>{size.replace('x', ' × ')}</strong><small>请求尺寸 · px</small>{selected && <Check className="workshop-quality-check" />}
        </button>; })}</div>}
    </fieldset>
    <p className="workshop-output-note">{isGrid ? `预计交付 4 张 · 每张 ${tileSize?.replace('x', ' × ')} px${props.gridOutputSize ? '（自定义）' : '（原图四等分）'}。` : props.selectedShotCount === 8 ? '按技能设计 8 个完整分镜，安排展示递进与画面差异。' : '每镜独立使用商品图与已确认的技能提示词生成。'} 实际原图以服务商返回为准。</p>
    {isGrid && <details className="workshop-output-details rounded-xl border border-slate-200 p-3 dark:border-white/10" open={props.gridOutputSize ? true : undefined}>
      <summary className="cursor-pointer text-xs font-medium">切图交付尺寸 <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{props.gridOutputSize ? `自定义 ${props.gridOutputSize.replace('x', ' × ')} px` : '默认四等分 · 可调整'}</span></summary>
      <WorkshopGridOutputSettings {...props} />
    </details>}
    <label className="workshop-copywriting-toggle flex cursor-pointer items-start gap-3 rounded-xl p-3.5"><input type="checkbox" checked={props.autoGenerateCopywriting} onChange={event => props.setAutoGenerateCopywriting(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600" />
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
