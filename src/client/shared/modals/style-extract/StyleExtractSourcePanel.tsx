import React from 'react';
import {
  Link as LinkIcon,
  UploadCloud,
  Globe,
  Loader2,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { ImageGridTile } from './ImageGridTile';

interface StyleExtractSourcePanelProps {
  sourceType: 'link' | 'upload' | 'url';
  setSourceType: (type: 'link' | 'upload' | 'url') => void;
  detectedLinkCount: number;
  linkInput: string;
  setLinkInput: (val: string) => void;
  isParsingLink: boolean;
  handleParseLink: () => void;
  parsedImages: string[];
  parsedPostTitle: string;
  selectedSet: Set<string>;
  selectedImages: string[];
  setSelectedImages: React.Dispatch<React.SetStateAction<string[]>>;
  handleAutoSelectKeyShots: (images?: string[]) => void;
  visibleCount: number;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
  handleToggleImage: (img: string) => void;
  styleUploadDropProps: any;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  urlInput: string;
  setUrlInput: (val: string) => void;
  handleAddUrls: () => void;
  showToast: (msg: string) => void;
}

export const StyleExtractSourcePanel = React.memo(function StyleExtractSourcePanel({
  sourceType,
  setSourceType,
  detectedLinkCount,
  linkInput,
  setLinkInput,
  isParsingLink,
  handleParseLink,
  parsedImages,
  parsedPostTitle,
  selectedSet,
  selectedImages,
  setSelectedImages,
  handleAutoSelectKeyShots,
  visibleCount,
  setVisibleCount,
  handleToggleImage,
  styleUploadDropProps,
  handleFileUpload,
  urlInput,
  setUrlInput,
  handleAddUrls,
  showToast,
}: StyleExtractSourcePanelProps) {
  return (
    <div className="space-y-3">
      {/* 3 Channel Segmented Switcher */}
      <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-slate-100 border border-slate-200/80 dark:bg-white/10 dark:border-white/10">
        <button
          type="button"
          onClick={() => setSourceType('link')}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            sourceType === 'link'
              ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 dark:border-white/10 dark:bg-[#18191c]'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white dark:text-slate-400'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          <span>小红书 / 抖音链接解析</span>
        </button>

        <button
          type="button"
          onClick={() => setSourceType('upload')}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            sourceType === 'upload'
              ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 dark:border-white/10 dark:bg-[#18191c]'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white dark:text-slate-400'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>本地多图直接上传</span>
        </button>

        <button
          type="button"
          onClick={() => setSourceType('url')}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            sourceType === 'url'
              ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 dark:border-white/10 dark:bg-[#18191c]'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white dark:text-slate-400'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>网络图片 URL 导入</span>
        </button>
      </div>

      {/* Panel Content for Link Scraper */}
      {sourceType === 'link' && (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 dark:bg-white/5 dark:border-white/10">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                粘贴小红书 / 抖音笔记分享链接（支持多行批量导入，每行一条）：
              </div>
              {detectedLinkCount > 0 && (
                <div className="text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200/60 px-2.5 py-0.5 rounded-full">
                  已输入 {detectedLinkCount} 条链接
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
              <div className="relative flex-1">
                <textarea
                  wrap="off"
                  rows={Math.max(2, Math.min(detectedLinkCount || 2, 6))}
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder={`支持导入多条链接（每行一条链接，长链接保持单行不换行）：\nhttps://www.xiaohongshu.com/explore/...\nhttps://www.xiaohongshu.com/explore/...`}
                  className="soft-textarea w-full px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 font-mono resize-y overflow-x-auto whitespace-pre leading-relaxed dark:text-slate-100"
                  style={{ whiteSpace: 'pre', overflowX: 'auto' }}
                />
              </div>

              <button
                type="button"
                onClick={handleParseLink}
                disabled={isParsingLink || !linkInput.trim()}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer flex-shrink-0 active:scale-95 h-fit"
              >
                {isParsingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                <span>
                  {isParsingLink
                    ? '正在批量解析...'
                    : detectedLinkCount > 1
                    ? `开始批量提取 (${detectedLinkCount}篇)`
                    : '开始提取图集'}
                </span>
              </button>
            </div>
          </div>

          {/* Parsed Post Info & Smooth Lazy Gallery */}
          {parsedImages.length > 0 && (
            <div className="space-y-2.5 pt-2.5 border-t border-slate-200/60 animate-fade-in dark:border-white/10">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-[11px] font-bold text-slate-700 truncate max-w-[48%] dark:text-slate-200">
                  📌 {parsedPostTitle || '社媒精选图集'} (共 {parsedImages.length} 张原图，已勾选{' '}
                  {parsedImages.filter((img) => selectedSet.has(img)).length} 张)
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleAutoSelectKeyShots()}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer transition-colors shadow-2xs flex items-center gap-1 active:scale-95"
                    title="智能均匀抽取 6~8 张核心视角，兼顾全面性与极致生成速度"
                  >
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    <span>智能优选 (6~8张)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImages(Array.from(new Set([...selectedImages, ...parsedImages])));
                      showToast(`已全选本图集全部 ${parsedImages.length} 张！`);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-[11px] font-bold cursor-pointer transition-colors shadow-2xs active:scale-95"
                  >
                    全选图集 ({parsedImages.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImages(selectedImages.filter((img) => !parsedImages.includes(img)));
                      showToast('已取消勾选图集');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer transition-colors active:scale-95 dark:text-slate-300 dark:hover:bg-white/10 dark:bg-white/10"
                  >
                    取消选择
                  </button>
                </div>
              </div>

              {/* 流畅分批渲染多图网格 */}
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-6 gap-2.5 max-h-72 overflow-y-auto p-1 custom-scrollbar">
                {parsedImages.slice(0, visibleCount).map((img, idx) => (
                  <ImageGridTile
                    key={img}
                    img={img}
                    idx={idx}
                    isChosen={selectedSet.has(img)}
                    onToggle={handleToggleImage}
                  />
                ))}
              </div>

              {/* 加载更多分页控制 */}
              {parsedImages.length > visibleCount && (
                <div className="flex items-center justify-between pt-1 px-1 text-xs">
                  <span className="text-[11px] text-slate-400 font-mono">
                    正在显示前 {visibleCount} / {parsedImages.length} 张
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((prev) => Math.min(parsedImages.length, prev + 36))}
                      className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1 active:scale-95 dark:text-slate-200 dark:hover:bg-white/10 dark:bg-white/10"
                    >
                      <span>加载更多 (+36)</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleCount(parsedImages.length)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer hover:underline"
                    >
                      全部展开 ({parsedImages.length})
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Panel Content for Local Upload */}
      {sourceType === 'upload' && (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 dark:bg-white/5 dark:border-white/10">
          <label
            {...styleUploadDropProps}
            className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-white group dark:bg-[#18191c]"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center text-indigo-600 transition-colors">
              <UploadCloud className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">点击或拖拽上传爆款参考图片 (支持批量多选 PNG/JPG)</span>
            <span className="text-[11px] text-slate-400">支持同时上传任意多张同风格的图片以增强 AI 提炼准确度</span>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Panel Content for Direct URLs */}
      {sourceType === 'url' && (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 dark:bg-white/5 dark:border-white/10">
          <textarea
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="请输入图片完整直链 URL，一行一个&#10;https://example.com/photo1.jpg&#10;https://example.com/photo2.jpg"
            rows={3}
            className="soft-textarea w-full p-3 text-xs text-slate-900 placeholder-slate-400 font-mono resize-none dark:text-slate-100"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddUrls}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors"
            >
              添加图片链接
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
