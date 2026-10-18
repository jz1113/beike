import React, { useState } from 'react';
import { Download, FolderArchive, FileText, CheckCircle2, Loader2 } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { downloadMediaOrOpen } from '@client/shared/media/downloadMedia';
import type { CanvasNode } from '../../model/types';

interface Props {
  node: CanvasNode;
  nodes: CanvasNode[];
  projectId: string;
}

export const CanvasSaveNode: React.FC<Props> = ({ node, nodes }) => {
  const [downloading, setDownloading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Find all upstream nodes linked to this save node
  const linkedNodes = (node.referenceNodeIds || [])
    .map((id) => nodes.find((n) => n.id === id))
    .filter(Boolean) as CanvasNode[];

  const mediaItems = linkedNodes
    .map((n) => ({
      id: n.id,
      title: n.title || '导出素材',
      type: n.type === 'video' || n.generationKind === 'video' ? 'video' : 'image',
      url: (n.type === 'video' || n.generationKind === 'video' ? n.videoUrl : n.imageUrl) || '',
    }))
    .filter((item) => Boolean(item.url));

  const handleExportAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!mediaItems.length || downloading) return;
    try {
      setDownloading(true);
      setSuccess(false);

      for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i];
        const ext = item.type === 'video' ? 'mp4' : 'png';
        const filename = `${node.savePrefix || '短剧产出'}_${i + 1}_${item.title}.${ext}`;
        await downloadMediaOrOpen(item.url, filename);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '导出失败');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="relative flex flex-col w-full h-full rounded-2xl bg-white dark:bg-[#1B1B1E] border border-slate-200/90 dark:border-white/10 shadow-lg p-4 select-none"
      style={{ minHeight: `${node.height || 260}px` }}
    >
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          <FolderArchive className="w-4 h-4 text-emerald-500" />
          <span className="font-semibold text-xs text-slate-800 dark:text-slate-100">
            {node.title || '本地批量导出'}
          </span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
          已连入 {mediaItems.length} 项
        </span>
      </div>

      {/* 连入素材缩略列表 */}
      <div className="flex-1 py-3 overflow-y-auto max-h-[160px] space-y-1.5">
        {mediaItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs py-6 text-center">
            <FileText className="w-6 h-6 mb-1 opacity-40" />
            <p className="text-[11px]">暂无连入素材</p>
            <p className="text-[10px] text-slate-500 mt-0.5 dark:text-slate-400">将上游画面连入左侧端点自动归档</p>
          </div>
        ) : (
          mediaItems.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 p-1.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 text-xs"
            >
              <div className="w-9 h-9 rounded-lg overflow-hidden bg-black/20 shrink-0">
                {item.type === 'video' ? (
                  <video src={proxyMediaUrl(item.url)} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={proxyMediaUrl(item.url)} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-slate-700 dark:text-slate-200 text-[11px]">{item.title}</p>
                <p className="text-[10px] text-slate-400">镜头 #{idx + 1} · {item.type.toUpperCase()}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 导出按钮 */}
      <div className="pt-2 border-t border-slate-100 dark:border-white/5">
        <button
          type="button"
          disabled={mediaItems.length === 0 || downloading}
          onClick={handleExportAll}
          className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {downloading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>正在导出下载...</span>
            </>
          ) : success ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
              <span>导出完成</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>一键导出全部素材 ({mediaItems.length})</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
