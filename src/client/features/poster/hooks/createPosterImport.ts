import type { ChangeEvent, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { parseTable } from '../model/parsePosterTable';
import { isPosterImageFile, isPosterTableFile, posterItemFromUploadedImage, assertPosterImportRowCount, assertPosterPasteSize, assertPosterSheetImportRange, mergePosterItems } from '../model/posterDraft';
import type { PosterItem } from '../model/posterTypes';
import type { PosterState } from './usePosterState';
import type { createPosterHistory } from './createPosterHistory';

export function createPosterImport(context: Pick<PosterState,
    'runningRef' | 'restoringRef' | 'exportingRef' | 'importingRef' | 'ensureWorkspaceReady'
    | 'setNoticeIfAlive' | 'setIsImporting' | 'itemsRef' | 'setItemsIfAlive' | 'aliveRef'
    | 'setIsDraggingFile'
  > & Pick<ReturnType<typeof createPosterHistory>, 'ensureActiveBatch' | 'persistActiveBatch'> & { pasteText: string }) {
  const {
    runningRef, restoringRef, exportingRef, importingRef, ensureWorkspaceReady, setNoticeIfAlive,
    setIsImporting, ensureActiveBatch, itemsRef, setItemsIfAlive, persistActiveBatch, aliveRef,
    setIsDraggingFile, pasteText,
  } = context;
  const importUploadFiles = async (files: File[]) => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady() || files.length === 0) return;
    const tables = files.filter((file) => isPosterTableFile(file.name));
    const images = files.filter((file) => isPosterImageFile(file.name));
    if (tables.length === 0 && images.length === 0) {
      setNoticeIfAlive('请上传 .xlsx、.xls、.csv，或 jpg、png、webp 图片。图片文件名会作为原标题。');
      return;
    }
    importingRef.current = true;
    setIsImporting(true);
    try {
      assertPosterImportRowCount(images.length);
      let tableCount = 0;
      for (const file of tables) {
        if (file.size > 20 * 1024 * 1024) throw new Error('表格文件超过 20MB，请拆分后导入。');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true, sheetRows: 2002 });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!firstSheet) throw new Error('文件中没有可读取的工作表');
        assertPosterSheetImportRange(firstSheet);
        const parsed = parseTable(XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '', raw: false }));
        if (parsed.length === 0) throw new Error('没有识别到可导入的行，请确认图片链接、标题和文字竖或文字横。');
        ensureActiveBatch();
        const next = mergePosterItems(itemsRef.current, parsed);
        itemsRef.current = next;
        setItemsIfAlive(next);
        void persistActiveBatch(next);
        tableCount += parsed.length;
      }
      const uploaded = [];
      for (const file of images) {
        if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} 超过 20MB，请压缩后导入。`);
        const url = await uploadStudioFile(file, 'headline-poster');
        const absolute = /^https?:\/\//i.test(url) ? url : new URL(url, window.location.origin).href;
        uploaded.push(posterItemFromUploadedImage(absolute, file.name));
      }
      if (uploaded.length > 0) {
        ensureActiveBatch();
        const next = mergePosterItems(itemsRef.current, uploaded);
        itemsRef.current = next;
        setItemsIfAlive(next);
        void persistActiveBatch(next);
      }
      const parts = [
        tableCount > 0 ? `表格 ${tableCount} 条` : '',
        uploaded.length > 0 ? `图片 ${uploaded.length} 张，原标题取自文件名，版式为文字竖` : '',
      ].filter(Boolean);
      setNoticeIfAlive(`已导入 ${parts.join('，')}。`);
    } catch (error) {
      setNoticeIfAlive(`导入失败：${error instanceof Error ? error.message : '文件格式无法识别'}`);
    } finally {
      importingRef.current = false;
      if (aliveRef.current) setIsImporting(false);
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (files.length > 0) await importUploadFiles(files);
    input.value = '';
  };

  const handleFileDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) void importUploadFiles(files);
  };

  const importPaste = () => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return false;
    let rows: unknown[][];
    try {
      assertPosterPasteSize(pasteText);
      const workbook = XLSX.read(pasteText, { type: 'string', raw: true, sheetRows: 2002 });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (sheet) assertPosterSheetImportRange(sheet);
      rows = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) : [];
    } catch (error) {
      setNoticeIfAlive(`粘贴内容无法解析：${error instanceof Error ? error.message : '请使用表格复制的列或 CSV 文本。'}`);
      return false;
    }
    let parsed: PosterItem[];
    try { parsed = parseTable(rows); } catch (error) {
      setNoticeIfAlive(`导入失败：${error instanceof Error ? error.message : '内容过多，请拆分后导入。'}`);
      return false;
    }
    if (parsed.length === 0) {
      setNoticeIfAlive('没有识别到可导入的行，请确认第一列为图片链接、第二列为标题、第三列为文字竖或文字横；第四列商品名称/型号可选。');
      return false;
    }
    ensureActiveBatch();
    const nextItems = mergePosterItems(itemsRef.current, parsed);
    itemsRef.current = nextItems;
    setItemsIfAlive(nextItems);
    void persistActiveBatch(nextItems);
    setNoticeIfAlive(`已解析 ${parsed.length} 条。请在生产清单中确认或修改封面标题后，再开始批量生成。`);
    return true;
  };


  return { importFile, handleFileDrop, importPaste };
}
