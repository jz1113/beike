import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { emptySalesCollection, parseSalesCollection, type SalesCollectionState } from './salesCollectionDraft';

export interface SalesCanvasScope { projectId: string; initialDraft?: unknown }
const keyFor = (id: string) => {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('视频画布项目标识无效');
  return `beike.video_sales.canvas.v1.${getWorkspaceSecret()}.${id}`;
};

/** Never falls back to the active legacy draft: copying is explicit and snapshot based. */
export function readSalesCanvasDraft(scope: SalesCanvasScope): SalesCollectionState {
  const raw = localStorage.getItem(keyFor(scope.projectId));
  if (raw !== null) {
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error('本项目视频草稿无法读取，原始内容已保留，请从项目备份恢复'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('本项目视频草稿格式异常，原始内容已保留');
    return parseSalesCollection(value);
  }
  return scope.initialDraft === undefined ? emptySalesCollection() : parseSalesCollection(structuredClone(scope.initialDraft));
}

export function writeSalesCanvasDraft(scope: SalesCanvasScope, state: SalesCollectionState): void {
  localStorage.setItem(keyFor(scope.projectId), JSON.stringify(parseSalesCollection(state)));
}
