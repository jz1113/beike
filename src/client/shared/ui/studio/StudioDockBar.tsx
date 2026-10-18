import Dock, { type DockItemData } from '@client/shared/ui/Dock';

interface Props {
  items: DockItemData[];
  label: string;
}

const neutral = '!border-slate-200 !bg-white !text-slate-950 shadow-sm hover:!border-slate-300 hover:!bg-slate-50';

export function studioDockClass(active: boolean) {
  return active
    ? '!border-indigo-600 !bg-indigo-600 !text-white shadow-sm shadow-indigo-500/25 hover:!border-indigo-600 hover:!bg-indigo-600 hover:!text-white'
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
