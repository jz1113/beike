import { useState } from 'react';
import { Plus, Maximize2, X, AlertCircle } from 'lucide-react';
import type { RefMediaKind } from '@client/shared/api/mediaUpload';
import { RefMediaThumb } from './PromptBarRefMediaThumb';

interface Props {
  images: string[];
  isExpanded: boolean;
  setIsExpanded: (v: boolean) => void;
  frameExpanded?: boolean;
  onUploadClick: () => void;
  onRemove: (idx: number) => void;
  resolveMediaFile?: (url: string) => File | undefined;
  resolveMediaKind?: (url: string) => RefMediaKind | undefined;
  onPreviewImage?: (index: number) => void;
}

export function PromptBarRefImageStack({
  images,
  setIsExpanded,
  onUploadClick,
  onRemove,
  resolveMediaFile,
  resolveMediaKind,
  onPreviewImage,
}: Props) {
  const [isStackHovered, setIsStackHovered] = useState(false);
  const [hoveredCardIdx, setHoveredCardIdx] = useState<number | null>(null);
  const count = images.length;
  if (count === 0) return null;

  // 卡片标准尺寸（标准 3:4 竖版拍立得卡片，精致灵巧）
  const cardW = 'w-[68px] sm:w-[72px] md:w-[74px]';
  const cardH = 'h-[92px] sm:h-[96px] md:h-[98px]';

  const firstImg = images[0];
  const secondImg = images[1];
  const isFirstRejected = Boolean((firstImg as any)?.rejected || (firstImg as any)?.status === 'rejected');
  const isSecondRejected = Boolean((secondImg as any)?.rejected || (secondImg as any)?.status === 'rejected');

  // 🌟 容器物理占位宽度：严格保持单张卡片尺寸（w-[72px] sm:w-[76px] md:w-[80px]），右侧输入框文本紧贴右侧规整对齐
  const containerW = 'w-[72px] sm:w-[76px] md:w-[80px]';

  // 🌟 平滑扇形展开过渡曲线（参考图3：丝滑高弹性展开曲线）
  const fanTransition = {
    transition: 'transform 380ms cubic-bezier(0.16, 1, 0.3, 1), left 380ms cubic-bezier(0.16, 1, 0.3, 1), opacity 260ms ease, scale 380ms cubic-bezier(0.16, 1, 0.3, 1)',
  };

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
      <div className={`relative ${cardH} ${containerW} overflow-visible`}>
        {/* 🌟 未悬浮时微露右上角层叠白边，呈现立体真实感；悬浮展开时优雅淡出 */}
        {count > 1 && (
          <div
            className={`absolute left-1 top-0 ${cardW} ${cardH} rounded-xl bg-white/90 border-2 border-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] transform rotate-[2deg] z-10 pointer-events-none transition-all duration-300 dark:border-white/15 dark:bg-[#222328]/95 ${
              isStackHovered ? 'opacity-0 scale-95' : 'opacity-100'
            }`}
            aria-hidden="true"
          />
        )}
        {count > 2 && (
          <div
            className={`absolute left-2 -top-1 ${cardW} ${cardH} rounded-xl bg-white/80 border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] transform rotate-[4deg] z-5 pointer-events-none transition-all duration-300 dark:border-white/15 dark:bg-[#222328]/95 ${
              isStackHovered ? 'opacity-0 scale-95' : 'opacity-100'
            }`}
            aria-hidden="true"
          />
        )}

        {/* === 卡片 1 (最左/首图：对标图3向左微倾 -5°，z-30) === */}
        <div
          onMouseEnter={() => setHoveredCardIdx(0)}
          onMouseLeave={() => setHoveredCardIdx((prev) => (prev === 0 ? null : prev))}
          style={fanTransition}
          className={`absolute left-0 top-1 ${cardW} ${cardH} transform -rotate-[5deg] hover:-rotate-[6deg] hover:scale-105 hover:z-40 z-30 group/card1 pointer-events-auto`}
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
            className="w-full h-full rounded-xl overflow-hidden bg-white border-2 border-white shadow-[0_4px_14px_rgba(0,0,0,0.12)] cursor-zoom-in relative dark:border-white/15 dark:bg-[#222328]"
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

          {/* 🌟 未悬浮时左下角素材数量标签 */}
          {count > 1 && !isStackHovered && (
            <span className="absolute bottom-1.5 left-1.5 px-1.5 min-w-[20px] h-5 rounded-md bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold flex items-center justify-center pointer-events-none tabular-nums z-30 shadow-xs">
              {count}
            </span>
          )}

          {/* 🌟 未悬浮时右下角加号圆形按钮（点击添加更多参考素材） */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUploadClick();
            }}
            className={`absolute -bottom-1 -right-1 w-[22px] h-[22px] rounded-full bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.14)] border border-slate-200/90 flex items-center justify-center hover:scale-110 active:scale-95 transition-all cursor-pointer z-35 dark:border-white/20 dark:bg-[#2c2d31] dark:text-white dark:hover:bg-white/15 dark:hover:text-white ${
              isStackHovered ? 'opacity-0 pointer-events-none scale-75' : 'opacity-100 pointer-events-auto scale-100'
            }`}
            title="添加参考素材"
            aria-label="添加参考素材"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.4]" />
          </button>

          {/* 🌟 卡片右上角悬浮删除按钮（严格对标图3：平时隐藏不遮挡邻卡，仅鼠标悬停卡片1时才淡入显示） */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(0);
            }}
            className={`absolute -top-1.5 -right-1.5 w-[20px] h-[20px] rounded-full bg-black/80 hover:bg-black text-white shadow-md border border-white/30 flex items-center justify-center cursor-pointer z-40 transition-all duration-200 hover:scale-110 active:scale-95 ${
              hoveredCardIdx === 0 && isStackHovered
                ? 'opacity-100 scale-100 pointer-events-auto'
                : 'opacity-0 scale-75 pointer-events-none'
            }`}
            title="删除此素材"
            aria-label="删除此素材"
          >
            <X className="w-3 h-3 stroke-[2.2]" />
          </button>
        </div>

        {/* === 卡片 2 (中间层：对标图3位移展开至约 64px~70px，近垂直，露出>75%宽幅，z-20) === */}
        {count === 2 && secondImg && (
          <div
            onMouseEnter={() => setHoveredCardIdx(1)}
            onMouseLeave={() => setHoveredCardIdx((prev) => (prev === 1 ? null : prev))}
            style={fanTransition}
            className={`absolute top-0.5 ${cardW} ${cardH} transform -rotate-[0.5deg] hover:rotate-0 hover:scale-105 hover:z-40 z-20 group/card2 ${
              isStackHovered
                ? 'left-[62px] sm:left-[66px] md:left-[70px] opacity-100 scale-100 pointer-events-auto'
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
              className="w-full h-full rounded-xl overflow-hidden bg-white border-2 border-white shadow-[0_4px_14px_rgba(0,0,0,0.12)] cursor-zoom-in relative dark:border-white/15 dark:bg-[#222328]"
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

            {/* 仅鼠标悬停卡片2时才淡入删除按钮 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(1);
              }}
              className={`absolute -top-1.5 -right-1.5 w-[20px] h-[20px] rounded-full bg-black/80 hover:bg-black text-white shadow-md border border-white/30 flex items-center justify-center cursor-pointer z-40 transition-all duration-200 hover:scale-110 active:scale-95 ${
                hoveredCardIdx === 1 && isStackHovered
                  ? 'opacity-100 scale-100 pointer-events-auto'
                  : 'opacity-0 scale-75 pointer-events-none'
              }`}
              title="删除第2张素材"
              aria-label="删除第2张素材"
            >
              <X className="w-3 h-3 stroke-[2.2]" />
            </button>
          </div>
        )}

        {/* 素材 >= 3 时，中间卡片显示聚合概览 */}
        {count >= 3 && (
          <div
            onClick={() => setIsExpanded(true)}
            style={fanTransition}
            className={`absolute top-0.5 ${cardW} ${cardH} rounded-xl bg-white border-2 border-white shadow-[0_4px_14px_rgba(0,0,0,0.08)] transform -rotate-[0.5deg] hover:rotate-0 hover:scale-105 hover:z-40 cursor-pointer z-20 group/second p-1 dark:border-white/15 dark:bg-[#222328] ${
              isStackHovered
                ? 'left-[62px] sm:left-[66px] md:left-[70px] opacity-100 scale-100 pointer-events-auto'
                : 'left-0 opacity-0 scale-95 pointer-events-none'
            }`}
            title={`共 ${count} 个素材，点击展开全部素材卡片`}
          >
            <div className="w-full h-full rounded-lg overflow-hidden bg-slate-50/80 relative flex items-center justify-center dark:bg-white/5">
              {secondImg && (
                <RefMediaThumb
                  url={secondImg}
                  file={resolveMediaFile?.(secondImg)}
                  mediaKind={resolveMediaKind?.(secondImg)}
                  alt="参考素材-2"
                  className="w-full h-full object-cover opacity-20 pointer-events-none"
                />
              )}

              <div className="absolute inset-0 bg-slate-50/60 backdrop-blur-[0.5px] flex flex-col items-center justify-center gap-1 dark:bg-white/5">
                <div className="w-7 h-7 rounded-full bg-white shadow-xs border border-slate-200/60 flex items-center justify-center text-slate-500 group-hover/second:text-slate-800 group-hover/second:border-slate-300 transition-all dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:group-hover/second:border-white/30 dark:group-hover/second:text-white">
                  <Maximize2 className="w-3.5 h-3.5 text-slate-600 stroke-[2.2] group-hover/second:scale-110 transition-transform dark:text-slate-300" />
                </div>
                <span className="text-[10px] font-semibold text-slate-500 group-hover/second:text-slate-700 transition-colors dark:text-slate-400">
                  +{count - 1}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* === 卡片 3 (最右后层：白底拍立得槽位风格加号卡片，向右倾斜 +7°，平滑展开滑出，z-10) === */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onUploadClick();
          }}
          style={fanTransition}
          className={`absolute top-1 ${cardW} ${cardH} rounded-xl bg-white border-2 border-white shadow-[0_4px_14px_rgba(0,0,0,0.08)] transform rotate-[7deg] hover:rotate-[5deg] hover:scale-105 hover:z-40 flex items-center justify-center cursor-pointer z-10 group/add select-none p-1 dark:border-white/15 dark:bg-[#222328] ${
            isStackHovered
              ? count === 1
                ? 'left-[62px] sm:left-[66px] md:left-[70px] opacity-100 scale-100 pointer-events-auto'
                : 'left-[124px] sm:left-[132px] md:left-[140px] opacity-100 scale-100 pointer-events-auto'
              : 'left-0 opacity-0 scale-90 pointer-events-none'
          }`}
          title="添加更多参考素材"
          aria-label="添加更多参考素材"
        >
          <div className="w-full h-full rounded-lg border border-dashed border-slate-200/90 group-hover/add:border-slate-300 bg-slate-50/50 group-hover/add:bg-slate-100/70 flex flex-col items-center justify-center gap-1 transition-colors dark:border-white/15 dark:bg-white/[0.04] dark:group-hover/add:border-white/30 dark:group-hover/add:bg-white/[0.08]">
            <div className="w-7 h-7 rounded-full bg-white shadow-xs border border-slate-200/60 flex items-center justify-center text-slate-500 group-hover/add:text-slate-800 group-hover/add:border-slate-300 transition-all dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:group-hover/add:border-white/30 dark:group-hover/add:text-white">
              <Plus className="w-3.5 h-3.5 stroke-[2.2] group-hover/add:rotate-90 transition-transform duration-300" />
            </div>
            <span className="text-[10px] font-medium text-slate-400 group-hover/add:text-slate-600 transition-colors dark:text-slate-400 dark:group-hover/add:text-slate-200">
              添加
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
