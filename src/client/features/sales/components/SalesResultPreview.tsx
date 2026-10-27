import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Film, Loader2 } from 'lucide-react';
import { salesFocusClass } from './salesChrome';

export function SalesResultPreview({ resultUrl, aspectRatio, duration, isRendering, status, onStop, children }: {
  resultUrl: string | null;
  aspectRatio: string;
  duration: number;
  isRendering: boolean;
  status: string;
  onStop: () => void;
  children?: ReactNode;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    if (!isRendering) return;
    const start = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isRendering]);
  const ratio = ({ '16:9': 16 / 9, '3:4': 3 / 4, '1:1': 1 } as Record<string, number>)[aspectRatio] || 9 / 16;
  return <section aria-label="成片预览" className="sales-result-stage min-h-0 min-w-0" style={{ '--sales-preview-ratio': ratio } as CSSProperties}>
    <div className="sales-result-preview-group">
      <div className={`sales-result-preview-frame ${isRendering ? 'is-rendering' : ''}`}>
        {resultUrl && !isRendering ? <video src={resultUrl} controls playsInline preload="metadata" aria-label="完整视频" className="h-full w-full bg-black object-contain" /> : <div className="relative flex h-full flex-col items-center justify-center gap-5 px-5 text-center">
          {isRendering ? <Loader2 className="h-9 w-9 animate-spin text-amber-300" aria-hidden /> : <Film className="h-9 w-9 text-slate-500" aria-hidden />}
          <div className="space-y-3"><p role="status" aria-live="polite" className="text-base font-semibold text-slate-100">{isRendering ? '正在生成视频…' : status}</p>
            {isRendering && <span className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs tabular-nums text-slate-300">已等待 {elapsed} 秒</span>}
          </div>
          {isRendering && <button type="button" onClick={onStop} className={`sales-result-stop absolute bottom-[18%] min-h-10 rounded-full border border-white/20 bg-white/[0.06] px-4 text-xs text-slate-200 transition hover:bg-white/10 ${salesFocusClass}`}>停止继续提交</button>}
        </div>}
      </div>
      <p className="sales-result-stage-note text-center text-[11px] leading-5 text-slate-500 dark:text-slate-400">{isRendering ? '整段视频通常需要数分钟，可离开页面；已提交的任务仍可能生成并计费。' : resultUrl ? `${aspectRatio} · ${duration} 秒` : '已有回执可继续查询；未确认的任务请先核对渠道记录。'}</p>
    </div>
    {children && <div className="sales-result-legacy w-full space-y-3">{children}</div>}
  </section>;
}
