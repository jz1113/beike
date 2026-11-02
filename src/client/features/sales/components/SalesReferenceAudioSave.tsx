import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Music2, Save } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { SalesBgmCandidate } from '@shared/domain/sales';
import { importSalesBgm } from '../api/salesBgm';
import { useSalesMaterialCatalog } from '../hooks/useSalesMaterialCatalog';
import { salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';
import '../salesReferenceAudio.css';

interface Props {
  videoUrl: string;
  title: string;
  durationSec?: number;
  disabled?: boolean;
}

/** Mount with the source URL as its key so edits and completion belong to one video. */
export function SalesReferenceAudioSave({ videoUrl, title, durationSec, disabled = false }: Props) {
  const panelId = useId();
  const request = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const { refresh } = useSalesMaterialCatalog();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${title.replace(/\.[a-z0-9]{2,5}$/i, '')} · 原音轨`.slice(0, 120));
  const [length, setLength] = useState('all');
  const [start, setStart] = useState('0');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<SalesBgmCandidate | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  const clipStart = length === 'all' ? 0 : Number(start);
  const knownDuration = typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0 ? durationSec : null;
  const maxStart = knownDuration === null ? 600 : Math.max(0, Math.min(600, knownDuration - 1));
  const validNumber = Number.isFinite(clipStart) && clipStart >= 0 && clipStart <= 600
    && (length === 'all' || start.trim() !== '');
  const enoughAudio = knownDuration === null || knownDuration - clipStart >= 1;
  const validStart = validNumber && enoughAudio;
  const startError = !validNumber ? '开始位置须为 0–600 之间的秒数。'
    : knownDuration !== null && knownDuration < 1 ? '视频不足 1 秒，无法保存音轨。' : '开始位置后至少需要保留 1 秒音轨，请调早开始位置。';
  const working = pending || disabled;
  const edited = () => { setSaved(null); setError(''); audio.current?.pause(); };
  const save = async () => {
    if (request.current || working || !name.trim() || !validStart || saved) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setError('');
    try {
      const bgm = await importSalesBgm({ videoUrl, title: name.trim(),
        ...(length === 'all' ? {} : { startSec: clipStart, durationSec: Number(length) }),
      }, controller.signal);
      if (controller.signal.aborted) return;
      audio.current?.pause();
      setSaved(bgm); refresh();
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '保存参考音频失败，请重试');
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  return <section className="sales-reference-audio" aria-label="保存参考视频音轨">
    <button type="button" disabled={working} aria-expanded={open} aria-controls={panelId}
      onClick={() => { audio.current?.pause(); setOpen(!open); }} className={salesGhostButtonClass}>
      <Music2 size={13} aria-hidden />保存参考音频<ChevronDown size={12} aria-hidden />
    </button>
    {open && <div id={panelId} className="sales-reference-audio-panel">
      <p className="sales-card-hint">保存到「声音资产 → 背景音乐」，可跨商品复用。保留的是原音轨，视频里的人声和环境声也会一起保存。</p>
      <audio ref={audio} controls preload="metadata" aria-label={saved ? '已保存参考音频试听' : '参考视频音轨试听'}
        src={proxyMediaUrl(saved?.audioUrl || videoUrl, { asVideo: !saved })}
        onPlay={(event) => {
          if (!saved && validStart && (event.currentTarget.currentTime < clipStart
            || (length !== 'all' && event.currentTarget.currentTime >= clipStart + Number(length)))) {
            event.currentTarget.currentTime = clipStart;
          }
        }}
        onTimeUpdate={(event) => {
          if (!saved && length !== 'all' && validStart && event.currentTarget.currentTime >= clipStart + Number(length)) event.currentTarget.pause();
        }} />
      <div className="sales-reference-audio-fields">
        <label>音频名称<input value={name} maxLength={120} disabled={working} onChange={(event) => { edited(); setName(event.target.value); }} className={salesInputClass} /></label>
        <label>保留时长<select value={length} disabled={working} onChange={(event) => { edited(); setLength(event.target.value); }} className={salesInputClass}>
          <option value="all">完整音轨</option><option value="10">10 秒</option><option value="15">15 秒</option><option value="30">30 秒</option>
        </select></label>
        {length !== 'all' && <label>开始位置（秒）<input type="number" min="0" max={maxStart} step="0.1" value={start} disabled={working}
          onChange={(event) => { edited(); setStart(event.target.value); }} className={salesInputClass} /></label>}
      </div>
      {length !== 'all' && <p className="sales-card-hint">试听从所选位置开始；不足所选时长时保留到音轨末尾。</p>}
      {!validStart && <p role="alert" className="sales-material-error">{startError}</p>}
      {error && <p role="alert" className="sales-material-error">{error}</p>}
      {saved ? <p role="status" className="sales-material-notice"><Check size={13} aria-hidden />已保存到背景音乐 · {Number(saved.durationSec.toFixed(1))} 秒</p>
        : <button type="button" disabled={working || !name.trim() || !validStart} onClick={() => { void save(); }} className={`sales-collect-primary ${salesFocusClass}`}>
          {pending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Save size={13} aria-hidden />}{pending ? '正在保存音轨…' : error ? '重试保存音轨' : '保存到背景音乐'}
        </button>}
    </div>}
  </section>;
}
