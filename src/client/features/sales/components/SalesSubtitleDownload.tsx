import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

export function SalesSubtitleDownload({ srt }: { srt: string }) {
  const active = useRef(false);
  const [error, setError] = useState('');
  const download = async () => {
    if (active.current) return;
    active.current = true;
    setError('');
    try {
      await saveToDownloadDir('ecommerce-subtitles.srt', new Blob(['\uFEFF', srt], { type: 'application/x-subrip;charset=utf-8' }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '字幕下载失败，请重试');
    } finally { active.current = false; }
  };
  return <>
    <button type="button" onClick={() => void download()} className={`${salesGhostButtonClass} ${salesFocusClass}`}>
      <Download size={13} aria-hidden />下载字幕 SRT
    </button>
    {error && <p role="alert">{error}</p>}
  </>;
}
