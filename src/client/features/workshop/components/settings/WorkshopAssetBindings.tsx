import { WorkshopAppearanceSelection } from './WorkshopAppearanceSelection';
import { isAppearanceRotation } from '@shared/domain/assets/appearanceSelection';
import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import { isPromptGroupSubcategory, PROMPT_GROUP_SUBCATEGORY_LABELS } from '@shared/domain/assets/promptGroupSubcategory';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import { filterPromptGroupsByFolder, promptGroupSourceFolders } from '@shared/domain/assets/promptGroupFolders';
import { uniqueSceneAssets } from '@shared/domain/assets/scenePresentation';
import type { PromptAssetType } from '@shared/domain/prompts/prompt-asset/states';
import { eligiblePromptGroups, isAutoPromptGroupSelection, parseGroupShotSkeleton, promptGroupAppearance, promptGroupAppearanceFilter, promptGroupCategoryFit, promptGroupDeclaredSubcategoryConflict, promptGroupExplicitMajorCategoryConflict, promptGroupExplicitSubcategoryConflict, promptGroupMatchesMajorCategory } from '@shared/domain/workshop/workshop-pipeline';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { WorkshopAssetLockRow, type WorkshopAssetLockOption } from './WorkshopAssetLockRow';
import { WorkshopGroupFolderPicker } from '../WorkshopGroupFolderPicker';

type GroupOption = WorkshopAssetLockOption & {
  shotPromptsJson?: string;
  hasHuman?: boolean;
  displayNumber?: number | null;
  coverUrl?: string | null;
  albumName?: string | null;
  productCategoryIds?: string | null;
  productCategoryNames?: string[] | null;
  productSubcategory?: string | null;
  productSubcategoryName?: string | null;
  isUniversal?: boolean;
};

type GroupProduct = { title: string; props?: Record<string, string> };
type GroupPickerOption = {
  id: string;
  label: string;
  searchText: string;
  coverUrl: string | null;
  displayNumber: number | null;
  disabled: boolean;
  reason?: string;
};

function groupProductConflict(group: GroupOption, product: GroupProduct): string | null {
  return promptGroupDeclaredSubcategoryConflict(group)
    || promptGroupExplicitMajorCategoryConflict(group, product.title, product.props)
    || promptGroupExplicitSubcategoryConflict(group, product.title, product.props)
    || (promptGroupCategoryFit(group, product.title, product.props) > 0 ? null : '母组内容与商品品类或细分不匹配');
}

function groupSubcategoryLabel(group: GroupOption): string {
  if (group.productSubcategoryName) return group.productSubcategoryName;
  return isPromptGroupSubcategory(group.productSubcategory)
    ? PROMPT_GROUP_SUBCATEGORY_LABELS[group.productSubcategory] : '';
}

function groupAppearanceLabel(group: GroupOption): string {
  const appearance = promptGroupAppearance(group);
  return appearance === 'human' ? '含人物镜头'
    : appearance === 'product' ? '全组无人物（可仅手部）'
      : '出镜类型待判定';
}

