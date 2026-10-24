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
    <div className={`group relative min-w-0 aspect-[3/4] overflow-hidden rounded-xl bg-slate-100 transition-all dark:bg-white/10 ${
      selected ? 'ring-1 ring-indigo-500/80 shadow-2xs' : 'opacity-40 grayscale hover:opacity-70'
    }`}>
      <button
        type="button"
        onClick={() => onToggle(itemId, imageIndex)}
        disabled={disabled}
        aria-pressed={selected}
        title={selected ? `第 ${imageIndex + 1} 镜（点击排除）` : `第 ${imageIndex + 1} 镜（已排除，点击恢复）`}
        className="h-full w-full cursor-pointer disabled:cursor-default"
      >
        {!failed && (
          <img
            src={`${attempt === 0 ? proxy : original}${retry ? `${(attempt === 0 ? proxy : original).includes('?') ? '&' : '?'}retry=${retry}` : ''}`}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setAttempt(current => current === 0 && proxy !== original ? 1 : 2)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-slate-950/65 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-xs">
          #{imageIndex + 1}
        </span>
        <span className={`pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shadow-xs ${
          selected ? 'bg-indigo-600 text-white' : 'bg-slate-900/70 text-white'
        }`}>
          {selected ? <Check className="h-3 w-3" /> : '—'}
        </span>
      </button>
      {failed && (
        <button
          type="button"
          onClick={() => { setAttempt(0); setRetry(current => current + 1); }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-100/95 p-2 text-[11px] font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:bg-[#18191c]/95"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>重试加载</span>
        </button>
      )}
    </div>
  );
});
