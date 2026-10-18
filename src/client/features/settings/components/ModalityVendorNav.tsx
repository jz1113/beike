import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { ModalityVendorOption } from '../model/modalityModelTypes';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  vendors: ModalityVendorOption[];
  selectedVendor: string | null;
  onSelectVendor: (vendorId: string) => void;
}

export function ModalityVendorNav({
  vendors,
  selectedVendor,
  onSelectVendor,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, vendors]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !selectedVendor) return;
    const chip = root.querySelector<HTMLButtonElement>(`[data-vendor-id="${selectedVendor}"]`);
    chip?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [selectedVendor, vendors]);

  const scroll = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      scrollRef.current.scrollLeft += e.deltaY;
      updateScrollState();
    }
  };

  const arrowClass = (enabled: boolean) =>
    `w-7 h-7 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
      enabled
        ? 'bg-white dark:bg-[#202328] border-slate-200 dark:border-white/10 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white shadow-xs'
        : 'bg-slate-50 dark:bg-white/[0.03] border-slate-100 dark:border-white/5 text-slate-300 dark:text-slate-600 cursor-default'
    }`;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => scroll(-220)}
        disabled={!canScrollLeft}
        className={arrowClass(canScrollLeft)}
        title="向左切换厂商"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 scroll-smooth py-1 -my-1"
      >
        {vendors.map((vendor) => {
          const isSelected = selectedVendor === vendor.id;
          return (
            <button
              key={vendor.id}
              type="button"
              data-vendor-id={vendor.id}
              onClick={() => onSelectVendor(vendor.id)}
              className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs shrink-0 transition-all border active:scale-[0.98] ${
                isSelected
                  ? 'bg-white dark:bg-[#202328] text-slate-900 dark:text-white border-slate-200/90 dark:border-white/15 shadow-xs font-semibold'
                  : 'bg-slate-100/80 hover:bg-slate-200/80 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border-transparent font-medium'
              }`}
            >
              <ModelIcon modelId={vendor.logoKey} className="h-3.5 w-3.5 shrink-0 object-contain" />
              <span>{vendor.name}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => scroll(220)}
        disabled={!canScrollRight}
        className={arrowClass(canScrollRight)}
        title="向右切换厂商"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
