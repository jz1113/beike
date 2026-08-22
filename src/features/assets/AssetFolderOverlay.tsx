'use client';
import {
  FolderArchive,
  Download,
  RotateCw,
  X,
  Maximize2,
  Layers,
  Eye,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import { saveToDownloadDir } from '@/lib/desktopDownload';
import { downloadMediaOrOpen } from '@/lib/downloadMedia';
import { useAppStore } from '@/store/useAppStore';
import { formatDisplayModel, normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import AIGeneratingCard from '@/shared/ui/AIGeneratingCard';
import Folder from '@/shared/media/Folder';
import LazyVideoCover from './LazyVideoCover';
import type { AssetTaskBatch } from './assetBatchUtils';

interface Props {
  folderBatch: AssetTaskBatch;
  isDownloadingZip: boolean;
  setIsDownloadingZip: (v: boolean) => void;
  showToast: (msg: string) => void;
  setQuickPrompt: (prompt: string) => void;
  setPreviewTask: (...args: any[]) => void;
  onClose: () => void;
}

export default function AssetFolderOverlay({
  folderBatch,
  isDownloadingZip,
  setIsDownloadingZip,
  showToast,
  setQuickPrompt,
  setPreviewTask,
  onClose,
}: Props) {
  return (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
          onClick={onClose}
        >
          <div 
            className="w-full max-w-4xl max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">套组图片文件夹</h3>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold font-mono">
                      共 {folderBatch.tasks.length} 张图片
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1 max-w-md mt-0.5" title={folderBatch.prompt}>
                    {folderBatch.prompt || '同批次生成任务'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!folderBatch.tasks || folderBatch.tasks.length === 0) return;
                    try {
                      setIsDownloadingZip(true);
                      showToast('📦 正在打包下载套组高清素材...');

                      const itemsToExport = folderBatch.tasks
                        .filter(t => t.resultUrl && t.status === 'SUCCESS')
                        .map(t => ({
                          url: t.resultUrl,
                          title: t.title || t.prompt || 'image',
                          type: t.mediaType === 'video' || t.resultUrl?.includes('.mp4') ? 'video' : 'image'
                        }));

                      const res = await apiFetch('/api/generate/export-zip', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          productTitle: `贝壳云图_套组资产_${new Date().toISOString().slice(0, 10)}`,
                          images: itemsToExport
                        })
                      });

                      if (!res.ok) throw new Error('打包下载服务响应异常');

                      const blob = await res.blob();
                      await saveToDownloadDir(`贝壳云图_套组图片_${folderBatch.tasks.length}张_${Date.now()}.zip`, blob);

                      showToast(`🎉 成功打包并下载 ${itemsToExport.length} 项套组素材！`);
                    } catch (err: any) {
                      console.error('套组打包下载失败:', err);
                      showToast(`❌ 打包下载失败: ${err.message || '请稍后重试'}`);
                    } finally {
                      setIsDownloadingZip(false);
                    }
                  }}
                  disabled={isDownloadingZip}
                  className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-indigo-200/60"
                  title="打包下载本套组全部图片"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isDownloadingZip ? '正在打包...' : '下载整套 (ZIP)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickPrompt(folderBatch.prompt);
                    useAppStore.getState().setCurrentView('hub');
                    showToast('✨ 已复用提示词前往创作');
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200 shadow-2xs"
                  title="复用提示词"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>复用提示词</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              {/* Interactive Folder Feature Card */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-6 rounded-2xl bg-gradient-to-br from-indigo-50/70 via-slate-50 to-purple-50/40 border border-indigo-100/80">
                <div className="flex items-center gap-6">
                  {/* 🌟 动态 ReactBits Folder 组件 */}
                  <div className="shrink-0 flex items-center justify-center p-2">
                    <Folder 
                      color="#4F46E5"
                      size={1.1}
                      coverImage={folderBatch.tasks[0]?.resultUrl}
                      count={folderBatch.tasks.length}
                      items={folderBatch.tasks.slice(0, 3).map(t => t.resultUrl)}
                      onItemClick={(idx) => {
                        const targetTask = folderBatch.tasks[idx] || folderBatch.tasks[0];
                        if (targetTask?.resultUrl) {
                          setPreviewTask(targetTask, folderBatch.tasks);
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-bold font-mono">
                        {formatDisplayModel(folderBatch.model, folderBatch.tasks.some(t => t.mediaType === 'video'))}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {new Date(folderBatch.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 line-clamp-2">
                      {folderBatch.prompt || '批量成套生成'}
                    </h4>
                    <p className="text-xs text-slate-500">
                      💡 点击上方文件夹可互动开合或点击下方单张图片放大预览高清细节。
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (folderBatch.tasks[0]?.resultUrl) {
                      setPreviewTask(folderBatch.tasks[0], folderBatch.tasks);
                    }
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>大图逐张查看</span>
                </button>
              </div>

              {/* Grid of All Images in this Batch */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>套组全部生成图片清单 ({folderBatch.tasks.length})</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">点击任意图片可放大查看</span>
                </div>

                <div className={`grid ${folderBatch.tasks.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : folderBatch.tasks.length === 3 ? 'grid-cols-3' : folderBatch.tasks.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'} gap-3.5`}>
                  {folderBatch.tasks.map((task, idx) => (
                    <div
                      key={task.id}
                      onClick={() => setPreviewTask(task, folderBatch.tasks)}
                      className="group relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/80 aspect-square cursor-pointer shadow-2xs hover:shadow-lg hover:-translate-y-0.5 transition-all"
                    >
                      <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[9px] font-mono font-bold">
                        #{idx + 1}
                      </div>

                      {task.resultUrl ? (
                        (task.mediaType === 'video' || task.resultUrl.includes('.mp4')) ? (
                          <LazyVideoCover src={task.resultUrl} />
                        ) : (
                          <img 
                            src={normalizeImageUrlToStandardJpg(task.resultUrl)} 
                            alt="" 
                            loading="lazy" 
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                          />
                        )
                      ) : (
                        <AIGeneratingCard task={task} />
                      )}

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                        <div className="flex items-center justify-between text-white text-[10px]">
                          <span className="font-bold flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            <span>放大查看</span>
                          </span>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!task.resultUrl) return;
                              await downloadMediaOrOpen(
                                task.resultUrl,
                                `beikeyuntu_batch_${idx + 1}.png`,
                              );
                            }}
                            className="p-1 rounded-md bg-white/20 hover:bg-white text-white hover:text-slate-900 transition-colors"
                            title="下载此张"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
  );
}
