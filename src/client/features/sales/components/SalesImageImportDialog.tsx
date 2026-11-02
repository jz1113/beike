import { useEffect, useRef, useState } from 'react';
import { Check, Image, Loader2, Trash2, Upload, X } from 'lucide-react';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { importSalesImageAsset } from '../api/salesImageImport';
import { uploadSalesViewImage } from '../api/salesAssetViews';
import { fetchSalesStudioAssets } from '../api/salesProduction';
import { addSalesImageImportFiles, MAX_IMAGE_IMPORT_FILES, runSalesImageImportBatch, type SalesImageImportCategory, type SalesImageImportItem, type SalesImageImportKind } from '../model/salesImageImport';
import { PERSONA_GROUP_LABELS, SCENE_SPACE_LABELS } from '../model/salesMaterialCatalog';
import { supportsSalesAssetReferences } from '../model/salesAssetModels';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import '../salesAssetDialog.css';
import '../salesBgmImport.css';

interface Props extends SalesImageImportCategory {
  kind: SalesImageImportKind;
  existingNames: string[];
  onClose: () => void;
  onImported: (count: number) => void;
}
const STATUS = { queued: '待导入', uploading: '上传中…', saving: '保存中…', done: '已入库', error: '导入失败' } as const;

export function SalesImageImportDialog({ kind, existingNames, personaGroup, sceneSpace, onClose, onImported }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [items, setItems] = useState<SalesImageImportItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [background, setBackground] = useState(false);
  const [configured] = useState(loadSystemConfiguredModels);
  const models = configured.availableImageModels.filter(({ id }) => supportsSalesAssetReferences(id));
  const [model, setModel] = useState(() => models.some(({ id }) => id === configured.selectedImageGenModel) ? configured.selectedImageGenModel : models[0]?.id || '');
  const subject = kind === 'persona' ? '人物' : '场景';
  const category = kind === 'persona' ? PERSONA_GROUP_LABELS[personaGroup] : SCENE_SPACE_LABELS[sceneSpace];
  const done = items.filter((item) => item.status === 'done').length;
  const remaining = items.length - done;
  useEffect(() => {
    if (operation.current?.signal.aborted) {
      operation.current = null; setPending(false);
      setItems((previous) => previous.map((item) => item.status === 'uploading' || item.status === 'saving' ? { ...item, status: 'error', error: '导入已中断，可重试未完成项' } : item));
    }
    dialog.current?.showModal();
    return () => operation.current?.abort();
  }, []);
  const addFiles = (files: File[]) => {
    if (pending || operation.current) return;
    const result = addSalesImageImportFiles(kind, items, files, existingNames);
    setItems(result.items); setErrors(result.errors);
  };
  const submit = async () => {
    if (pending || operation.current || !remaining || (background && !models.some(({ id }) => id === model))) return;
    const controller = new AbortController(); operation.current = controller;
    setPending(true); setError('');
    try {
      const count = await runSalesImageImportBatch(kind, items, { personaGroup, sceneSpace }, controller.signal, {
        catalog: async (signal) => {
          const catalog = await fetchSalesStudioAssets(signal);
          return kind === 'persona' ? catalog.personas : catalog.scenes.map((scene) => ({ ...scene, name: scene.title }));
        },
        upload: (file, signal) => uploadSalesViewImage(file, file.name, signal),
        save: (assetKind, data, signal) => importSalesImageAsset(assetKind, data, background ? { model } : undefined, signal),
      }, (key, patch) => setItems((previous) => previous.map((item) => item.key === key ? { ...item, ...patch } : item)));
      if (!controller.signal.aborted && count) onImported(count);
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '读取资产库失败，请重试'); }
    finally { if (operation.current === controller) { operation.current = null; if (!controller.signal.aborted) setPending(false); } }
  };
  return <dialog ref={dialog} className="sales-material-dialog sales-asset-dialog sales-bgm-import" aria-labelledby="sales-image-import-title"
    onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <header className="sales-asset-header"><h2 id="sales-image-import-title">批量导入{subject}</h2>
        <button type="button" disabled={pending} aria-label={`关闭${subject}批量导入`} onClick={onClose} className={salesGhostButtonClass}><X size={18} /></button>
      </header>
      <div className="sales-asset-content">
        <p className="sales-material-notice">每张图片创建一个{subject}资产，归入「{category}」。名称按库中「{subject}1、{subject}2…」的已有编号顺延，导入后可编辑。</p>
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--sales-line)] p-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={background} disabled={pending} onChange={(event) => setBackground(event.target.checked)} />导入后后台补全九宫格</label>
          {background && <><ConfiguredModelPicker ariaLabel="批量九宫格生图模型" options={models} value={model} onChange={setModel} disabled={pending} modalityKind="image" variant="agent" emptyLabel="请先配置支持参考图的生图模型" />
            <small className="text-[var(--sales-muted)]">使用所选模型为每个资产生成一张九宫格，裁切后自动保存。提交完成后可关闭窗口，在资产库查看后台进度。</small></>}
        </div>
        <input ref={input} className="hidden" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,image/gif,.jpg,.jpeg,.png,.webp,.avif,.gif" disabled={pending}
          aria-label={`选择一批${subject}图片`} onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
        <button type="button" disabled={pending || items.length >= MAX_IMAGE_IMPORT_FILES} className={`sales-bgm-dropzone ${salesFocusClass}`} onClick={() => input.current?.click()}
          onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)); }}>
          <Upload size={24} aria-hidden /><strong>{items.length ? '继续添加图片' : '选择或拖入一批图片'}</strong><span>每批最多 50 张 · 每张不超过 20 MB</span>
        </button>
        {errors.map((message) => <p key={message} role="alert" className="sales-material-error">{message}</p>)}
        <div className="sales-bgm-import-list" aria-label={`${subject}批量导入队列`}>
          {items.map((item) => <div key={item.key} className="sales-bgm-import-item">
            {item.status === 'done' ? <Check size={18} aria-hidden /> : item.status === 'uploading' || item.status === 'saving' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Image size={18} aria-hidden />}
            <div className="sales-bgm-import-copy"><strong>{item.name}</strong><span>{item.file.name}</span>{item.error && <p role="alert" className="sales-material-error">{item.error}</p>}</div>
            <span role="status">{STATUS[item.status]}</span>
            {item.status !== 'done' && <button type="button" disabled={pending} aria-label={`移除待导入${item.name}`} className={salesGhostButtonClass} onClick={() => setItems((previous) => previous.filter((entry) => entry.key !== item.key))}><Trash2 size={14} /></button>}
          </div>)}
        </div>
        {error && <p role="alert" className="sales-material-error">{error}</p>}
      </div>
      <footer className="sales-asset-footer"><span role="status">已入库 {done} / {items.length} · 待处理 {remaining}</span><div>
        <button type="button" disabled={pending} className={salesGhostButtonClass} onClick={onClose}>{done ? '完成' : '关闭'}</button>
        <button type="submit" disabled={pending || !remaining || (background && !models.some(({ id }) => id === model))} className={`sales-collect-primary ${salesFocusClass}`}>{pending && <Loader2 size={14} className="animate-spin" />}{pending ? '正在导入…' : items.some((item) => item.status === 'error') ? '重试未完成项' : background ? `导入并后台生成 ${remaining} 项` : `导入并保存 ${remaining} 项`}</button>
      </div></footer>
    </form>
  </dialog>;
}
