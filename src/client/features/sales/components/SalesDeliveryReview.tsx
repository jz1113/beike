import { useEffect, useRef, useState } from 'react';
import { Film, Loader2, X } from 'lucide-react';
import { reviewSalesVideo } from '../api/salesProduction';
import { salesGhostButtonClass, salesPrimaryButtonClass } from './salesChrome';

const pictureLabels = {
  visible: '画面可解码，检测到非黑画面',
  dark: '全片画面接近黑场，请检查视频',
  unreadable: '画面解码失败或未读到有效帧',
};
const audioLabels = {
  audible: '检测到音轨和有效声音',
  quiet: '存在音轨，但整段静音或接近静音',
  missing: '未检测到音轨',
  unreadable: '音轨无法解码或测量',
};

interface Props {
  videoUrl: string;
  final: boolean;
  canMix: boolean;
  onMix: () => void;
  onClose: () => void;
}

export function SalesDeliveryReview({ videoUrl, final, canMix, onMix, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof reviewSalesVideo>> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    reviewSalesVideo(videoUrl, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult(data);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '检测失败，请重试');
    });
    return () => controller.abort();
  }, [videoUrl, attempt]);

  return <dialog ref={dialog} className="sales-delivery-review" aria-label="音频视频核查"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><strong>音频视频核查</strong>
      <button type="button" aria-label="关闭核查" onClick={onClose} className={salesGhostButtonClass}><X size={15} aria-hidden /></button>
    </header>
    <p>检测对象 · {final ? '最终成片' : '原视频'}</p>
    {error ? <p role="alert" data-warning="true">{error}</p> : result ? <dl aria-live="polite">
      <dt>画面</dt><dd data-warning={result.picture !== 'visible'}>{pictureLabels[result.picture]}</dd>
      <dt>音轨</dt><dd data-warning={result.audio !== 'audible'}>{audioLabels[result.audio]}</dd>
      <dt>视频规格</dt><dd>{result.width} × {result.height} · {result.durationSec} 秒</dd>
    </dl> : <p role="status" className="mt-3 flex items-center gap-2"><Loader2 size={14} className="animate-spin" aria-hidden />正在解码画面并检测音轨…</p>}
    <footer>
      {error && <button type="button" className={salesGhostButtonClass} onClick={() => setAttempt((value) => value + 1)}>重新检测</button>}
      {canMix && <button type="button" className={salesPrimaryButtonClass} onClick={() => { onClose(); onMix(); }}>
        <Film size={14} aria-hidden />{final ? '重新合成成片' : '合成成片'}
      </button>}
    </footer>
  </dialog>;
}
