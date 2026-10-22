import Dock, { type DockItemData } from '@client/shared/ui/Dock';

interface Props {
  items: DockItemData[];
  label: string;
}

const neutral =
  '!border-slate-200/80 !bg-white/90 !text-slate-900 shadow-sm backdrop-blur hover:!border-slate-300 hover:!bg-white dark:!border-white/10 dark:!bg-[#1B1B1E]/90 dark:!text-slate-200 dark:hover:!border-white/20 dark:hover:!bg-[#26262B] dark:hover:!text-white';

export function studioDockClass(active: boolean) {
  return active
    ? '!border-indigo-600 !bg-indigo-600 !text-white shadow-sm shadow-indigo-500/30 hover:!border-indigo-500 hover:!bg-indigo-500 hover:!text-white dark:!border-indigo-500 dark:!bg-indigo-600 dark:shadow-indigo-500/40'
    : neutral;
}

export function StudioDockBar({ items, label }: Props) {
  return (
    <aside aria-label={label} className="absolute right-3 top-2.5 z-40 flex items-center select-none lg:left-1/2 lg:right-auto lg:-translate-x-1/2">
      <Dock
        items={items}
        positioned={false}
        expandsOnHover={false}
        showLabels
        labelPlacement="bottom"
        panelHeight={56}
        dockHeight={56}
        baseItemSize={42}
        magnification={58}
        distance={140}
        className="!h-[56px] !items-center !gap-1.5 !border-transparent !bg-transparent !p-0 !shadow-none"
      />
    </aside>
  );
}
