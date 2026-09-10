import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, Check, Play, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import type { GenerationTask } from '@/types/app-store';

export interface CanvasAssetImportModalProps {
  isOpen: boolean;
  modalTab: 'image' | 'video';
  tasks: GenerationTask[];
  onClose: () => void;
  onConfirmImport: (selectedTasks: GenerationTask[]) => void;
  onUploadLocalFile?: () => void;
}

// 🌟 单项资产卡片：细粒度记忆化，仅在自身的 isSelected 发生变化时才触发重新渲染
interface AssetCardItemProps {
  task: GenerationTask;
  isSelected: boolean;
  isVid: boolean;
  mediaSrc: string;
  onToggle: (id: string, e?: React.MouseEvent) => void;
  onDoubleClick: (task: GenerationTask) => void;
}

const AssetCardItem = React.memo<AssetCardItemProps>(
  ({ task, isSelected, isVid, mediaSrc, onToggle, onDoubleClick }) => {
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        onToggle(task.id, e);
      },
      [onToggle, task.id]
    );

    const handleCheckboxClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle(task.id, e);
      },
      [onToggle, task.id]
    );

    const handleDoubleClick = useCallback(() => {
      onDoubleClick(task);
    }, [onDoubleClick, task]);

    return (
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        style={{ contain: 'content', transform: 'translateZ(0)' }}
        className={`group relative aspect-square rounded-2xl overflow-hidden border bg-slate-100/90 cursor-pointer transition-all duration-150 select-none ${
          isSelected
            ? 'border-indigo-500 ring-2 ring-indigo-500 shadow-md'
            : 'border-slate-200/80 hover:border-slate-300 hover:shadow-xs'
        }`}
      >
        {/* 🌟 左上角复选框 (严格对齐设计稿与测试用例) */}
        <div
          onClick={handleCheckboxClick}
          className={`absolute top-2 left-2 z-20 w-4.5 h-4.5 rounded-md flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-black/35 border border-white/40 group-hover:bg-black/55'
          }`}
        >
          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
        </div>

        {/* 媒体封面：异步解码 + 懒加载 + 平滑渐显 + 错误降级 */}
        {mediaSrc && !imgError ? (
          <img
            src={mediaSrc}
            alt={task.title || (isVid ? '视频资产' : '图片资产')}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover transition-all duration-200 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            } ${isSelected ? 'scale-98' : 'group-hover:scale-102'}`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100">
            {isVid ? <VideoIcon className="w-6 h-6 stroke-[1.5]" /> : <ImageIcon className="w-6 h-6 stroke-[1.5]" />}
          </div>
        )}

        {/* 视频标记 */}
        {isVid && (
          <div className="absolute bottom-2 right-2 z-10 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[10px] flex items-center gap-1 font-medium pointer-events-none">
            <Play className="w-2.5 h-2.5 fill-white" />
            <span>视频</span>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.isSelected === next.isSelected &&
      prev.task.id === next.task.id &&
      prev.mediaSrc === next.mediaSrc &&
      prev.isVid === next.isVid
    );
  }
);
AssetCardItem.displayName = 'AssetCardItem';

/**
 * 高性能资产选择弹窗组件
 * 状态彻底内聚在组件内部，勾选多选操作 0 触发外部巨型画布重绘
 */
export const CanvasAssetImportModal: React.FC<CanvasAssetImportModalProps> = ({
  isOpen,
  modalTab,
  tasks,
  onClose,
  onConfirmImport,
  onUploadLocalFile,
}) => {
  // 模态框内部自管理状态
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(60);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 每次打开模态框或切换 Tab 时重置状态
  useEffect(() => {
    if (isOpen) {
      setSelectedAssetIds(new Set());
      setVisibleCount(60);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [isOpen, modalTab]);

  // 全部资产（仅展示对应媒体类型的资产）
  const filteredAssets = tasks;

  // 渐进分批渲染列表（首屏极速呈现，向下滚动加载后续批次）
  const displayedAssets = useMemo(() => {
    return filteredAssets.slice(0, visibleCount);
  }, [filteredAssets, visibleCount]);

  // 滚动触底渐进加载更多卡片
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) {
      setVisibleCount((prev) => {
        if (prev < filteredAssets.length) {
          return Math.min(prev + 40, filteredAssets.length);
        }
        return prev;
      });
    }
  }, [filteredAssets.length]);

  // 单选/多选切换：状态更新限定在当前组件内
  const handleToggleSelectAsset = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 双击单项直接置入并关闭
  const handleDoubleClickAsset = useCallback(
    (task: GenerationTask) => {
      onConfirmImport([task]);
    },
    [onConfirmImport]
  );

  // 点击底部确认按钮置入所选项
  const handleConfirm = useCallback(() => {
    if (selectedAssetIds.size === 0) return;
    const selectedTasks = filteredAssets.filter((t) => selectedAssetIds.has(t.id));
    onConfirmImport(selectedTasks);
  }, [filteredAssets, selectedAssetIds, onConfirmImport]);

  // 支持键盘 Esc 键关闭以及 Enter 快捷确认
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && selectedAssetIds.size > 0) {
        // 如果用户正在输入文本则不抢占 Enter 键
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, selectedAssetIds.size, handleConfirm]);

  if (!isOpen) return null;

  const isImageMode = modalTab === 'image';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4">
      <div
        className="w-full max-w-3xl xl:max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗顶栏：标题与关闭 */}
        <div className="flex items-center justify-between pb-1">
          <h3 className="text-base font-bold text-slate-900 tracking-tight">资产选取</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 分类过滤胶囊 (严格对应当前媒体类型) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-900 transition-all cursor-default"
          >
            {isImageMode ? '所有图片' : '所有视频'}
          </button>
        </div>

        {/* 资产栅格列表：带触底增量加载的虚拟/分页滚动 */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto min-h-72 max-h-[58vh] pr-1"
        >
          {filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-xs gap-2 select-none">
              {isImageMode ? (
                <ImageIcon className="w-10 h-10 text-slate-300 stroke-[1.4]" />
              ) : (
                <VideoIcon className="w-10 h-10 text-slate-300 stroke-[1.4]" />
              )}
              <span>暂无符合条件的{isImageMode ? '图片' : '视频'}资产</span>
              {onUploadLocalFile && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onUploadLocalFile();
                  }}
                  className="mt-2 px-4 py-1.5 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  本地上传{isImageMode ? '图片' : '视频'}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {displayedAssets.map((task) => {
                const isSelected = selectedAssetIds.has(task.id);
                const isVid = !isImageMode;
                const mediaSrc = isVid
                  ? task.productImageUrl || task.referenceImageUrl || task.resultUrl || ''
                  : task.resultUrl || (task as any).outputUrl || '';

                return (
                  <AssetCardItem
                    key={task.id}
                    task={task}
                    isSelected={isSelected}
                    isVid={isVid}
                    mediaSrc={mediaSrc}
                    onToggle={handleToggleSelectAsset}
                    onDoubleClick={handleDoubleClickAsset}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* 弹窗底栏：已选数量与确认按钮 */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium select-none">
              已选 {selectedAssetIds.size} {isImageMode ? '张图片' : '个视频'}
            </span>
            {selectedAssetIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedAssetIds(new Set())}
                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer font-medium transition-colors"
              >
                清空
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedAssetIds.size === 0}
              onClick={handleConfirm}
              className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedAssetIds.size > 0
                  ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-md cursor-pointer active:scale-95'
                  : 'bg-slate-200/70 text-slate-400 cursor-not-allowed'
              }`}
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CanvasAssetImportModal;
