import {
  Brain,
  Plus,
  Clock,
  ChevronRight,
  Shield,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { handleWindowDrag, handleWindowDoubleClick } from '@/lib/windowDrag';

interface AssistantDrawerHeaderProps {
  sessionTitle: string;
  sessionsCount: number;
  isExpanded: boolean;
  onCreateSession: () => void;
  onOpenHistory: () => void;
  onOpenMemory?: () => void;
  onOpenPermissions: () => void;
  onToggleExpanded: () => void;
  onCloseAssistant: () => void;
}

export default function AssistantDrawerHeader({
  sessionTitle,
  sessionsCount,
  isExpanded,
  onCreateSession,
  onOpenHistory,
  onOpenMemory,
  onOpenPermissions,
  onToggleExpanded,
  onCloseAssistant,
}: AssistantDrawerHeaderProps) {
  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
      onDoubleClick={handleWindowDoubleClick}
      className="h-14 px-4 sm:px-5 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between flex-shrink-0 cursor-default relative z-10"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />
        <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-wide truncate max-w-[120px] sm:max-w-[160px]">
          {sessionTitle}
        </h3>
      </div>

      <div className="flex items-center gap-1">
        {/* 新建对话 */}
        <button
          onClick={onCreateSession}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          title="发起新对话"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* 历史对话记录抽屉 */}
        <button
          onClick={onOpenHistory}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer relative"
          title="历史对话记录"
        >
          <Clock className="w-4 h-4" />
          {sessionsCount > 1 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
          )}
        </button>



        {onOpenMemory && <button onClick={onOpenMemory} title="会话记忆" aria-label="会话记忆" className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100"><Brain className="w-4 h-4" /></button>}
        {/* 🛡 工具权限白名单 */}
        <button
          onClick={onOpenPermissions}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          title="工具权限管理"
        >
          <Shield className="w-4 h-4" />
        </button>

        {/* 展开/宽屏切换 */}
        <button
          onClick={onToggleExpanded}
          className="flex p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          title={isExpanded ? '收起宽屏' : '展开宽屏'}
        >
          {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* 关闭/收起抽屉 */}
        <button
          onClick={onCloseAssistant}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer ml-1"
          title="收起助手"
        >
          <ChevronRight className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
}
