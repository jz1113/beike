import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { createPosterImport } from './createPosterImport';
import type { PosterItem } from '../model/posterTypes';

vi.mock('@client/shared/api/uploadStudioFile', () => ({ uploadStudioFile: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe('poster file import', () => {
  it('keeps each successful upload when a later file fails', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
    vi.mocked(uploadStudioFile).mockResolvedValueOnce('/storage/local/first.png').mockRejectedValueOnce(new Error('第二张上传失败'));
    const itemsRef = { current: [] as PosterItem[] };
    const notice = vi.fn();
    const persist = vi.fn(async () => true);
    const importer = createPosterImport({
      runningRef: { current: false }, restoringRef: { current: false }, exportingRef: { current: false },
      importingRef: { current: false }, ensureWorkspaceReady: () => true,
      setNoticeIfAlive: notice, setIsImporting: vi.fn(), itemsRef, setItemsIfAlive: vi.fn(),
      aliveRef: { current: true }, setIsDraggingFile: vi.fn(), pasteText: '',
      ensureActiveBatch: () => 'batch', persistActiveBatch: persist,
    });
    const input = { files: [new File(['first'], '第一张商品图.png'), new File(['second'], '第二张商品图.png')], value: 'files' };
    await importer.importFile({ currentTarget: input } as unknown as ChangeEvent<HTMLInputElement>);
    expect(itemsRef.current).toHaveLength(1);
    expect(itemsRef.current[0].originalTitle).toBe('第一张商品图');
    expect(persist).toHaveBeenCalledWith(itemsRef.current);
    expect(notice).toHaveBeenLastCalledWith('已保留成功导入的 1 条；后续导入失败：第二张上传失败');
    expect(input.value).toBe('');
  });
});
