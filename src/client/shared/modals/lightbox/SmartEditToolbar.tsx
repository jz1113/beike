import { X, MapPin, Crop, RotateCcw, RotateCw, Minus, Plus } from 'lucide-react';

interface SmartEditToolbarProps {
  editMode: 'box' | 'point';
  setEditMode: (mode: 'box' | 'point') => void;
  historyIndex: number;
  historyLength: number;
  zoomLevel: number;
  handleUndo: () => void;
  handleRedo: () => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  onClose: () => void;
}

export function SmartEditToolbar({ editMode, setEditMode, historyIndex, historyLength, zoomLevel,
  handleUndo, handleRedo, handleZoomIn, handleZoomOut, onClose }: SmartEditToolbarProps) {
  return (
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 shrink-0 gap-3 dark:border-white/10">
          {/* 左侧：标题与改图模式切换 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#007AFF] shadow-sm" />
              <h3 className="text-[17px] font-bold text-slate-900 tracking-tight dark:text-slate-100">智能改图</h3>
            </div>

            <div className="h-4 w-[1px] bg-slate-200 dark:bg-white/10" />

            {/* 模式选择胶囊：框选 / 标记 */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/90 border border-slate-200/80 dark:bg-white/10 dark:border-white/10">
              {/* 1. 框选模式切换按钮 */}
              <button
                type="button"
                onClick={() => setEditMode('box')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  editMode === 'box'
                    ? 'bg-white text-[#007AFF] shadow-xs font-bold dark:bg-[#18191c]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 dark:hover:text-white dark:text-slate-300'
                }`}
                title="按住鼠标左键在图片上拖拽即可框选区域"
              >
                <Crop className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>框选</span>
              </button>

              {/* 2. 单点标记模式切换按钮 */}
              <button
                type="button"
                onClick={() => setEditMode('point')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  editMode === 'point'
                    ? 'bg-white text-[#007AFF] shadow-xs font-bold dark:bg-[#18191c]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 dark:hover:text-white dark:text-slate-300'
                }`}
                title="点击图片放置单点水滴标记"
              >
                <MapPin className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>标记</span>
              </button>
            </div>

            <span className="hidden md:inline-block text-xs text-slate-400 font-normal">
              {editMode === 'box' ? '按住鼠标在画面上拖拽创建选区' : '点击画面任意位置放置定位点'}
            </span>
          </div>

          {/* 右侧：撤销重做 + 缩放比例 + 关闭按钮 */}
          <div className="flex items-center gap-2">
            {/* 撤销 / 重做 */}
            <div className="flex items-center gap-0.5 p-1 rounded-xl bg-slate-100/90 border border-slate-200/80 dark:bg-white/10 dark:border-white/10">
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyIndex < 0}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors dark:hover:text-white dark:text-slate-400 dark:hover:bg-white/10"
                title="撤销"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={historyIndex + 1 >= historyLength}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors dark:hover:text-white dark:text-slate-400 dark:hover:bg-white/10"
                title="重做"
              >
                <RotateCw className="w-3.5 h-3.5 stroke-[2]" />
              </button>
            </div>

            {/* 缩放比例控制 */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/90 border border-slate-200/80 text-xs font-medium text-slate-700 font-mono dark:text-slate-200 dark:bg-white/10 dark:border-white/10">
              <button
                type="button"
                onClick={handleZoomOut}
                className="hover:text-black cursor-pointer p-0.5"
                title="缩小"
              >
                <Minus className="w-3 h-3 stroke-[2.5]" />
              </button>
              <span className="w-9 text-center select-none text-[11px] font-semibold">{zoomLevel}%</span>
              <button
                type="button"
                onClick={handleZoomIn}
                className="hover:text-black cursor-pointer p-0.5"
                title="放大"
              >
                <Plus className="w-3 h-3 stroke-[2.5]" />
              </button>
            </div>

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer ml-1 dark:hover:bg-white/10"
              title="关闭 (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

  );
}
