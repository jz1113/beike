import type { BatchProductItem } from '../model/batchTypes';
import {
  downloadSingleTaskImage,
  exportBatchExcel,
  exportBatchZip,
} from '../model/delivery/batchRunnerExport';

export function useBatchExport(
  itemsRef: React.MutableRefObject<BatchProductItem[]>,
  showToast: (message: string) => void,
  setIsExportingZip: (value: boolean) => void,
) {
  const deps = {
    setIsExportingZip,
    setToastMsg: () => {},
    showToast,
  };
  const selectedItems = () => itemsRef.current.filter((item) => item.selected);
  const handleExportZip = async () => { await exportBatchZip(selectedItems(), deps); };
  const handleExportExcel = async () => { await exportBatchExcel(selectedItems(), deps); };
  const handleDownloadSingleTaskImage = async (url: string, filename?: string) => { await downloadSingleTaskImage(url, filename, showToast); };
  return { handleExportZip, handleExportExcel, handleDownloadSingleTaskImage };
}
