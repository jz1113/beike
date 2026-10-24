import { useEffect, useRef } from 'react';

export interface CreateSkillDropdownProps {
  purpose?: 'agent' | 'creation';
  isOpen: boolean;
  onClose: () => void;
  onSelectAgentCreate: () => void;
  onSelectLocalUpload: () => void;
  onSelectManualCreate: () => void;
  onSelectReference?: () => void;
  onSelectWorkshop?: () => void;
}

export function CreateSkillDropdown({
  isOpen,
  onClose,
  onSelectAgentCreate,
  onSelectLocalUpload,
  onSelectManualCreate,
}: CreateSkillDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!menuRef.current?.contains(target) && !target.closest('[data-skill-create-trigger]')) {
        closeRef.current();
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', keyboard);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const actions = [
    { label: '通过Agent创建', action: onSelectAgentCreate },
    { label: '上传本地Skill', action: onSelectLocalUpload },
    { label: '手动创建Skill', action: onSelectManualCreate },
  ];

  return (
    <div
      ref={menuRef}
      aria-label="创建技能方式"
      className="absolute right-0 top-full z-50 mt-2.5 w-44 rounded-[22px] border border-slate-200/80 bg-white/95 p-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#22242A]/95 dark:shadow-[0_18px_44px_rgba(0,0,0,0.55)]"
    >
      {actions.map(({ label, action }) => (
        <button
          type="button"
          key={label}
          onClick={() => {
            onClose();
            action();
          }}
          className="flex w-full cursor-pointer items-center rounded-xl px-4 py-2.5 text-left text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100/90 hover:text-slate-950 focus:outline-none focus-visible:bg-slate-100/90 dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white dark:focus-visible:bg-white/[0.08]"
        >
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
