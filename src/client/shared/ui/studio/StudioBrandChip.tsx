import type { ReactNode } from 'react';
import { ToolSuiteMark } from '@client/shared/icons';

interface Props {
  title: string;
  icon: ReactNode;
  onBack: () => void;
  inline?: boolean;
}

export function StudioBrandChip({ title, icon, onBack, inline = false }: Props) {
  const button = (
    <button
      type="button"
      onClick={onBack}
      className="pointer-events-auto group flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 text-sm font-black tracking-tight text-slate-900 shadow-sm backdrop-blur transition-colors hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-[#1B1B1E]/90 dark:text-white dark:hover:border-white/20 dark:hover:bg-[#26262B]"
      title={`${title} · 点击返回首页`}
    >
      <ToolSuiteMark>{icon}</ToolSuiteMark>
      <span className="hidden truncate leading-none sm:inline">{title}</span>
    </button>
  );
  if (inline) return button;
  return (
    <header className="pointer-events-none absolute left-0 top-0 z-30 flex w-full items-center px-4 pt-3 sm:px-6">
      {button}
    </header>
  );
}
