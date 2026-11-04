import { useRef } from 'react';
import { Download } from 'lucide-react';
import { useAppStore } from '@client/store';
import GlobalDynamicBackground from '@client/shared/media/widgets/GlobalDynamicBackground';
import { ToolSuiteMark } from '@client/shared/icons';
import CollectorVideoDownloadPanel from './CollectorVideoDownloadPanel';
import { useCollectorToast } from '../hooks/useCollectorToast';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useVideoDownloadQueue } from '../hooks/useVideoDownloadQueue';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function VideoDownloadModal({ isOpen, onClose }: Props) {
  const setCurrentView = useAppStore(s => s.setCurrentView);
  const { toastMsg, showToast } = useCollectorToast();
  const videoQueue = useVideoDownloadQueue(showToast);
  const modalCardRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalCardRef, isOpen, onClose);

  const handleBackHome = () => {
    setCurrentView('home');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 animate-fade-in select-none bg-[#F7F7F8] text-slate-900 dark:bg-[#121214] dark:text-slate-100"
    >
      <GlobalDynamicBackground />
      <div
        ref={modalCardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="collector-modal-title"
        aria-describedby="collector-modal-desc"
        tabIndex={-1}
        className="relative z-10 flex h-full w-full flex-col overflow-hidden text-left"
      >
        {/* 轻量顶部操作条：与大字报页面保持一致 */}
        <header
          className="relative z-10 flex min-h-11 shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8 cursor-default"
        >
          <button
            type="button"
            onClick={handleBackHome}
            className="group inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 text-sm font-black tracking-tight text-slate-900 shadow-sm backdrop-blur transition-colors hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-[#1B1B1E]/90 dark:text-white dark:hover:border-white/20 dark:hover:bg-[#26262B]"
            aria-label="返回首页"
            title="返回首页"
          >
            <ToolSuiteMark>
              <Download className="h-4 w-4 stroke-[2]" />
            </ToolSuiteMark>
            <span className="text-sm font-black tracking-tight">OSS 视频下载</span>
          </button>
        </header>

        {/* 中心工作区：大字报同款标题、切换与独立白卡 */}
        <div className="flex-1 overflow-y-auto px-4 pb-10 pt-8 sm:px-6 sm:pt-12 lg:px-8">
          <section className="mx-auto w-full max-w-[1120px]">
            <div className="mx-auto max-w-[980px] text-center">
              <h1 id="collector-modal-title" className="text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-[40px] dark:text-slate-100">OSS 视频下载</h1>
              <p id="collector-modal-desc" className="mt-3 text-sm text-slate-500 dark:text-slate-400">导入含标题和视频链接的表格，按标题批量下载到本地文件夹。</p>
            </div>
            <div className="mt-8">
              <CollectorVideoDownloadPanel showToast={showToast} queue={videoQueue} />
            </div>
          </section>
        </div>
      </div>

      {/* 全局 Toast */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-8 left-1/2 z-80 flex -translate-x-1/2 animate-fade-in items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/95 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-md pointer-events-none dark:border-white/10 dark:bg-[#20232A]/95 dark:text-[#EDEDED]"
        >
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
