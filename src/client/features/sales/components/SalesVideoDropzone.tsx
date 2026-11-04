import { useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { salesFocusClass } from './salesChrome';
import '../salesVideoDropzone.css';

interface Props {
  title: string;
  hint: string;
  disabled: boolean;
  loading?: boolean;
  compact?: boolean;
  onChoose: () => void;
  onFiles: (files: File[]) => void;
}

export function SalesVideoDropzone({ title, hint, disabled, loading, compact, onChoose, onFiles }: Props) {
  const [dragging, setDragging] = useState(false);
  return <button type="button" disabled={disabled} onClick={onChoose}
    className={`sales-video-dropzone ${compact ? 'is-compact' : ''} ${dragging && !disabled ? 'is-over' : ''} ${salesFocusClass}`}
    onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => {
      event.preventDefault(); setDragging(false);
      if (!disabled && event.dataTransfer.files.length) onFiles(Array.from(event.dataTransfer.files));
    }}>
    <span className="sales-upload-cloud">{loading ? <Loader2 className="animate-spin" aria-hidden /> : <UploadCloud aria-hidden />}</span>
    <strong>{dragging && !disabled ? '松开以上传视频' : title}</strong>
    <span className="sales-upload-hint">{hint}</span>
  </button>;
}
