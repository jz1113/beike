import { ImagePlus, X } from 'lucide-react';
import type { FashionRefs } from '@shared/domain/video-sales';
import { salesDividerClass, salesGroupClass, salesNoteClass, salesSectionTitleClass } from './salesSurface';

type FashionRefKey = 'personUrl' | 'faceUrl' | 'sceneUrl';

interface Props {
  refs: FashionRefs;
  disabled: boolean;
  onUpload: (slot: FashionRefKey, file: File) => void;
  onClear: (slot: FashionRefKey) => void;
}

const SLOTS: Array<{ key: FashionRefKey; label: string; hint: string }> = [
  { key: 'personUrl', label: '出镜人物', hint: '必填' },
  { key: 'faceUrl', label: '人脸特写', hint: '可选' },
  { key: 'sceneUrl', label: '场景', hint: '可选' },
];

export function SalesFashionRefs({ refs, disabled, onUpload, onClear }: Props) {
  return (
    <section className={`${salesGroupClass} ${salesDividerClass}`}>
      <h2 className={salesSectionTitleClass}>服饰参考</h2>
      <p className={salesNoteClass}>人物、人脸和场景不进入商品图。衣服仍使用上面的商品图。</p>
      <div className="grid grid-cols-3 gap-2">
        {SLOTS.map((slot) => {
          const url = refs[slot.key];
          return (
            <div key={slot.key} className="space-y-1">
              {url ? (
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-black/[0.04] ring-1 ring-black/[0.06] dark:bg-white/[0.06] dark:ring-white/[0.08]">
                  <img src={url} alt={slot.label} className="h-full w-full object-cover" />
                  <button type="button" disabled={disabled} onClick={() => onClear(slot.key)} aria-label={`移除${slot.label}`} className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white disabled:opacity-40">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className={`flex aspect-[3/4] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-black/[0.02] text-center dark:border-white/10 dark:bg-white/[0.04] ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.07]'}`}>
                  <ImagePlus className="h-4 w-4 text-slate-400 dark:text-[#8E8E93]" />
                  <span className="mt-1 text-[11px] font-medium text-slate-700 dark:text-[#EDEDED]">{slot.label}</span>
                  <input type="file" accept="image/*" className="sr-only" disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(slot.key, file); event.target.value = ''; }} />
                </label>
              )}
              <p className="text-center text-[10px] text-slate-500 dark:text-[#8E8E93]">{slot.hint}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
