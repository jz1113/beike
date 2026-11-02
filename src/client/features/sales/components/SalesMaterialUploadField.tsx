import { useEffect, useId, useRef, useState } from 'react';
import { Music2, Plus, RefreshCw, X } from 'lucide-react';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import '../salesMaterialUpload.css';

interface Props {
  file: File | null;
  onChange: (file: File | null) => void;
  accept: string;
  required?: boolean;
  disabled?: boolean;
  label: string;
  hint: string;
  kind: 'image' | 'video' | 'audio';
}

export function SalesMaterialUploadField({ file, onChange, accept, required = false, disabled = false, label, hint, kind }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const previewUrl = preview?.file === file ? preview?.url : undefined;

  return <div className={`sales-material-file ${file ? 'has-file' : ''}`}>
    <input
      ref={input}
      type="file"
      accept={accept}
      disabled={disabled}
      aria-label={label}
      hidden
      onChange={(event) => {
        const selected = event.target.files?.[0];
        event.target.value = '';
        if (selected) onChange(selected);
      }}
    />
    {file ? <>
      <div className={`sales-material-file-preview is-${kind}`}>
        {previewUrl && kind === 'image' && <img src={previewUrl} alt={file.name} />}
        {previewUrl && kind === 'video' && <video key={previewUrl} src={previewUrl} controls playsInline preload="metadata" aria-label={`${label}预览`} />}
        {kind === 'audio' && <><Music2 size={28} aria-hidden /><span>{label}</span>{previewUrl && <audio key={previewUrl} src={previewUrl} controls preload="metadata" aria-label={`${label}试听`} />}</>}
      </div>
      <div className="sales-material-file-selected">
        <div className="sales-material-file-name"><strong title={file.name}>{file.name}</strong><small>已选择 · {required ? '必填' : '选填'}</small></div>
        <div className="sales-material-file-actions">
          <button type="button" disabled={disabled} className={salesGhostButtonClass} aria-label={`更换${label}`} onClick={() => input.current?.click()}><RefreshCw size={14} aria-hidden />更换文件</button>
          <button type="button" disabled={disabled} className={salesGhostButtonClass} aria-label={`移除${label}`} onClick={() => onChange(null)}><X size={14} aria-hidden /></button>
        </div>
      </div>
    </> : <button type="button" disabled={disabled} className={`sales-material-file-empty ${salesFocusClass}`} aria-label={label} aria-describedby={hintId} onClick={() => input.current?.click()}>
      <Plus size={24} aria-hidden />
      <strong>{label}</strong>
      <small id={hintId}>{hint}</small>
      <span className="sales-material-file-required">{required ? '必填' : '选填'}</span>
    </button>}
  </div>;
}
