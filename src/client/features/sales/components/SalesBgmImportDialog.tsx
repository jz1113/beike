import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Music2, Upload, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { StudioAudioPlayer } from '@client/shared/ui/studio/StudioAudioPlayer';
import type { SalesBgmCandidate } from '@shared/domain/sales';
import { fetchSalesBuiltinBgms, importSalesBgm } from '../api/salesBgm';
import { uploadSalesCustomAsset } from '../api/salesProduction';
import { addBgmUploadFiles, formatBgmDuration, runBgmImportBatch, type BgmImportItem } from '../model/salesBgmImport';
import { salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';
import '../salesAssetDialog.css';
import '../salesBgmImport.css';

interface Props { onClose: () => void; onImported: (count: number) => void }

const STATUS = { queued: '待导入', uploading: '上传中…', saving: '保存中…', done: '已入库', error: '导入失败' } as const;

export function SalesBgmImportDialog({ onClose, onImported }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [tab, setTab] = useState<'upload' | 'builtin'>('upload');
  const [uploads, setUploads] = useState<BgmImportItem[]>([]);
  const [builtinItems, setBuiltinItems] = useState<BgmImportItem[]>([]);
  const [builtins, setBuiltins] = useState<SalesBgmCandidate[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [duration, setDuration] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [fileErrors, setFileErrors] = useState<string[]>([]);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => abortRef.current?.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    void fetchSalesBuiltinBgms(controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setBuiltins(items);
      setBuiltinItems((previous) => items.map((item) => previous.find((old) => old.key === item.id)
        || { key: item.id, title: item.title, builtinId: item.id, status: 'queued', durationSec: item.durationSec }));
    }).catch((error) => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : '读取内置配乐失败');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  const queue = tab === 'upload' ? uploads : builtinItems.filter((item) => selected.has(item.key));
  const remaining = queue.filter((item) => item.status !== 'done').length;
  const completed = uploads.filter((item) => item.status === 'done').length + builtinItems.filter((item) => item.status === 'done').length;
  const failures = queue.filter((item) => item.status === 'error').length;
  const setItems = tab === 'upload' ? setUploads : setBuiltinItems;

  const addFiles = (files: File[]) => {
    if (pending) return;
    const result = addBgmUploadFiles(uploads, files);
    setUploads(result.items); setFileErrors(result.errors);
  };
  const submit = async () => {
    if (pending || !remaining || abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    try {
      const saved = await runBgmImportBatch(queue, duration ? Number(duration) : undefined, controller.signal, {
        upload: (file, signal) => uploadSalesCustomAsset(file, 'assets', signal), save: importSalesBgm,
      }, (key, patch) => setItems((previous) => previous.map((item) => item.key === key ? { ...item, ...patch } : item)));
      if (!controller.signal.aborted && saved) onImported(saved);
    } finally {
      abortRef.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };

  return <dialog ref={dialogRef} className="sales-material-dialog sales-asset-dialog sales-bgm-import" aria-labelledby="sales-bgm-import-title"
    onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <header className="sales-asset-header"><h2 id="sales-bgm-import-title">导入背景音乐</h2>
        <button type="button" disabled={pending} onClick={onClose} aria-label="关闭背景音乐导入" className={salesGhostButtonClass}><X size={18} /></button>
      </header>
      <div className="sales-asset-content">
        <div className="sales-segment-group" role="group" aria-label="背景音乐来源">
          <button type="button" disabled={pending} aria-pressed={tab === 'upload'} onClick={() => setTab('upload')} className={`sales-segment-item ${salesFocusClass}`}>批量上传</button>
          <button type="button" disabled={pending} aria-pressed={tab === 'builtin'} onClick={() => setTab('builtin')} className={`sales-segment-item ${salesFocusClass}`}>内置短配乐</button>
        </div>
        <label className="sales-bgm-duration-choice">保存长度
          <select aria-label="背景音乐保存长度" value={duration} disabled={pending} onChange={(event) => setDuration(event.target.value)} className={salesInputClass}>
            <option value="">保留原长度</option><option value="10">前 10 秒</option><option value="15">前 15 秒</option><option value="30">前 30 秒</option>
          </select><small>短于所选长度时保留完整音频。更改长度后，待导入和失败项按新长度保存。</small>
        </label>
        {tab === 'upload' ? <>
          <input ref={inputRef} type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus" className="hidden" disabled={pending}
            onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
          <button type="button" disabled={pending || uploads.length >= 30} className={`sales-bgm-dropzone ${salesFocusClass}`}
            onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)); }}>
            <Upload size={24} aria-hidden /><strong>{uploads.length ? '继续添加音频' : '选择或拖入一批音乐'}</strong>
            <span>每批最多 30 首 · 每首不超过 32 MB</span><small>MP3、WAV、M4A、AAC、OGG、FLAC、OPUS</small>
          </button>
          {fileErrors.length > 0 && <ul role="alert" className="sales-material-error">{fileErrors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
          <div className="sales-bgm-import-list">{uploads.map((item) => <div className="sales-bgm-import-item" key={item.key}>
            <Music2 size={18} aria-hidden /><div className="sales-bgm-import-copy"><strong>{item.file?.name}</strong>
              <span role="status">{STATUS[item.status]}{item.status === 'done' ? ` · ${formatBgmDuration(item.durationSec)}` : ''}</span>
              {item.error && <small role="alert" className="sales-material-error">{item.error}</small>}
            </div>{item.status === 'done' ? <Check size={16} aria-label="已入库" /> : <button type="button" disabled={pending} aria-label={`移除 ${item.file?.name}`} onClick={() => setUploads((previous) => previous.filter((row) => row.key !== item.key))} className={salesGhostButtonClass}><X size={14} /></button>}
          </div>)}</div>
        </> : <>
          <p className="sales-card-hint">5 段 12 秒内置循环配乐，勾选后即可保存到你的资产库。</p>
          {loading && <p role="status" className="sales-material-notice"><Loader2 size={14} className="animate-spin" />正在读取短配乐…</p>}
          {loadError && <p role="alert" className="sales-material-error">{loadError}<button type="button" onClick={() => setRevision((value) => value + 1)} className={salesGhostButtonClass}>重试</button></p>}
          <div className="sales-bgm-import-list">{builtinItems.map((item) => {
            const track = builtins.find((candidate) => candidate.id === item.key);
            return <div className="sales-bgm-import-item is-builtin" key={item.key}>
              <label><input type="checkbox" checked={selected.has(item.key)} disabled={pending || item.status === 'done'} aria-label={`导入 ${item.title}`}
                onChange={(event) => setSelected((previous) => { const next = new Set(previous); if (event.target.checked) next.add(item.key); else next.delete(item.key); return next; })} />
                <span><strong>{item.title}</strong><small>{formatBgmDuration(track?.durationSec)} · {track?.license}</small></span></label>
              {track && <StudioAudioPlayer src={proxyMediaUrl(track.audioUrl)} label={`${item.title}试听`} compact className="min-w-[180px]" />}
              {item.status !== 'queued' && <span role="status">{STATUS[item.status]}{item.status === 'done' ? ` · ${formatBgmDuration(item.durationSec)}` : ''}</span>}
              {item.error && <small role="alert" className="sales-material-error">{item.error}</small>}
            </div>;
          })}</div>
        </>}
      </div>
      <footer className="sales-asset-footer"><span role="status" className="sales-card-hint">{completed ? `已入库 ${completed} 首` : `待导入 ${remaining} 首`}{failures ? ` · ${failures} 首失败，可重试` : ''}</span>
        <div><button type="button" disabled={pending} onClick={onClose} className={salesGhostButtonClass}>{completed ? '完成' : '取消'}</button>
          <button type="submit" disabled={pending || !remaining} className={`sales-collect-primary ${salesFocusClass}`}>{pending && <Loader2 size={14} className="animate-spin" />}{pending ? '正在导入…' : failures === remaining && failures ? `重试 ${failures} 首` : `导入 ${remaining} 首`}</button></div>
      </footer>
    </form>
  </dialog>;
}