function WorkshopGroupPicker({ value, onChange, groups, products, noPeople, scopeKnown, selectedOutsideScope }: {
  value: string;
  onChange: (id: string) => void;
  groups: GroupOption[];
  products: GroupProduct[];
  noPeople: boolean;
  scopeKnown: boolean;
  selectedOutsideScope?: GroupOption;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const reviewedGroups = groups.filter(item => !promptGroupDeclaredSubcategoryConflict(item));
  const portraitCount = reviewedGroups.filter(item => promptGroupAppearance(item) === 'human').length;
  const productCount = reviewedGroups.filter(item => promptGroupAppearance(item) === 'product').length;
  const { autoCounts, humanCounts, productCounts, conflicts } = useMemo(() => ({
    autoCounts: products.map(product => eligiblePromptGroups(reviewedGroups, product.title, product.props, noPeople ? 'product' : undefined).length),
    humanCounts: products.map(product => eligiblePromptGroups(reviewedGroups, product.title, product.props, 'human').length),
    productCounts: products.map(product => eligiblePromptGroups(reviewedGroups, product.title, product.props, 'product').length),
    conflicts: new Map(groups.map(group => [group.id, promptGroupDeclaredSubcategoryConflict(group)
      || products.map(product => groupProductConflict(group, product)).find(Boolean) || null])),
  }), [groups, reviewedGroups, products, noPeople]);
  const countLabel = (counts: number[]) => {
    if (!counts.length) return scopeKnown ? '采集商品后按细分匹配' : '待商品匹配';
    const low = Math.min(...counts);
    const high = Math.max(...counts);
    return counts.length === 1 ? `当前商品可用 ${low} 组` : `每款可用 ${low === high ? low : `${low}–${high}`} 组`;
  };
  const availableToLock = groups.filter(group => (!noPeople || promptGroupAppearance(group) === 'product') && !conflicts.get(group.id)).length;
  const groupNumberMap = useMemo(() => new Map(groups.map((item, idx) => [item.id, idx + 1])), [groups]);
  const fixedOptions: GroupPickerOption[] = groups.filter(group => products.length > 0 || group.id === value).map(group => {
      const subcategory = groupSubcategoryLabel(group);
      const localNumber = group.displayNumber ?? groupNumberMap.get(group.id) ?? null;
      return {
        id: group.id,
        label: `${fullPromptGroupLabel(localNumber)}${group.productCategoryNames?.length ? ` · ${group.productCategoryNames.join('、')}` : ''}${subcategory ? ` / ${subcategory}` : ''} · ${groupAppearanceLabel(group)}`,
        searchText: `${group.title || ''} ${group.albumName || ''} ${(group.productCategoryNames || []).join(' ')} ${subcategory}`,
        coverUrl: group.coverUrl || null,
        displayNumber: localNumber,
        disabled: products.length === 0 || (noPeople && promptGroupAppearance(group) !== 'product') || Boolean(conflicts.get(group.id)),
        reason: products.length === 0 ? conflicts.get(group.id) || '请先采集商品，再核对二级类目' : noPeople && promptGroupAppearance(group) !== 'product' ? '当前设置为无人像出镜' : conflicts.get(group.id) || undefined,
      };
    }).filter(option => !option.disabled || option.id === value);
  const options: GroupPickerOption[] = [
    { id: 'auto', label: `自动轮换 · ${noPeople ? '全组无人物' : '全部图组'}（${countLabel(autoCounts)}）`, searchText: '全部', coverUrl: null, displayNumber: null, disabled: false, reason: scopeKnown && reviewedGroups.length === 0 ? '当前架构下没有可用母本，分析前需补充' : autoCounts.some(count => count === 0) ? '本批次有商品没有适配的完整母本，分析前需补充' : undefined },
    ...(!noPeople || value === 'auto:human' ? [{ id: 'auto:human', label: `自动轮换 · 含人物镜头（${countLabel(humanCounts)}）`, searchText: '有人物 模特', coverUrl: null, displayNumber: null, disabled: noPeople || (scopeKnown && portraitCount === 0) || humanCounts.some(count => count === 0), reason: noPeople ? '当前设置为无人像出镜' : scopeKnown && portraitCount === 0 ? '当前架构下没有含人物母本' : humanCounts.some(count => count === 0) ? '本批次有商品没有适配的含人物母本' : undefined }] : []),
    { id: 'auto:product', label: `自动轮换 · 全组无人物，可仅手部（${countLabel(productCounts)}）`, searchText: '无人物 仅手部', coverUrl: null, displayNumber: null, disabled: (scopeKnown && productCount === 0) || productCounts.some(count => count === 0), reason: scopeKnown && productCount === 0 ? '当前架构下没有无人物母本' : productCounts.some(count => count === 0) ? '本批次有商品没有适配的无人物母本' : undefined },
    ...(selectedOutsideScope ? [{
      id: selectedOutsideScope.id,
      label: `${fullPromptGroupLabel(selectedOutsideScope.displayNumber)} · 不属于当前母本范围`,
      searchText: selectedOutsideScope.title || '',
      coverUrl: selectedOutsideScope.coverUrl || null,
      displayNumber: selectedOutsideScope.displayNumber || null,
      disabled: true,
      reason: '请重新选择当前文件夹与工坊技能内的母本',
    }] : []),
    ...fixedOptions,
  ];
  const selected = options.find(option => option.id === value);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const numberQuery = /^(?:组\s*)?(\d+)$/.exec(normalizedQuery);
  let visibleOptions = options;
  if (numberQuery) {
    visibleOptions = options.filter(option => option.displayNumber === Number(numberQuery[1]));
  } else if (normalizedQuery) {
    visibleOptions = options.filter(option => `${option.label} ${option.searchText}`.toLocaleLowerCase().includes(normalizedQuery));
  }

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return <div ref={rootRef}>
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-xs font-semibold text-slate-800 dark:text-slate-100">图组母本</span>
      <div className="flex items-center gap-2.5 text-[11px]">
        <span className="text-slate-400">{products.length ? `本批次可固定 ${availableToLock} / ${groups.length} 组` : scopeKnown ? `范围内 ${groups.length} 组 · 待商品匹配` : '添加商品后筛选母本'}</span>
      </div>
    </div>
    <div className="mt-2">
      <button ref={triggerRef} type="button" aria-label={`图组母本：${selected?.label || '原选择已失效，请重新选择'}`}
        aria-expanded={open} aria-controls={panelId} onClick={() => { setQuery(''); setOpen(!open); }}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-semibold text-slate-800 outline-none hover:border-indigo-300 focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-100 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]">
        <span className="truncate">{selected?.label || '原选择已失效，请重新选择'}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </div>
    {open && <div id={panelId} className="mt-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-[#18191c]">
      <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 text-slate-400 dark:border-white/10">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <input ref={searchRef} type="search" aria-label="搜索图组母本" placeholder="搜索组号、分类或图组内容" value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && visibleOptions[0]) {
              event.preventDefault();
              const first = visibleOptions.find(option => !option.disabled);
              if (first) choose(first.id);
            }
          }}
          className="min-w-0 flex-1 bg-transparent py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500" />
      </div>
      <ul className="mt-2 max-h-60 space-y-0.5 overflow-y-auto" aria-label="可选图组母本">
        {visibleOptions.map(option => <li key={option.id}>
          <button type="button" onClick={() => choose(option.id)} disabled={option.disabled} aria-current={option.id === value ? 'true' : undefined}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-amber-700 dark:disabled:text-amber-300 dark:hover:bg-white/5 ${option.id === value ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>
            {option.coverUrl && <img src={option.coverUrl} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded object-cover" />}
            <span className="min-w-0 flex-1"><span className="block">{option.label}</span>{option.reason && <span className="mt-0.5 block text-[10px] text-amber-700 dark:text-amber-300">{option.reason}</span>}</span>
            {option.id === value && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
        </li>)}
        {visibleOptions.length === 0 && <li className="px-2 py-3 text-center text-xs text-slate-500 dark:text-slate-400">{scopeKnown ? '当前架构或商品没有匹配的图组' : '添加商品后显示可选母本'}</li>}
      </ul>
    </div>}
  </div>;
}

export function WorkshopAssetBindings(props: {
  groupId: string; onGroupChange: (id: string) => void; groups: GroupOption[];
  personaId: string; onPersonaChange: (id: string) => void; personas: WorkshopAssetLockOption[];
  sceneId: string; onSceneChange: (id: string) => void; scenes: WorkshopAssetLockOption[];
  outfitId: string; onOutfitChange: (id: string) => void; outfits: WorkshopAssetLockOption[];
  products?: GroupProduct[];
  architectureMajor?: 'digital' | 'jewelry';
  categories?: AssetProductCategory[];
  folderId?: string;
  onFolderChange?: (id: string) => void;
  personaMode?: 'asset_driven' | 'none';
  onOpenAssets?: (type?: PromptAssetType) => void;
}) {
  const group = props.groups.find((item) => item.id === props.groupId);
  const architectureMajor = props.architectureMajor;
  const categories = props.categories || [];
  const folderId = props.folderId || 'auto';
  const architectureGroups = architectureMajor
    ? props.groups.filter(item => promptGroupMatchesMajorCategory(item, architectureMajor)) : props.groups;
  const scopedGroups = filterPromptGroupsByFolder(architectureGroups, categories, folderId);
  const folders = promptGroupSourceFolders(categories).filter(folder => !architectureMajor || promptGroupMatchesMajorCategory({
    productCategoryIds: JSON.stringify([folder.majorId]), productCategoryNames: [folder.majorName],
  }, architectureMajor));
  const invalidFolder = folderId !== 'auto' && !folders.some(folder => folder.id === folderId);
  const groupOutsideScope = Boolean(group && !scopedGroups.some(item => item.id === group.id));
  const scopeKnown = Boolean(architectureMajor || folderId !== 'auto' || props.products?.length);
  const fixedGroupConflict = group && (promptGroupDeclaredSubcategoryConflict(group)
    || props.products?.map(product => groupProductConflict(group, product)).find(Boolean));
  const shots = parseGroupShotSkeleton(group?.shotPromptsJson);
  const automatic = isAutoPromptGroupSelection(props.groupId);
  const appearance = group ? promptGroupAppearance(group) : undefined;
  const noPeople = props.personaMode === 'none';
  const filter = noPeople ? 'product' : promptGroupAppearanceFilter(props.groupId);
  const incompatibleGroupSelection = noPeople && (props.groupId === 'auto:human' || Boolean(group && appearance !== 'product'));
  const reviewedGroups = scopedGroups.filter(item => !promptGroupDeclaredSubcategoryConflict(item));
  const portraitCount = reviewedGroups.filter(item => promptGroupAppearance(item) === 'human').length;
  const productCount = reviewedGroups.filter(item => promptGroupAppearance(item) === 'product').length;
  const candidatePools = automatic && !incompatibleGroupSelection ? (props.products || []).map(product =>
    eligiblePromptGroups(reviewedGroups, product.title, product.props, filter)) : [];
  const candidateCounts = candidatePools.map(pool => pool.length);
  const productsWithPortraitCandidates = candidatePools.filter(pool => pool.some(candidate => promptGroupAppearance(candidate) === 'human')).length;
  const candidateSummary = candidateCounts.length === 1
    ? `当前商品可轮询 ${candidateCounts[0]} 组`
    : candidateCounts.length > 1
      ? `当前批次 ${candidateCounts.length} 款商品各有 ${Math.min(...candidateCounts)}–${Math.max(...candidateCounts)} 组候选`
      : '';
  const hasPortrait = !noPeople && (automatic ? filter !== 'product' : appearance === 'human');
  const appearanceSelected = props.personaId !== 'auto' || props.outfitId !== 'auto';
  const visibleScenes = uniqueSceneAssets(props.scenes, props.sceneId);
  const replacementCount = Number(props.sceneId !== 'auto') + (hasPortrait ? Number(props.personaId !== 'auto') + Number(props.outfitId !== 'auto') : 0);
  const suspendedCount = hasPortrait ? 0 : Number(props.personaId !== 'auto') + Number(props.outfitId !== 'auto');
  const replacementSummary = [replacementCount ? `已替换 ${replacementCount} 项` : '', suspendedCount ? `${suspendedCount} 项暂不生效` : ''].filter(Boolean).join(' · ') || '可选 · 默认沿用母本';
  const groupsNeedingReview = scopedGroups.filter(item => promptGroupDeclaredSubcategoryConflict(item));
  return <section>
    <div className="rounded-lg bg-slate-50/70 p-3 dark:bg-white/5">
      <WorkshopGroupFolderPicker value={folderId} onChange={id => props.onFolderChange?.(id)} folders={folders} categories={categories} groups={architectureGroups} />
      <WorkshopGroupPicker value={props.groupId} onChange={props.onGroupChange} groups={scopedGroups} products={props.products || []} noPeople={noPeople} scopeKnown={scopeKnown} selectedOutsideScope={groupOutsideScope ? group : undefined} />
      {groupsNeedingReview.length > 0 && <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{groupsNeedingReview.slice(0, 4).map(item => fullPromptGroupLabel(item.displayNumber)).join('、')}{groupsNeedingReview.length > 4 ? `等 ${groupsNeedingReview.length} 组` : ''}的文件夹归属与内容不一致，已暂停轮换；请到资产库核对细分文件夹。</p>}
      {scopeKnown && scopedGroups.length === 0 && !invalidFolder && <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">当前文件夹与工坊技能下暂无已发布完整四图母本，请调整文件夹或在资产库补充母本。</p>}
      {invalidFolder
        ? <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">原母本文件夹已删除或与当前工坊技能不符，请重新选择。</p>
        : incompatibleGroupSelection
        ? <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">当前设置为无人像出镜，已锁定的图组含人物镜头或出镜类型待判定，无法用于本批次。请重新选择全组无人物母本或无人物自动轮换。</p>
        : groupOutsideScope
        ? <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">已选母本不属于当前文件夹或工坊技能，请更换图组或调整母本文件夹。</p>
        : fixedGroupConflict
        ? <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">当前固定图组不适配本批次：{fixedGroupConflict}。请更换图组或在资产库核对分类。</p>
        : !automatic && !group
        ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">选定图组已失效或尚未加载，请重新选择。</p>
        : !scopeKnown
        ? <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">先采集商品，系统才能按商品大类和细分匹配图组母本。</p>
        : <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{!props.products?.length
          ? '文件夹数量表示已发布完整母本；采集商品后确认实际候选，再选择固定图组。'
          : group
          ? `本批次全部商品固定使用此${appearance === 'human' ? '含人物镜头' : appearance === 'product' ? '全组无人物' : '出镜类型待判定'}图组。保留逐镜顺序、构图、动作和出镜范围。`
          : `逐款从匹配的${filter === 'human' ? '含人物' : filter === 'product' ? '无人物（可仅手部）' : ''}母本中轮换，用完再重复。${candidateSummary ? `${candidateSummary}。` : ''}`}</p>}
      {automatic && !incompatibleGroupSelection && filter && (filter === 'human' ? portraitCount : productCount) === 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">当前出镜范围没有可用图组，请更换范围或在素材库发布完整四图组。</p>}
      {automatic && candidateCounts.some(count => count === 0) && <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">当前批次有商品找不到适配的完整图组，分析前请更换出镜范围或到资产库补充对应商品类目的母本。</p>}
      {automatic && !filter && appearanceSelected && <p className="mt-2 rounded-md bg-indigo-50 px-2.5 py-2 text-[11px] leading-5 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{candidatePools.length
        ? `当前 ${productsWithPortraitCandidates}/${candidatePools.length} 款商品有含人物母本候选；实际轮到含人物母本时，人物与穿搭替换才会生效。`
        : '人物与穿搭仅在轮到含人物母本时生效。'}全组无人物或待判定母本保持原出镜范围。若每款都需人物，请选“含人物镜头”。{appearanceSelected && candidatePools.length > 0 && productsWithPortraitCandidates === 0 ? ' 当前商品没有可应用人物替换的候选母本。' : ''}</p>}
      {!noPeople && !automatic && appearance === 'unknown' && <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">此母本出镜类型待判定，人物与穿搭暂不应用。请先在素材库修正母版标注。</p>}
      {!hasPortrait && appearanceSelected && appearance !== 'unknown' && <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">当前使用全组无人物母本，已选人物与穿搭暂不生效；切回含人物镜头的母本后会恢复。</p>}
      {shots.length > 0 && <ol className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
        {shots.map((shot, index) => <li key={index} className="truncate" title={shot.title}>{index + 1}. {shot.title || '未命名镜头'} · {shot.shot_type === 'hand_held_only' ? '仅手部' : shot.has_human === true ? '人物' : shot.has_human === false ? '静物' : '待判定'}</li>)}
      </ol>}

    </div>
    <details className="mt-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-[#18191c]" open={replacementCount + suspendedCount > 0 ? true : undefined}>
      <summary className="cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-100">自定义替换 <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{replacementSummary}</span></summary>
    <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">默认保留母本场景、人物与穿搭，仅替换商品。人物与穿搭替换仅作用于含人物镜头，不会给静物或仅手部镜头加人脸。</p>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">替换哪些内容</span>
      {(replacementCount + suspendedCount > 0) && <button type="button" className="text-[11px] text-indigo-600 hover:text-indigo-800 dark:text-indigo-300" onClick={() => {
        props.onPersonaChange('auto'); props.onSceneChange('auto'); props.onOutfitChange('auto');
      }}>重置为沿用母本</button>}
    </div>
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-[#18191c]">
        <WorkshopAssetLockRow label="场景" autoLabel="沿用母本逐镜场景" prefix="S" value={props.sceneId} onChange={props.onSceneChange} options={visibleScenes} onOpenLibrary={() => props.onOpenAssets?.('scene')} />
        {props.sceneId !== 'auto' && <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">应用于全部镜头，并替换原场景光线。</p>}
      </div>
      {hasPortrait && <>
        <WorkshopAppearanceSelection value={props.personaId} onChange={props.onPersonaChange} options={props.personas} onOpenLibrary={() => props.onOpenAssets?.('persona')} />
        <WorkshopAppearanceSelection outfit value={props.outfitId} onChange={props.onOutfitChange} options={props.outfits} onOpenLibrary={() => props.onOpenAssets?.('outfit')} />
      </>}
    </div>
    {suspendedCount > 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
      <p className="font-semibold">已保存的人物与穿搭替换暂不生效</p>
      <p className="mt-1 text-[11px] leading-5">当前母本没有明确的人物镜头；这些选择会保留，切回含人物母本后恢复。</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {props.personaId !== 'auto' && <button type="button" onClick={() => props.onPersonaChange('auto')} className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] dark:bg-[#18191c]">人物：{isAppearanceRotation(props.personaId) ? '范围轮换' : props.personas.find(item => item.id === props.personaId)?.name || '已选资产'} · 清除</button>}
        {props.outfitId !== 'auto' && <button type="button" onClick={() => props.onOutfitChange('auto')} className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] dark:bg-[#18191c]">穿搭：{isAppearanceRotation(props.outfitId) ? '范围轮换' : props.outfits.find(item => item.id === props.outfitId)?.title || '已选资产'} · 清除</button>}
      </div>
    </div>}
    {hasPortrait && <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">人物与穿搭仅用于母本中的人物镜头；仅在勾选范围内轮换，同款人物镜头保持一致。男性仅配男装或通用款；女性可配男装、女装或通用款。年龄段必须匹配，待分类素材不参与。</p>}
    <details className="mt-4 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-white/10">
      <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">查看本批次替换规则</summary>
      <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
        <li>场景：{props.sceneId === 'auto' ? '保留各镜头原场景与光线。' : `所有镜头替换为「${props.scenes.find(item => item.id === props.sceneId)?.title || '所选场景'}」，使用新场景光线。`}</li>
        <li>人物：{!hasPortrait ? '当前母本无明确人物镜头，不应用人物替换。' : isAppearanceRotation(props.personaId) ? '仅有人物镜头的母本轮换兼容人物，同款人物镜头保持一致。' : props.personaId === 'auto' ? '人物镜头保留母本人物。' : `人物镜头统一使用「${props.personas.find(item => item.id === props.personaId)?.name || '所选人物'}」，静物与仅手部镜头不加人脸。`}</li>
        <li>穿搭：{!hasPortrait ? '当前母本无明确人物镜头，不应用穿搭替换。' : isAppearanceRotation(props.outfitId) ? '仅有人物镜头的母本按人物性别和年龄段轮换穿搭，男性不匹配女装。' : props.outfitId === 'auto' ? '人物镜头保留母本穿搭。' : `人物镜头统一使用「${props.outfits.find(item => item.id === props.outfitId)?.title || '所选穿搭'}」，不改变原镜头出镜范围。`}</li>
      </ul>
    </details>
    <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">修改后需重新分析提示词并生成图片，已有图片不会改变。</p>
    </details>
  </section>;
}
