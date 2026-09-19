import { handleWindowDrag, handleWindowDoubleClick } from '@/shared/desktop/windowDrag';
import type { ChatSession } from '@/store';
import { GenerateSessionDropdown } from './GenerateSessionDropdown';

export interface GenerateWorkspaceToolbarProps {
  activeSessionTitle?: string;
  sessions?: ChatSession[];
  currentSessionId?: string;
  onCreateSession?: () => void;
  onSwitchSession?: (id: string) => void;
  onDeleteSession?: (id: string, title?: string) => void;
  onRenameSession?: (id: string, newTitle: string) => void;
}

export function GenerateWorkspaceToolbar({
  activeSessionTitle,
  sessions,
  currentSessionId,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
  onRenameSession,
}: GenerateWorkspaceToolbarProps) {
  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
      onDoubleClick={handleWindowDoubleClick}
      className="w-full h-12 py-1.5 px-4 sm:px-6 xl:px-8 bg-transparent flex items-center justify-between gap-3 shrink-0 z-20 select-none cursor-default"
    >
      {/* 🌟 左侧：通栏靠左对齐的高质感会话环境胶囊（作为当前工作区/会话的顶级切换器） */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {sessions && currentSessionId && onSwitchSession && onCreateSession && onRenameSession && onDeleteSession ? (
          <GenerateSessionDropdown
            sessions={sessions}
            currentSessionId={currentSessionId}
            activeSessionTitle={activeSessionTitle}
            onCreateSession={onCreateSession}
            onSwitchSession={onSwitchSession}
            onDeleteSession={(id, title) => onDeleteSession(id, title)}
            onRenameSession={onRenameSession}
          />
        ) : (
          <div className="h-8 px-3 rounded-lg sm:rounded-xl bg-white border border-slate-200/90 text-slate-800 text-[13px] font-medium flex items-center shadow-2xs">
            <span className="truncate max-w-[160px] sm:max-w-[220px]">
              {activeSessionTitle || '新创作对话'}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
