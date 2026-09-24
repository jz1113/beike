import type { BatchProductItem } from '../model/batchTypes';
import {
  downloadSingleTaskImage,
  exportBatchExcel,
  exportBatchZip,
  exportSingleProductZip,
} from '../model/batchRunnerExport';

export function useBatchExport(
  itemsRef: React.MutableRefObject<BatchProductItem[]>,
  showToast: (message: string) => void,
  setIsExportingZip: (value: boolean) => void,
  setExportingSingleItemId: (value: string | null) => void,
) {
  const deps = {
    setIsExportingZip,
    setExportingSingleItemId,
    setToastMsg: () => {},
    showToast,
  };
  const handleExportZip = async () => { await exportBatchZip(itemsRef.current, deps); };
  const handleExportExcel = async () => { await exportBatchExcel(itemsRef.current, deps); };
  const handleExportSingleProductZip = async (item: BatchProductItem) => { await exportSingleProductZip(item, deps); };
  const handleDownloadSingleTaskImage = async (url: string, filename?: string) => { await downloadSingleTaskImage(url, filename, showToast); };
  return { handleExportZip, handleExportExcel, handleExportSingleProductZip, handleDownloadSingleTaskImage };
}
