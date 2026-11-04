import type { z } from 'zod';
import type { salesScriptVideoUploadResponseSchema } from '@shared/contracts/salesScripts';
import type { SalesScriptDraftResult } from './salesScriptTypes';

export type SalesScriptImportVideo = z.infer<typeof salesScriptVideoUploadResponseSchema>;
export interface SalesScriptImportItem {
  key: string;
  name: string;
  size: number;
  lastModified: number;
  file?: File;
  status: 'queued' | 'uploading' | 'analyzing' | 'saving' | 'depth' | 'done' | 'error';
  error: string;
  video?: SalesScriptImportVideo;
  result?: SalesScriptDraftResult;
  saveId: string;
  scriptId?: string;
  includeDepth?: boolean;
  model?: string;
  depthState?: 'prepared' | 'submitted' | 'ready' | 'failed' | 'skipped';
  depthOperationId?: string;
  depthTaskId?: string;
  depthVideoUrl?: string;
  depthProgress?: string;
}

export const MAX_SCRIPT_IMPORT_FILES = 30;
export function addSalesScriptImportFiles(existing: readonly SalesScriptImportItem[], files: readonly File[]) {
  const items = [...existing];
  const errors: string[] = [];
  for (const file of files) {
    if (!/\.(mp4|mov|webm)$/i.test(file.name)) {
      errors.push(`${file.name}：请选择 MP4、MOV 或 WebM 视频`); continue;
    }
    if (!file.size || file.size > 64 * 1024 * 1024) {
      errors.push(`${file.name}：视频须大于 0 且不超过 64 MB`); continue;
    }
    const index = items.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
    if (index >= 0) {
      if (!items[index].file) items[index] = { ...items[index], file };
      continue;
    }
    if (items.length >= MAX_SCRIPT_IMPORT_FILES) {
      const message = '每批最多 30 个视频，请完成本批后继续导入';
      if (!errors.includes(message)) errors.push(message);
      continue;
    }
    items.push({ key: `script-import-${crypto.randomUUID()}`, name: file.name, size: file.size, lastModified: file.lastModified,
      file, saveId: `script_${crypto.randomUUID()}`, status: 'queued', error: '' });
  }
  return { items, errors };
}

