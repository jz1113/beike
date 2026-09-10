import { useState } from 'react';
import { Plus, Maximize2, X, AlertCircle } from 'lucide-react';
import type { RefMediaKind } from '@/lib/mediaUpload';
import { RefMediaThumb } from './PromptBarRefMediaThumb';

interface Props {
  images: string[];
  isExpanded: boolean;
  setIsExpanded: (v: boolean) => void;
  frameExpanded?: boolean;
  onUploadClick: () => void;
  onRemove: (idx: number) => void;
  addLabel?: string;
  resolveMediaFile?: (url: string) => File | undefined;
  resolveMediaKind?: (url: string) => RefMediaKind | undefined;
  onPreviewImage?: (index: number) => void;
}

export function PromptBarRefImageStack({
  images,
  setIsExpanded,
  onUploadClick,
  onRemove,
  addLabel = '参考内容',
  resolveMediaFile,
  resolveMediaKind,
  onPreviewImage,
}: Props) {
  const count = images.length;
  if (count === 0) return null;

  // 🌟 鼠标悬浮在整个卡片堆叠区域的状态
  const [isStackHovered, setIsStackHovered] = useState(false);
  const [hoveredCardIdx, setHoveredCardIdx] = useState<number | null>(null);

  // 卡片标准尺寸（标准 3:4 竖版拍立得卡片，精致灵巧）
  const cardW = 'w-[68px] sm:w-[72px] md:w-[74px]';
  const cardH = 'h-[92px] sm:h-[96px] md:h-[98px]';

  const firstImg = images[0];
  const secondImg = images[1];
  const isFirstRejected = Boolean((firstImg as any)?.rejected || (firstImg as any)?.status === 'rejected');
  const isSecondRejected = Boolean((secondImg as any)?.rejected || (secondImg as any)?.status === 'rejected');

  // 🌟 容器物理占位宽度：严格保持单张卡片尺寸（w-[72px] sm:w-[76px] md:w-[80px]），右侧输入框文本紧贴右侧规整对齐
  const containerW = 'w-[72px] sm:w-[76px] md:w-[80px]';

  return (
    <div
      onMouseEnter={() => setIsStackHovered(true)}
      onMouseLeave={() => {
        setIsStackHovered(false);
        setHoveredCardIdx(null);
      }}
      className="relative flex-shrink-0 select-none mr-2.5 sm:mr-3 pt-0.5 group/stack z-20 pointer-events-auto"
    >
      {/* 🌟 叠放卡片主体容器：物理占位仅占卡片1 */}
      <div className={`relative ${cardH} ${containerW} transition-all duration-300 overflow-visible`}>
        {/* 🌟 图2同款微层叠背景（未悬浮时微露右上角层叠白边，呈现立体真实感；悬浮展开时优雅淡出） */}
        {count > 1 && (
          <div
            className={`absolute left-1 top-0 ${cardW} ${cardH} rounded-xl bg-white/90 border-2 border-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] transform rotate-[2deg] z-10 pointer-events-none transition-all duration-300 ${
              isStackHovered ? 'opacity-0 scale-95' : 'opacity-100'
            }`}
            aria-hidden="true"
          />
        )}
        {count > 2 && (
          <div
            className={`absolute left-2 -top-1 ${cardW} ${cardH} rounded-xl bg-white/80 border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] transform rotate-[4deg] z-5 pointer-events-none transition-all duration-300 ${
              isStackHovered ? 'opacity-0 scale-95' : 'opacity-100'
            }`}
            aria-hidden="true"
          />
        )}

        {/* === 卡片 1 (最左/最前层：首张参考素材真实封面) === */}
        <div
          onMouseEnter={() => setHoveredCardIdx(0)}
          onMouseLeave={() => setHoveredCardIdx((prev) => (prev === 0 ? null : prev))}
          className={`absolute left-0 top-1 ${cardW} ${cardH} transform -rotate-[5deg] hover:-rotate-[6deg] hover:scale-105 hover:z-40 transition-all duration-300 z-30 group/card1 pointer-events-auto`}
        >
          {/* 卡片主体：点击放大预览 */}
          <div
            onClick={() => {
              if (onPreviewImage) {
                onPreviewImage(0);
              } else {
                setIsExpanded(true);
              }
            }}
            className="w-full h-full rounded-xl overflow-hidden bg-white border-2 border-white shadow-[0_4px_14px_rgba(0,0,0,0.12)] cursor-zoom-in relative"
            title="点击放大查看素材"
          >
            <RefMediaThumb
              url={firstImg}
              file={resolveMediaFile?.(firstImg)}
              mediaKind={resolveMediaKind?.(firstImg)}
              alt="参考素材-1"
              className="w-full h-full object-cover pointer-events-none"
            />

            {/* 未通过状态提示遮罩 */}
            {isFirstRejected && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[0.5px] flex flex-col items-center justify-center gap-0.5 text-white pointer-events-none">
                <AlertCircle className="w-4 h-4 text-white/90 stroke-[2.2]" />
                <span className="text-[10px] font-bold text-white/95">未通过</span>
              </div>
            )}
          </div>

          {/* 🌟 还原图2：未悬浮时左下角素材数量标签 */}
          {count > 1 && !isStackHovered && (
            <span className="absolute bottom-1.5 left-1.5 px-1.5 min-w-[20px] h-5 rounded-md bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold flex items-center justify-center pointer-events-none tabular-nums z-30 shadow-xs">
              {count}
            </span>
          )}

          {/* 🌟 还原图2：未悬浮时右下角加号圆形按钮（点击添加更多参考素材） */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUploadClick();
            }}
            className={`absolute -bottom-1 -right-1 w-[22px] h-[22px] rounded-full bg-white/95 text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.18)] border border-slate-200/80 flex items-center justify-center hover:scale-110 active:scale-95 transition-all cursor-pointer z-35 ${
              isStackHovered ? 'opacity-0 pointer-events-none scale-75' : 'opacity-100 pointer-events-auto scale-100'
            }`}
            title="添加参考素材"
            aria-label="添加参考素材"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.4]" />
          </button>

          {/* 🌟 卡片右上角悬浮删除按钮（悬浮在卡片1上时显示） */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(0);
            }}
            className={`absolute -top-2 -right-2 w-[22px] h-[22px] rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/25 flex items-center justify-center cursor-pointer z-40 transition-all duration-200 hover:scale-115 active:scale-95 group-hover/card1:opacity-100 group-hover/card1:pointer-events-auto ${
              hoveredCardIdx === 0
                ? 'opacity-100 scale-100 pointer-events-auto'
                : 'opacity-0 scale-90 pointer-events-none'
            }`}
            title="删除此素材"
            aria-label="删除此素材"
          >
            <X className="w-3 h-3 stroke-[2.2]" />
          </button>
        </div>

        {/* === 卡片 2 (中间层：仅在悬浮时向右滑开展开；未悬浮时收拢隐藏在卡片1背后，只显单张) === */}
        {count === 2 && secondImg && (
          <div
            onMouseEnter={() => setHoveredCardIdx(1)}
            onMouseLeave={() => setHoveredCardIdx((prev) => (prev === 1 ? null : prev))}
            className={`absolute top-0.5 ${cardW} ${cardH} transform -rotate-[1deg] hover:rotate-0 hover:scale-105 hover:z-40 transition-all duration-300 z-20 group/card2 ${
              isStackHovered
                ? 'left-[50px] sm:left-[52px] md:left-[54px] opacity-100 scale-100 pointer-events-auto'
                : 'left-0 opacity-0 scale-95 pointer-events-none'
            }`}
          >
            <div
              onClick={() => {
                if (onPreviewImage) {
                  onPreviewImage(1);
                } else {
                  setIsExpanded(true);
                }
              }}
              className="w-full h-full rounded-xl overflow-hidden bg-white border-2 border-white shadow-[0_4px_14px_rgba(0,0,0,0.12)] cursor-zoom-in relative"
              title="点击放大查看第2张素材"
            >
              <RefMediaThumb
                url={secondImg}
                file={resolveMediaFile?.(secondImg)}
                mediaKind={resolveMediaKind?.(secondImg)}
                alt="参考素材-2"
                className="w-full h-full object-cover pointer-events-none"
              />

              {isSecondRejected && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[0.5px] flex flex-col items-center justify-center gap-0.5 text-white pointer-events-none">
                  <AlertCircle className="w-4 h-4 text-white/90 stroke-[2.2]" />
                  <span className="text-[10px] font-bold text-white/95">未通过</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(1);
              }}
              className={`absolute -top-2 -right-2 w-[22px] h-[22px] rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/25 flex items-center justify-center cursor-pointer z-30 transition-all duration-200 hover:scale-115 active:scale-95 group-hover/card2:opacity-100 group-hover/card2:pointer-events-auto ${
                hoveredCardIdx === 1
                  ? 'opacity-100 scale-100 pointer-events-auto'
                  : 'opacity-0 scale-90 pointer-events-none'
              }`}
              title="删除第2张素材"
              aria-label="删除第2张素材"
            >
              <X className="w-3 h-3 stroke-[2.2]" />
            </button>
          </div>
        )}

        {count >= 3 && (
          <div
            onClick={() => setIsExpanded(true)}
            className={`absolute top-0.5 ${cardW} ${cardH} rounded-xl overflow-hidden bg-gradient-to-b from-[#3a3c42] via-[#2a2c32] to-[#1e2024] border border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.18)] transform -rotate-[1deg] hover:rotate-0 hover:scale-105 hover:z-40 transition-all duration-300 cursor-pointer z-20 group/second ${
              isStackHovered
                ? 'left-[50px] sm:left-[52px] md:left-[54px] opacity-100 scale-100 pointer-events-auto'
                : 'left-0 opacity-0 scale-95 pointer-events-none'
            }`}
            title={`共 ${count} 个素材，点击展开全部素材卡片`}
          >
            {secondImg && (
              <RefMediaThumb
                url={secondImg}
                file={resolveMediaFile?.(secondImg)}
                mediaKind={resolveMediaKind?.(secondImg)}
                alt="参考素材-2"
                className="w-full h-full object-cover opacity-25 pointer-events-none"
              />
            )}

            {/* 深灰底正中醒目的双向全屏展开箭头 ⤢ (对齐图1，中心完全露显) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Maximize2 className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-white/95 stroke-[2.2] drop-shadow-sm group-hover/second:scale-110 transition-transform" />
            </div>
          </div>
        )}

        {/* === 卡片 3 (最右后层：便签卡片，对齐“+ 参考内容”，仅在悬浮时展开向右滑出) === */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onUploadClick();
          }}
          className={`absolute top-1 ${cardW} ${cardH} rounded-xl bg-[#F8F9FA] hover:bg-white border border-slate-200/90 hover:border-slate-300 shadow-[0_4px_12px_rgba(0,0,0,0.06)] transform rotate-[5deg] hover:rotate-[3deg] hover:scale-105 hover:z-40 transition-all duration-300 flex flex-col items-center justify-center gap-1.5 cursor-pointer z-10 group/add select-none ${
            isStackHovered
              ? count === 1
                ? 'left-[50px] sm:left-[52px] md:left-[54px] opacity-100 scale-100 pointer-events-auto'
                : 'left-[100px] sm:left-[104px] md:left-[108px] opacity-100 scale-100 pointer-events-auto'
              : 'left-0 opacity-0 scale-90 pointer-events-none'
          }`}
          title="添加更多参考素材"
        >
          <Plus className="w-5 h-5 text-slate-400 group-hover/add:text-slate-700 transition-colors stroke-[1.8]" />
          <span className="text-[10.5px] sm:text-[11px] font-medium text-slate-500 group-hover/add:text-slate-800 leading-tight tracking-tight">
            {addLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
