import { PERSONA_AGES, PERSONA_CATEGORIES, PERSONA_GENDERS, personaCategory, personaGender, type PersonaAge, type PersonaCategory } from '../model/salesActionViews';
import { useEffect, useRef, useState } from 'react';
import { Check, Image, Loader2, Trash2, Upload, X } from 'lucide-react';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { fetchSalesStudioAssets, importSalesImageAsset } from '../api/salesMaterials';
import { uploadSalesViewImage } from '../api/salesAssetViews';
import { addSalesImageImportFiles, MAX_IMAGE_IMPORT_FILES, runSalesImageImportBatch, type SalesImageImportCategory, type SalesImageImportItem, type SalesImageImportKind } from '../model/salesImageImport';
import { SCENE_SPACE_LABELS, type SalesSceneSpace } from '../model/salesMaterialCatalog';
import { supportsSalesAssetReferences } from '../model/salesAssetDraft';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import '../salesAssetDialog.css';
import '../salesBgmImport.css';

interface Props extends SalesImageImportCategory {
  kind: SalesImageImportKind;
  existingNames: string[];
  initialFiles?: File[];
  onClose: () => void;
  onImported: (count: number) => void;
  onTargetSelected?: (target: SalesImageImportCategory) => void;
}
const STATUS = { queued: '待导入', uploading: '上传中…', saving: '保存中…', done: '已入库', error: '导入失败' } as const;
const AGE_OPTIONS: Array<{ id: PersonaAge; label: string }> = [
  { id: 'young', label: '青年' },
  { id: 'middle', label: '中年' },
  { id: 'senior', label: '老年' },
  { id: 'child', label: '儿童' },
];

export function SalesImageImportDialog({ kind, existingNames, initialFiles = [], personaGroup, sceneSpace, onClose, onImported, onTargetSelected }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [selection] = useState(() => addSalesImageImportFiles(kind, [], initialFiles, existingNames));
  const [items, setItems] = useState<SalesImageImportItem[]>(selection.items);
  const [errors, setErrors] = useState<string[]>(selection.errors);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [background, setBackground] = useState(false);
  const [configured] = useState(loadSystemConfiguredModels);
  const models = configured.availableImageModels.filter(({ id }) => supportsSalesAssetReferences(id));
  const [model, setModel] = useState(() => models.some(({ id }) => id === configured.selectedImageGenModel) ? configured.selectedImageGenModel : models[0]?.id || '');
  const [targetGroup, setTargetGroup] = useState<PersonaCategory>(personaGroup);
  const [targetSpace, setTargetSpace] = useState<SalesSceneSpace>(sceneSpace);
  const activeGender = personaGender(targetGroup);
  const activeAge: PersonaAge = targetGroup === activeGender ? 'young' : (targetGroup.split('_')[0] as PersonaAge);
  const subject = kind === 'persona' ? '人物' : '场景';
  const category = kind === 'persona' ? PERSONA_CATEGORIES[targetGroup] : SCENE_SPACE_LABELS[targetSpace];
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
      const targetCategory = { personaGroup: targetGroup, sceneSpace: targetSpace };
      const count = await runSalesImageImportBatch(kind, items, targetCategory, controller.signal, {
        catalog: async (signal) => {
          const catalog = await fetchSalesStudioAssets(signal);
          return kind === 'persona' ? catalog.personas : catalog.scenes.map((scene) => ({ ...scene, name: scene.title }));
        },
        upload: (file, signal) => uploadSalesViewImage(file, file.name, signal),
        save: (assetKind, data, signal) => importSalesImageAsset(assetKind, data, background ? { model } : undefined, signal),
      }, (key, patch) => setItems((previous) => previous.map((item) => item.key === key ? { ...item, ...patch } : item)));
      if (!controller.signal.aborted && count) {
        onTargetSelected?.(targetCategory);
        onImported(count);
      }
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
        <div className="bml-import-target-box" role="group" aria-label={`选择${subject}导入分类`}>
          <div className="bml-import-target-header">
            <strong>导入归属分类</strong>
            <span>将归入「{kind === 'persona' ? `人物 / ${activeGender === 'male' ? '男' : '女'} / ${AGE_OPTIONS.find(a => a.id === activeAge)?.label ?? PERSONA_AGES[activeAge]}` : `场景 / ${targetSpace === 'outdoor' ? '室外' : '室内'}`}」</span>
          </div>
          {kind === 'scene' ? (
            <div className="bml-import-target-row">
              <span>空间</span>
              <div className="bml-import-pills">
                {(['indoor', 'outdoor'] as const).map((space) => (
                  <button
                    key={space}
                    type="button"
                    disabled={pending}
                    aria-pressed={targetSpace === space}
                    className={`bml-import-pill${targetSpace === space ? ' is-active' : ''}`}
                    onClick={() => setTargetSpace(space)}
                  >
                    {space === 'indoor' ? '室内' : '室外'}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="bml-import-target-grid">
              <div className="bml-import-target-row">
                <span>性别</span>
                <div className="bml-import-pills">
                  {PERSONA_GENDERS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      disabled={pending}
                      aria-pressed={activeGender === id}
                      className={`bml-import-pill${activeGender === id ? ' is-active' : ''}`}
                      onClick={() => setTargetGroup(personaCategory(id, activeAge))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bml-import-target-row">
                <span>年龄段</span>
                <div className="bml-import-pills">
                  {AGE_OPTIONS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      disabled={pending}
                      aria-pressed={activeAge === id}
                      className={`bml-import-pill${activeAge === id ? ' is-active' : ''}`}
                      onClick={() => setTargetGroup(personaCategory(activeGender, id))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <p className="sales-material-notice">每张图片创建一个{subject}资产，归入「{category}」。名称按库中「{subject}1、{subject}2…」的已有编号顺延，导入后可编辑。</p>
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--sales-line)] p-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={background} disabled={pending} onChange={(event) => setBackground(event.target.checked)} />导入后后台补全{kind === 'persona' ? '人物三视图与特写' : '场景九宫格'}</label>
          {background && <><ConfiguredModelPicker ariaLabel="批量视角生图模型" options={models} value={model} onChange={setModel} disabled={pending} modalityKind="image" variant="agent" emptyLabel="请先配置支持参考图的生图模型" />
            <small className="text-[var(--sales-muted)]">使用所选模型为每个资产{kind === 'persona' ? '生成并保存一张完整的人物三视图' : '生成场景九宫格，裁切后自动保存'}。提交完成后可关闭窗口，在资产库查看后台进度。</small></>}
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
