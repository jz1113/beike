import { posterInputError, type PosterItem } from './posterTypes';

export type PosterRunMode = 'all' | 'design' | 'render';
export function needsPosterRecovery(item: PosterItem): boolean {
  return Boolean(item.imageTaskId || item.generatedSceneUrl || item.generationRecoveryRequired);
}
export function hasPosterDesign(item: PosterItem): boolean {
  return Boolean(item.prompt?.trim() && item.designPlan && item.coverTitle
    && item.designPlan.titleLines.join('') === item.coverTitle);
}
export function canEditPosterInput(item: PosterItem): boolean {
  return !needsPosterRecovery(item) && item.status !== 'complete'
    && !['rewriting', 'prompting', 'rendering'].includes(item.status);
}
export function posterQueue(items: PosterItem[], mode: PosterRunMode, onlyFailed = false): PosterItem[] {
  return items.filter(item => {
    if (item.status === 'complete' || ['rewriting', 'prompting', 'rendering'].includes(item.status)) return false;
    if (onlyFailed && item.status !== 'failed') return false;
    if (!onlyFailed && mode === 'all' && !['idle', 'interrupted'].includes(item.status)) return false;
    if (mode === 'design') return !needsPosterRecovery(item) && !hasPosterDesign(item) && !posterInputError(item);
    if (mode === 'render') return needsPosterRecovery(item) || hasPosterDesign(item) && !posterInputError(item);
    return !item.importError || needsPosterRecovery(item);
  });
}
export function posterWorkflowCounts(items: PosterItem[]) {
  return {
    total: items.length,
    complete: items.filter(item => item.status === 'complete').length,
    failed: items.filter(item => item.status === 'failed').length,
    invalid: items.filter(item => !needsPosterRecovery(item) && Boolean(posterInputError(item))).length,
    design: posterQueue(items, 'design').length,
    render: posterQueue(items, 'render').length,
    recovery: items.filter(item => item.status !== 'complete' && needsPosterRecovery(item)).length,
    ready: items.filter(item => item.status !== 'complete' && hasPosterDesign(item) && !needsPosterRecovery(item)).length,
    active: items.filter(item => ['rewriting', 'prompting', 'rendering'].includes(item.status)).length,
  };
}

export type PosterInputEdit = Pick<PosterItem, 'originalTitle' | 'productName' | 'format' | 'sourceImageUrl' | 'memorySampleId'>;
export function editedPosterInput(item: PosterItem, edit: PosterInputEdit): PosterItem {
  if (!canEditPosterInput(item)) throw new Error('请先核对原任务；成品保留在交付页，重新制作请新建批次。');
  const next = { ...item, ...edit, originalTitle: edit.originalTitle.trim(), productName: edit.productName.trim(), sourceImageUrl: edit.sourceImageUrl.trim(), importError: undefined };
  const error = posterInputError(next);
  if (error) throw new Error(error);
  if (next.originalTitle === item.originalTitle && next.productName === item.productName && next.sourceImageUrl === item.sourceImageUrl && next.format.id === item.format.id && next.memorySampleId === item.memorySampleId) return item;
  return { ...next, coverTitle: next.originalTitle, isTitleEdited: false, status: 'idle', error: undefined,
    prompt: undefined, designPlan: undefined, promptVersion: undefined, memoryUsageId: undefined,
    memoryRevisionId: undefined, memoryEntryIds: undefined, memoryWarning: undefined, imageSubmissionKey: undefined };
}
