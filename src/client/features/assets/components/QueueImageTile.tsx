import { memo, useEffect, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';

type Props = {
  url: string;
  itemId: string;
  imageIndex: number;
  selected: boolean;
  disabled: boolean;
  onToggle: (itemId: string, imageIndex: number) => void;
};

export const QueueImageTile = memo(function QueueImageTile({
  url, itemId, imageIndex, selected, disabled, onToggle,
}: Props) {
  const original = url.startsWith('//') ? `https:${url}` : url;
  const proxy = proxyMediaUrl(original, { thumb: true, width: 400 });
  const [attempt, setAttempt] = useState(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setAttempt(0); setRetry(0); }, [url]);
  const failed = attempt === 2;

  return (
    <div className={`group relative w-[124px] shrink-0 aspect-[3/4] overflow-hidden rounded-2xl bg-slate-100 sm:w-[132px] xl:w-[140px] dark:bg-white/10 ${
      selected ? 'ring-2 ring-indigo-500 ring-offset-2 shadow-md shadow-indigo-100/70' : 'opacity-40 grayscale hover:opacity-70'
    }`}>
      <button
        type="button"
        onClick={() => onToggle(itemId, imageIndex)}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={`图 ${imageIndex + 1}${selected ? '，已选' : '，未选'}`}
        title={selected ? '已选择，点击取消' : '未选择，点击加入'}
        className="h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
      >
        {failed ? (
          <span className="block px-3 text-xs text-slate-500 dark:text-slate-400">图片暂时无法加载</span>
        ) : (
          <img
            key={retry}
            src={attempt === 0 ? proxy : original}
            alt={`图 ${imageIndex + 1}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setAttempt(attempt === 0 && proxy !== original ? 1 : 2)}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        )}
        <span className="absolute bottom-2 left-2 rounded-lg bg-slate-950/65 px-2 py-1 text-[11px] font-semibold text-white">
          图 {imageIndex + 1}
        </span>
        {selected && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>}
      </button>
      {failed && <button
        type="button"
        onClick={() => { setAttempt(0); setRetry((value) => value + 1); }}
        className="absolute inset-x-2 top-[60%] flex items-center justify-center gap-1 rounded-lg bg-white px-2 py-2 text-xs font-semibold text-indigo-600 shadow-sm dark:bg-[#18191c]"
        aria-label={`重新加载图 ${imageIndex + 1}`}
      >
        <RefreshCw className="h-3 w-3" />重新加载
      </button>}
    </div>
  );
});
