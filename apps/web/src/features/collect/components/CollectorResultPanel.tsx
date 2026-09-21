
import React from 'react';
import { X, Download, Maximize2, Film, Bot } from 'lucide-react';
import {
  displayMediaSrc,
  displayVideoSrc,
  collectedVideos,
  handleImgError,
  mediaAssetCount,
} from '@/features/collect/utils/collectorTypes';

export interface CollectorResultPanelProps {
  inspectingItem: any;
  inspectingSelectedImages: string[];
  setInspectingItem: (v: any | null) => void;
  setPreviewImageUrl: (v: string | null) => void;
  handleImportToAIAssistant: (item: any, prompt?: string, images?: string[], includeVideo?: boolean) => void;
  handleDownloadSingleZip: (item: any) => void;
}

export default function CollectorResultPanel({
  inspectingItem,
  inspectingSelectedImages,
  setInspectingItem,
  setPreviewImageUrl,
  handleImportToAIAssistant,
  handleDownloadSingleZip,
}: CollectorResultPanelProps) {
  const videos = collectedVideos(inspectingItem);
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-4xl max-h-[85vh] rounded-3xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden text-left p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img
              src={displayMediaSrc(inspectingItem.coverImage || inspectingItem.images?.[0]) || inspectingItem.coverImage || inspectingItem.images?.[0] || undefined}
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => handleImgError(e, inspectingItem.coverImage || inspectingItem.images?.[0])}
              className="w-12 h-12 rounded-xl object-cover border border-slate-200"
            />
            <div>
              <h3 className="font-bold text-base text-slate-900 break-words whitespace-normal leading-snug">{inspectingItem.title}</h3>
              <p className="text-xs text-slate-400">共 {mediaAssetCount(inspectingItem)} 项素材{videos.length ? `（含 ${videos.length} 条视频/动态）` : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const hasVid = Boolean(inspectingItem.video || inspectingItem.videoUrl);
                handleImportToAIAssistant(inspectingItem, undefined, inspectingSelectedImages, hasVid ? true : undefined);
              }}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="将素材导入 AI 助手输入框"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>导入 AI 助手</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownloadSingleZip(inspectingItem)}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载整套 ZIP</span>
            </button>
            <button
              type="button"
              onClick={() => setInspectingItem(null)}
              className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 overflow-y-auto max-h-[60vh] pr-1">
          {videos.map((videoUrl, videoIndex) => (
            <div
              key={videoUrl}
              className="group relative aspect-square rounded-2xl overflow-hidden border border-rose-200 bg-black col-span-2"
              onClick={(e) => e.stopPropagation()}
            >
              <video
                src={displayVideoSrc(videoUrl)}
                poster={displayMediaSrc(inspectingItem.coverImage || inspectingItem.images?.[0]) || undefined}
                controls
                playsInline
                muted
                preload="metadata"
                className="w-full h-full object-contain"
              />
              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold flex items-center gap-1 pointer-events-none">
                <Film className="w-3 h-3" />
                视频/动态 {videoIndex + 1}
              </div>
            </div>
          ))}
          {inspectingItem.images?.map((u: string, idx: number) => (
            <div
              key={idx}
              onClick={() => setPreviewImageUrl(u)}
              className="group relative aspect-square rounded-2xl overflow-hidden border border-slate-200 hover:border-blue-400 cursor-pointer transition-all bg-slate-100"
            >
              <img
                src={displayMediaSrc(u) || u}
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => handleImgError(e, u)}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                <Maximize2 className="w-5 h-5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
