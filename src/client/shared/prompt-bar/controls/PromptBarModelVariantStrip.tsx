import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { VariantItem } from '@shared/domain/models/modelGrouping';

export function looksBroken(label: string) {
  return /\d{6,}/.test(label) || /\d\s+0\s+\d/.test(label);
}

/** Horizontal variant chips with arrows only while that side can still scroll. */
export function PromptBarModelVariantStrip({
  variants,
  names,
  selected,
  matchesSelection,
  onSelect,
}: {
  variants: VariantItem[];
  names: Map<string, string>;
  selected: boolean;
  matchesSelection: (modelId: string) => boolean;
  onSelect: (modelId: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const fade = selected ? 'from-slate-100 dark:from-[#2c2d31]' : 'from-slate-50 dark:from-[#292a2e]';

  const measure = () => {
    const node = scrollerRef.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    setEdges({ left: node.scrollLeft > 1, right: max - node.scrollLeft > 1 });
  };

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const picked = node.querySelector<HTMLElement>('[data-picked="true"]');
    if (picked) {
      node.scrollLeft = 0;
      const nodeBox = node.getBoundingClientRect();
      const chipBox = picked.getBoundingClientRect();
      node.scrollLeft = Math.max(0, chipBox.left - nodeBox.left - (node.clientWidth - chipBox.width) / 2);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [variants]);

  const scrollByDirection = (direction: -1 | 1) => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.7, behavior: 'smooth' });
  };

  return (
    <div className="relative w-0 min-w-full">
      {edges.left && (
        <button
          type="button"
          aria-label="向左查看更多变体"
          onClick={() => scrollByDirection(-1)}
          className={`absolute inset-y-1 left-0 z-10 flex w-7 cursor-pointer items-center justify-start bg-gradient-to-r ${fade} to-transparent pl-0.5 text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        ref={scrollerRef}
        onScroll={measure}
        className="flex w-full flex-nowrap items-center gap-1 overflow-x-auto px-2.5 pb-2.5 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {variants.map((variant) => (
          <VariantButton key={variant.variantKey} variant={variant} names={names} matchesSelection={matchesSelection} onSelect={onSelect} />
        ))}
      </div>
      {edges.right && (
        <button
          type="button"
          aria-label="向右查看更多变体"
          onClick={() => scrollByDirection(1)}
          className={`absolute inset-y-1 right-0 z-10 flex w-7 cursor-pointer items-center justify-end bg-gradient-to-l ${fade} to-transparent pr-0.5 text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white`}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function VariantButton({
  variant,
  names,
  matchesSelection,
  onSelect,
}: {
  variant: VariantItem;
  names: Map<string, string>;
  matchesSelection: (modelId: string) => boolean;
  onSelect: (modelId: string) => void;
}) {
  const picked = variant.allModelIds.some((id) => matchesSelection(id));
  const synced = names.get(variant.primaryModelId);
  const label = synced && looksBroken(variant.displayName) ? synced : variant.displayName;
  return (
    <button
      type="button"
      data-picked={picked ? 'true' : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(variant.primaryModelId);
      }}
      className={`flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-lg border px-2.5 py-1 text-[13px] font-medium ${
        picked
          ? 'border-slate-300 bg-white font-semibold text-slate-950 dark:border-white/25 dark:bg-white/20 dark:text-white'
          : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
      }`}
      title={synced || variant.primaryModelId}
    >
      <span>{label}</span>
    </button>
  );
}
