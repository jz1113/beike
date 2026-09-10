import { handleWindowDrag, handleWindowDoubleClick } from '@/lib/windowDrag';
import { isTauriDesktop } from '@/lib/desktopRuntime';

export default function MacTitleBar() {
  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
      onDoubleClick={handleWindowDoubleClick}
      className="w-full h-8 flex-shrink-0 bg-[#2D3139] border-b border-black/20 flex items-center justify-between px-3 select-none z-50 cursor-default transition-colors"
    >
      {/* 🌟 左侧：为 macOS 原生红绿灯交通灯预留 74px 安全间距 */}
      <div
        data-tauri-drag-region
        className="w-[72px] sm:w-[76px] h-full flex-shrink-0 flex items-center pointer-events-none"
      />

      {/* 🌟 中间：可拖拽区域 + 纯白窗口标题 */}
      <div
        data-tauri-drag-region
        onMouseDown={handleWindowDrag}
        onDoubleClick={handleWindowDoubleClick}
        className="flex-1 h-full flex items-center justify-center gap-1.5 pointer-events-auto"
      >
        <span
          data-tauri-drag-region
          className="text-[11.5px] font-medium text-white tracking-wide select-none"
        >
          贝壳云图
        </span>
      </div>

      {/* 🌟 右侧：可拖拽区域（与左侧红绿灯对称平衡） */}
      <div
        data-tauri-drag-region
        className="w-[72px] sm:w-[76px] h-full flex-shrink-0 flex items-center justify-end pointer-events-auto"
      >
        {isTauriDesktop() && (
          <span
            data-tauri-drag-region
            className="text-[10px] font-mono text-white/60 tracking-tight"
          >
            v1.0.0
          </span>
        )}
      </div>
    </header>
  );
}
