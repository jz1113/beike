import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileArchive,
  Presentation,
  Headphones,
  Sparkles,
  X,
} from 'lucide-react';
import { usePptStore } from '../store/usePptStore';
import { exportImagesZip, exportPptxFile } from '../model/pptExportEngine';

interface Props {
  onClose: () => void;
}

export const PptExportModal: React.FC<Props> = ({ onClose }) => {
  const { pages, title, generateNarrations } = usePptStore();
  const [exportType, setExportType] = useState<'pptx' | 'zip' | 'narration'>('pptx');
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingSpeech, setIsGeneratingSpeech] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (exportType === 'pptx') {
        await exportPptxFile(pages, title);
      } else if (exportType === 'zip') {
        await exportImagesZip(pages, title);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerateNarrationScript = async () => {
    setIsGeneratingSpeech(true);
    try {
      await generateNarrations();
    } finally {
      setIsGeneratingSpeech(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#16161A] p-6 shadow-2xl space-y-6">
        {/* 标题 */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">导出与交付中心</h3>
            <p className="text-xs text-slate-400 mt-0.5">选择您需要的格式规格</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 导出卡片单选 */}
        <div className="space-y-3">
          <div
            onClick={() => setExportType('pptx')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
              exportType === 'pptx'
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-xs'
                : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Presentation className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900 dark:text-white">高保真演示文稿 (.pptx)</p>
                {exportType === 'pptx' && <CheckCircle2 className="h-4 w-4 text-indigo-500" />}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                4K 满铺母版，跨 Windows / macOS / Office / WPS 零错位，完美支持投屏播放。
              </p>
            </div>
          </div>

          <div
            onClick={() => setExportType('zip')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
              exportType === 'zip'
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-xs'
                : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <FileArchive className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900 dark:text-white">4K 高清素材包 (.zip)</p>
                {exportType === 'zip' && <CheckCircle2 className="h-4 w-4 text-indigo-500" />}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                包含全部幻灯片的极清原图，适合设计师二次精修与设计物料归档。
              </p>
            </div>
          </div>

          <div
            onClick={() => setExportType('narration')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
              exportType === 'narration'
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-xs'
                : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <Headphones className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900 dark:text-white">AI 口播旁白解说剧本</p>
                {exportType === 'narration' && <CheckCircle2 className="h-4 w-4 text-indigo-500" />}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                AI 自动为逐页编写口语化讲稿，可用于录制视频或现场提词器。
              </p>
            </div>
          </div>
        </div>

        {/* 若选中旁白模式，展示一键生成旁白按钮与预览 */}
        {exportType === 'narration' && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">演讲旁白状态</span>
              <button
                type="button"
                disabled={isGeneratingSpeech}
                onClick={handleGenerateNarrationScript}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                <span>{isGeneratingSpeech ? '生成旁白中...' : '生成整套逐页解说词'}</span>
              </button>
            </div>

            {pages.some((p) => p.narrationText) ? (
              <div className="max-h-36 overflow-y-auto space-y-2 text-[11px] text-slate-600 dark:text-slate-300">
                {pages.map((p) => (
                  <p key={p.pageIndex} className="line-clamp-2">
                    <span className="font-bold text-indigo-500">P{p.pageIndex}: </span>
                    {p.narrationText || '尚未生成'}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-2">
                点击上方按钮，AI 将为您智能创作每页自然的口语化解说词
              </p>
            )}
          </div>
        )}

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            取消
          </button>
          {exportType !== 'narration' ? (
            <button
              type="button"
              disabled={isExporting}
              onClick={handleExport}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-500/20 active:scale-95 disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>正在导出文件...</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>立即导出下载</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500"
            >
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
