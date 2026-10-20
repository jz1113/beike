/** 带货工作台的中性表面与小面积重点色，兼容浅色和深色。 */
export const salesFocusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#18191c]';
export const salesPanelClass = 'rounded-[20px] border border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#18191c]';
export const salesCardClass = 'rounded-2xl border border-slate-200/80 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.025]';
export const salesGroupClass = 'space-y-3.5';
export const salesSectionTitleClass = 'text-[13px] font-semibold text-slate-800 dark:text-slate-100';
export const salesLabelClass = 'block text-xs font-medium text-slate-600 dark:text-slate-300';
export const salesInputClass = 'mt-1.5 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500/70 focus:ring-2 focus:ring-amber-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-amber-300/50';
export const salesNoteClass = 'text-xs leading-6 text-slate-500 dark:text-slate-400';
export const salesDividerClass = 'border-t border-slate-100 pt-5 dark:border-white/[0.08]';
export const salesTabTrackClass = 'inline-flex rounded-xl bg-slate-100 p-1 dark:bg-black/20';
export const salesGhostButtonClass = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.025] dark:text-slate-200 dark:hover:bg-white/[0.07] ${salesFocusClass}`;

export function salesTabClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${salesFocusClass} ${active ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`;
}
