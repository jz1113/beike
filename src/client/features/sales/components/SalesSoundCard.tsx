import { useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { SalesMaterialCard } from '../model/salesMaterialCatalog';
import { formatBgmDuration } from '../model/salesBgmImport';
import { salesFocusClass } from './salesChrome';

export function SalesSoundCard({ card, onOpen }: { card: SalesMaterialCard; onOpen: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playAttempt = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  const togglePreview = () => {
    const audio = audioRef.current;
    if (!audio || !card.audio) return;
    const attempt = ++playAttempt.current;
    if (audio.paused) {
      setError(false);
      if (audio.error) audio.load();
      void audio.play().catch((reason: unknown) => {
        if (attempt !== playAttempt.current || (reason instanceof DOMException && reason.name === 'AbortError')) return;
        setPlaying(false); setError(true);
      });
    } else audio.pause();
  };

  return (
    <article className="sales-material-card is-sound">
      <div className="sales-material-cover is-sound">
        {card.audio && (
          <audio ref={audioRef} src={proxyMediaUrl(card.audio)} preload="none"
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            onError={() => { setPlaying(false); setError(true); }} />
        )}
        <span className="sales-material-badge">{card.badge}</span>
        <button type="button" onClick={togglePreview} disabled={!card.audio}
          aria-label={`${playing ? '暂停' : '播放'}${card.title}试听`}
          title={card.audio ? playing ? '暂停试听' : '试听' : '暂无试听音频'}
          className={`sales-sound-preview ${salesFocusClass}`}>
          {playing ? <Pause size={22} fill="currentColor" aria-hidden /> : <Play size={22} fill="currentColor" aria-hidden />}
        </button>
        {error && <span className="sales-sound-preview-error" role="status">试听失败，点击重试</span>}
      </div>
      <button type="button" aria-label={`查看${card.title}详情`} onClick={onOpen}
        className={`sales-material-body sales-sound-details ${salesFocusClass}`}>
        <span className="sales-material-card-heading">
          <span className="sales-sound-title" title={card.title}>{card.title}</span>
          {card.soundType === 'bgm' && <span className="sales-material-duration">{formatBgmDuration(card.durationSec)}</span>}
        </span>
      </button>
    </article>
  );
}
