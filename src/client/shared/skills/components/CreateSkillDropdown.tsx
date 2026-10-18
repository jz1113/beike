import { useEffect, useRef } from 'react';
import { Sparkles, Upload, PenTool } from 'lucide-react';

export interface CreateSkillDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAgentCreate: () => void;
  onSelectLocalUpload: () => void;
  onSelectManualCreate: () => void;
}

export function CreateSkillDropdown({
  isOpen,
  onClose,
  onSelectAgentCreate,
  onSelectLocalUpload,
  onSelectManualCreate,
}: CreateSkillDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="创建技能方式"
      className="absolute right-0 top-full mt-2 z-50 w-44 overflow-hidden rounded-2xl border border-black/[0.08] dark:border-white/10 bg-white/95 dark:bg-[#1E1E22]/95 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onSelectAgentCreate();
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100/90 dark:hover:bg-white/[0.08] active:scale-[0.98] cursor-pointer"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
          <span>通过Agent创建</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onSelectLocalUpload();
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100/90 dark:hover:bg-white/[0.08] active:scale-[0.98] cursor-pointer"
        >
          <Upload className="h-4 w-4 shrink-0 text-blue-500" />
          <span>上传本地Skill</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onSelectManualCreate();
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100/90 dark:hover:bg-white/[0.08] active:scale-[0.98] cursor-pointer"
        >
          <PenTool className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>手动创建Skill</span>
        </button>
      </div>
    </div>
  );
}
