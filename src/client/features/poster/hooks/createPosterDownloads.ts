import JSZip from 'jszip';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { safeBaseName } from '../model/posterTypes';
import type { PosterItem } from '../model/posterTypes';
import type { PosterState } from './usePosterState';

export function createPosterDownloads(context: Pick<PosterState,
    'runningRef' | 'exportingRef' | 'restoringRef' | 'importingRef' | 'ensureWorkspaceReady'
    | 'itemsRef' | 'setIsExportingIfAlive' | 'aliveRef' | 'workspaceChanged' | 'setNoticeIfAlive'
  >) {
  const { runningRef, exportingRef, restoringRef, importingRef, ensureWorkspaceReady, itemsRef, setIsExportingIfAlive, aliveRef, workspaceChanged, setNoticeIfAlive } = context;
  const exportZip = async () => {
    if (runningRef.current || exportingRef.current || restoringRef.current || importingRef.current || !ensureWorkspaceReady()) return;
    const ready = itemsRef.current.filter((item) => item.status === 'complete' && item.resultUrl);
    if (ready.length === 0) return;
    setIsExportingIfAlive(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const entries = ready.map((item, index) => {
        const base = safeBaseName(item.originalTitle, `大字报封面_${index + 1}`);
        let name = base;
        let duplicate = 2;
        while (usedNames.has(name.toLowerCase())) name = `${base}_${duplicate++}`;
        usedNames.add(name.toLowerCase());
        return { item, name };
      });
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
        while (cursor < entries.length) {
          if (!aliveRef.current || workspaceChanged()) throw new Error('页面或工作区已切换，请在原批次重新导出。');
          const { item, name } = entries[cursor++];
          zip.file(`${name}.jpg`, await fetchMediaBlob(item.resultUrl!), { binary: true });
        }
      }));
      const csvCell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
      zip.file('生成记录.csv', '\uFEFF' + ['原标题,商品名称/型号,封面标题,状态', ...ready.map((item) => [item.originalTitle, item.productName, item.coverTitle, '已完成'].map(csvCell).join(','))].join('\r\n'));
      zip.file('完整设计与提示词.json', JSON.stringify(ready.map((item) => ({
        originalTitle: item.originalTitle, productName: item.productName, coverTitle: item.coverTitle,
        outputFormat: item.format.importValue,
        outputSize: item.format.width + 'x' + item.format.height,
        sourceImageUrl: item.sourceImageUrl, design: item.designPlan,
        imagePrompt: item.prompt, promptVersion: item.promptVersion || 'legacy-unknown',
      })), null, 2));
      const archive = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      if (!aliveRef.current || !ensureWorkspaceReady()) return;
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await saveToDownloadDir(`大字报封面_${date}.zip`, archive);
      setNoticeIfAlive('成果包已开始下载，图片均按原标题命名。');
    } catch (error) {
      setNoticeIfAlive(`打包失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsExportingIfAlive(false);
    }
  };

  const downloadOne = async (item: PosterItem, index: number) => {
    if (!item.resultUrl || !ensureWorkspaceReady()) return;
    try {
      await saveToDownloadDir(`${safeBaseName(item.originalTitle, `大字报封面_${index + 1}`)}.jpg`, await fetchMediaBlob(item.resultUrl));
      setNoticeIfAlive('已按原标题保存成品。');
    } catch (error) {
      setNoticeIfAlive(`下载失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const downloadOriginalScene = async (item: PosterItem, index: number) => {
    if (!item.generatedSceneUrl || !ensureWorkspaceReady()) return;
    try {
      const blob = await fetchMediaBlob(item.generatedSceneUrl);
      const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' } as Record<string, string>)[blob.type];
      if (!extension) throw new Error('原生图格式无法确认，请在资产中心下载原任务结果。');
      await saveToDownloadDir(`${safeBaseName(item.originalTitle, `大字报封面_${index + 1}`)}_原生图.${extension}`, blob);
      setNoticeIfAlive('已保存原生图，可检查比例或直接使用原图。');
    } catch (error) {
      setNoticeIfAlive(`原生图下载失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };


  return { exportZip, downloadOne, downloadOriginalScene };
}
