import type { WorkshopSnapshot } from '@shared/contracts/workshopWorkspace';
import { audienceOptions } from '@shared/domain/assets/appearanceAudience';
import { isAppearanceRotation, parseAppearanceSelection } from '@shared/domain/assets/appearanceSelection';
import { WorkshopGroupFolderPicker } from '../WorkshopGroupFolderPicker';

function historicAppearance(value: string, outfit = false) {
  if (!isAppearanceRotation(value)) return value;
  const selection = parseAppearanceSelection(value, outfit);
  const labels = audienceOptions(outfit).filter(option => selection.audiences.includes(option.id)).map(option => option.label);
  return `历史轮换范围：${labels.join('、') || '未指定人群'}${selection.ids ? `（指定 ${selection.ids.length} 项）` : ''}`;
}

/** Read-only provenance for pre-skill batches; never restores production locks. */
export function WorkshopAssetBindings({ snapshot }: { snapshot: WorkshopSnapshot }) {
  const { settings, items } = snapshot;
  const historic = items.filter(item => item.appliedFullPromptId || item.prompts.some(shot => shot.assembly_source === 'group_skeleton'));
  const fixed = (value?: string) => Boolean(value && value !== 'auto');
  if (!historic.length && ![settings.lockedFullPromptId, settings.promptGroupFolderId, settings.lockedPersonaId, settings.lockedSceneId, settings.lockedOutfitId].some(fixed)) return null;
  const labels = [
    ['参考图组', [...new Set(historic.map(item => String(item.appliedFullPromptTitle || item.appliedFullPromptId || '历史参考图组')))].join('、') || settings.lockedFullPromptId],
    ['人物替换', historicAppearance(settings.lockedPersonaId)], ['穿搭替换', historicAppearance(settings.lockedOutfitId, true)], ['场景替换', settings.lockedSceneId],
  ].filter(([, value]) => value && value !== 'auto');
  return <details className="rounded-xl border border-slate-200 bg-white/80 p-4 text-xs dark:border-white/10 dark:bg-[#18191c]/80">
    <summary className="cursor-pointer font-medium">旧批次素材记录（仅供追溯）</summary>
    <p className="mt-3 leading-6 text-slate-500 dark:text-slate-400">保留本批次原始参考记录；继续创作时按商品图与创作技能重新分析，历史素材选择不参与新生产。</p>
    <dl className="mt-3 space-y-2">{labels.map(([label, value]) => <div key={label} className="flex gap-3"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 break-all">{value}</dd></div>)}</dl>
    {fixed(settings.promptGroupFolderId) && <WorkshopGroupFolderPicker folderId={settings.promptGroupFolderId} />}
  </details>;
}
