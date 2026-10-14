import { useRef, useState } from 'react';
import { exportZipDownload, formatExportProgress } from '@client/shared/api/exportZipDownload';
import { permanentDeleteGeneration } from '@client/shared/api/permanentDeleteGeneration';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { getAssetDownloadExtension } from '@client/shared/utils/assetTaskData';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import type { AssetCanvasProject } from '../model/canvasAssets';
import type { AssetTaskBatch } from '../model/assetBatch';

type Task = AssetTaskBatch['tasks'][number];
interface Params {
  canvasProjects: AssetCanvasProject[];
  onDeleteCanvasProject: (projectId: string) => void;
  onDeleteCanvasNode: (projectId: string, nodeId: string) => void;
  mergedTasks: Task[];
  selectedTaskIds: string[];
  failedTasks: Task[];
  setSelectedTaskIds: (ids: string[]) => void;
  setIsBatchMode: (value: boolean) => void;
  showToast: (message: string) => void;
  refetchAssetTasks: () => Promise<unknown>;
}

export function useAssetActions({ mergedTasks, selectedTaskIds, failedTasks, setSelectedTaskIds, setIsBatchMode, showToast, refetchAssetTasks, canvasProjects, onDeleteCanvasProject, onDeleteCanvasNode }: Params) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipProgressLabel, setZipProgressLabel] = useState('');
  const lock = useRef(false);
  const isBusy = isDeleting || isDownloadingZip;

  const deleteTargets = async (targets: Task[], message: string, success: string, clearSelection = false) => {
    if (!targets.length || lock.current || isBusy) return;
    lock.current = true;
    setIsDeleting(true);
    try {
      if (!(await confirmAction(message))) return;
      const regularTargets = targets.filter(task => !task.canvasProjectId);
      let warning: string | undefined;
      if (regularTargets.length) {
        const protectUrls = canvasProjects.flatMap(project => [project.thumbnail, ...project.nodes.flatMap(node => [node.imageUrl, node.videoUrl, node.audioUrl, node.referenceImageUrl, ...(node.drawing?.references || [])])]).filter((url): url is string => Boolean(url));
        const result = await permanentDeleteGeneration(regularTargets, { protectUrls });
        if (!result.ok) throw new Error(`${result.partial ? '部分记录已删除，剩余记录仍保留。' : ''}${result.error || '服务端删除失败，请重试'}`);
        warning = result.warning;
      }
      for (const task of targets.filter(task => task.canvasProjectId)) {
        if (task.nodeId === 'cover' || task.nodeId === 'init') onDeleteCanvasProject(task.canvasProjectId);
        else onDeleteCanvasNode(task.canvasProjectId, task.nodeId);
      }
      if (clearSelection) {
        setIsBatchMode(false);
        setSelectedTaskIds([]);
      }
      showToast(warning ? `${success}；${warning}` : success);
      if (regularTargets.length) await refetchAssetTasks();
    } catch (error) {
      showToast(`删除未全部完成：${formatUserError(error, '请重试')}`);
    } finally {
      lock.current = false;
      setIsDeleting(false);
    }
  };

  const handleDeleteTask = (task: Task, event?: React.MouseEvent) => {
    event?.stopPropagation();
    return deleteTargets([task], '确定彻底删除该生成记录吗？', '已删除该记录');
  };
  const handleBatchDelete = () => {
    const targets = mergedTasks.filter(task => selectedTaskIds.includes(task.id));
    return deleteTargets(targets, `确定彻底删除选中的 ${targets.length} 条记录吗？`, `已删除选中的 ${targets.length} 条记录`, true);
  };
  const handleClearFailedAndStuck = () => deleteTargets(failedTasks, `确定清理当前筛选中的 ${failedTasks.length} 条失败记录吗？`, `已清理 ${failedTasks.length} 条失败记录`);
  const handleDeleteBatch = async (batch: AssetTaskBatch, event: React.MouseEvent) => {
    event.stopPropagation();
    if (batch.batchId.startsWith('canvas-project-')) {
      const projectId = batch.batchId.slice('canvas-project-'.length);
      // A project-level action also deletes notes and other non-media nodes.
      return deleteTargets([{ canvasProjectId: projectId, nodeId: 'init' }], `确定删除画布项目“${batch.title}”及其全部内容吗？`, '已删除画布项目');
    }
    return deleteTargets(batch.tasks, `确定删除该批次的 ${batch.tasks.length} 条记录吗？`, '已删除该批次');
  };

  const handleBatchDownload = async () => {
    if (lock.current || isBusy) return;
    const tasks = mergedTasks.filter(task => selectedTaskIds.includes(task.id) && task.resultUrl && task.status !== 'FAILURE');
    if (!tasks.length) { showToast('选中的记录中没有可下载的媒体文件'); return; }
    lock.current = true;
    setIsDownloadingZip(true);
    setZipProgressLabel('正在打包…');
    showToast(`正在将 ${tasks.length} 个媒体打包为 ZIP…`);
    try {
      const images = tasks.map((task, index) => ({ url: task.resultUrl, filename: `${String(index + 1).padStart(3, '0')}_${(task.prompt || 'asset').slice(0, 20).replace(/[/\\?%*:|"<>]/g, '_')}.${getAssetDownloadExtension(task.mediaType, task.resultUrl)}` }));
      const result = await exportZipDownload({ images, folderName: `beike_batch_${Date.now()}` }, `beike_batch_${new Date().toISOString().slice(0, 10)}.zip`, progress => setZipProgressLabel(formatExportProgress(progress)));
      showToast(result.partial ? `已导出 ${result.succeeded} 项，${result.failed} 项失败；压缩包内附失败清单，可重试` : 'ZIP 已打包，已发起浏览器下载');
      if (!result.partial) { setIsBatchMode(false); setSelectedTaskIds([]); }
    } catch (error) {
      showToast(`打包下载失败：${formatUserError(error, '请稍后重试')}`);
    } finally {
      lock.current = false;
      setIsDownloadingZip(false);
      setZipProgressLabel('');
    }
  };

  const handleBatchDeleteTasks = (ids: string[]) => {
    const targets = mergedTasks.filter(task => ids.includes(task.id));
    return deleteTargets(targets, `确定彻底删除选中的 ${targets.length} 条记录吗？`, `已删除选中的 ${targets.length} 条记录`, true);
  };

  const handleBatchDownloadTasks = async (ids: string[]) => {
    if (lock.current || isBusy) return;
    const tasks = mergedTasks.filter(task => ids.includes(task.id) && task.resultUrl && task.status !== 'FAILURE');
    if (!tasks.length) { showToast('选中的记录中没有可下载的媒体文件'); return; }
    lock.current = true;
    setIsDownloadingZip(true);
    setZipProgressLabel('正在打包…');
    showToast(`正在将 ${tasks.length} 个媒体打包为 ZIP…`);
    try {
      const images = tasks.map((task, index) => ({ url: task.resultUrl, filename: `${String(index + 1).padStart(3, '0')}_${(task.prompt || 'asset').slice(0, 20).replace(/[/\\?%*:|"<>]/g, '_')}.${getAssetDownloadExtension(task.mediaType, task.resultUrl)}` }));
      const result = await exportZipDownload({ images, folderName: `beike_batch_${Date.now()}` }, `beike_batch_${new Date().toISOString().slice(0, 10)}.zip`, progress => setZipProgressLabel(formatExportProgress(progress)));
      showToast(result.partial ? `已导出 ${result.succeeded} 项，${result.failed} 项失败；压缩包内附失败清单，可重试` : 'ZIP 已打包，已发起浏览器下载');
    } catch (error) {
      showToast(`打包下载失败：${formatUserError(error, '请稍后重试')}`);
    } finally {
      lock.current = false;
      setIsDownloadingZip(false);
      setZipProgressLabel('');
    }
  };

  return { isBusy, isDeleting, isDownloadingZip, zipProgressLabel, setIsDownloadingZip, handleDeleteTask, handleBatchDelete, handleBatchDeleteTasks, handleBatchDownloadTasks, handleClearFailedAndStuck, handleDeleteBatch, handleBatchDownload };
}
