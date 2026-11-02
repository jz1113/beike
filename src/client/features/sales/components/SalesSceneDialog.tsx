import { useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { SalesSceneCandidate } from '@shared/domain/sales';
import { createSalesMaterial, deleteSalesMaterial, updateSalesMaterial } from '../api/salesMaterials';
import { useSalesAssetDraft } from '../hooks/useSalesAssetDraft';
import { useSalesSceneViews } from '../hooks/useSalesSceneViews';
import { classifySceneSpace, mergeGroupTag, SCENE_SPACE_LABELS, type SalesSceneSpace } from '../model/salesMaterialCatalog';
import { SCENE_VIEWS, sceneImageFields } from '../model/salesSceneViews';
import { SalesAssetDraftStatus } from './SalesAssetDraftStatus';
import { SalesAssetViewGallery } from './SalesAssetViewGallery';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import { salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';
import '../salesAssetDialog.css';
import '../salesPersona.css';

interface Props {
  scene?: SalesSceneCandidate;
  defaultSpace?: SalesSceneSpace;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function SalesSceneDialog({ scene, defaultSpace = 'indoor', onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const abort = useRef<AbortController | null>(null);
  const draft = useSalesAssetDraft('scene', scene?.id, { name: scene?.title || '', space: scene ? classifySceneSpace(scene) : defaultSpace, tags: scene?.tags || '' });
  const { name, tags } = draft.fields;
  const space = (Object.hasOwn(SCENE_SPACE_LABELS, draft.fields.space) ? draft.fields.space : defaultSpace) as SalesSceneSpace;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const photos = useSalesSceneViews(scene, draft, {
    kind: 'scene', assetId: scene?.id, enabled: Boolean(name.trim()),
    data: (views, extraImages) => ({
      title: name.trim(), tags: mergeGroupTag(scene?.tags ?? tags ?? '', SCENE_SPACE_LABELS[space], ['室内', '户外']),
      spatialType: scene && classifySceneSpace(scene) === space ? scene.spatialType : space === 'outdoor' ? 'outdoor' : 'indoor_room',
      ...sceneImageFields(views, extraImages, scene?.dimensions),
    }),
    onQueued: () => { const cleared = draft.clear(); onSaved(`场景「${name.trim()}」已入库，九宫格正在后台生成，完成后自动保存${cleared ? '' : '；本机旧草稿未清除，请勿重复入库'}`); onClose(); },
  });
  const busy = pending || photos.active.length > 0;
  useEffect(() => {
    if (abort.current?.signal.aborted) {
      abort.current = null; setPending(false);
      setError('操作已中断，草稿已保留。请确认资产库结果后再重试。');
    }
    dialog.current?.showModal();
    return () => abort.current?.abort();
  }, []);

  const close = () => { if (!busy && draft.flush()) onClose(); };

  const discardDraft = async () => {
    if (busy) return;
    if (!await confirmAction({ title: '放弃本次草稿？', description: '未保存的编辑将被清除，已入库资产和上传的图片文件会保留。', confirmText: '放弃草稿', danger: true })) return;
    if (draft.clear()) onClose();
  };

  const save = async () => {
    if (busy || abort.current || !name.trim() || !photos.views.main || (!scene && photos.unconfirmedBackground)) return;
    const controller = new AbortController(); abort.current = controller;
    setPending(true); setError('');
    try {
      const data = {
        title: name.trim(), tags: mergeGroupTag(scene?.tags ?? tags ?? '', SCENE_SPACE_LABELS[space], ['室内', '户外']),
        spatialType: scene && classifySceneSpace(scene) === space ? scene.spatialType : space === 'outdoor' ? 'outdoor' : 'indoor_room',
        ...sceneImageFields(photos.views, photos.extraImages, scene?.dimensions),
      };
      const assetId = scene?.id || photos.savedAssetId;
      if (assetId) await updateSalesMaterial('scene', assetId, data, controller.signal);
      else await createSalesMaterial('scene', data, controller.signal);
      if (!controller.signal.aborted) {
        const cleared = draft.clear();
        onSaved(`已保存场景「${name.trim()}」${cleared ? '' : '；本机旧草稿未清除，请勿重复入库'}`);
        onClose();
      }
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '保存失败，请重试'); }
    finally { if (abort.current === controller && !controller.signal.aborted) { abort.current = null; setPending(false); } }
  };

  const removeScene = async () => {
    if (busy || abort.current || !scene) return;
    if (!await confirmAction({ title: `删除「${scene.title}」？`, confirmText: '确认删除', description: '删除后将从当前工作区移除，已绑定该资产的槽位会自动解绑。' })) return;
    const controller = new AbortController(); abort.current = controller;
    setPending(true); setError('');
    try {
      await deleteSalesMaterial('scene', scene.id, controller.signal);
      if (!controller.signal.aborted) { const cleared = draft.clear(); onSaved(`已删除「${scene.title}」${cleared ? '' : '；本机旧草稿未清除'}`); onClose(); }
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '删除失败'); }
    finally { if (abort.current === controller && !controller.signal.aborted) { abort.current = null; setPending(false); } }
  };

  return <dialog ref={dialog} className="sales-material-dialog sales-asset-dialog sales-persona-dialog" aria-labelledby="sales-scene-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <header className="sales-asset-header">
        <div className="sales-asset-heading"><h2 id="sales-scene-title">{scene ? '编辑场景' : '新增场景'}</h2>
          <SalesAssetDraftStatus status={draft.status} existing={Boolean(scene)} busy={busy} pending={pending} onDiscard={() => void discardDraft()} />
        </div>
        <button type="button" className={salesGhostButtonClass} aria-label="关闭场景窗口" disabled={busy} onClick={close}><X size={18} /></button>
      </header>
      <div className="sales-asset-content">
        <SalesAssetViewGallery subject="场景" definitions={SCENE_VIEWS} photos={photos} busy={busy} />
        <div className="sales-asset-fields">
        <label>场景名称 <span className="sales-asset-required">*</span><input autoFocus required maxLength={80} value={name} disabled={busy} onChange={(event) => draft.setField('name', event.target.value)} placeholder="给场景起个名字" className={salesInputClass} /></label>
        <div className="sales-dialog-field sales-asset-select-field"><span>空间分类</span>
          <SalesLibrarySelect label="空间分类" value={space} disabled={busy} onChange={(value) => draft.setField('space', value)}
            options={Object.entries(SCENE_SPACE_LABELS).map(([value, label]) => ({ value, label }))} />
        </div>
        </div>
        {draft.error && <p role="alert" className="sales-material-error">{draft.error}</p>}
        {error && <p role="alert" className="sales-material-error">{error}</p>}
      </div>
      <footer className="sales-asset-footer">
        {scene && <button type="button" className={salesGhostButtonClass} disabled={busy} onClick={() => void removeScene()}><Trash2 size={14} />删除场景</button>}
        <div><button type="button" className={salesGhostButtonClass} disabled={busy} onClick={close}>暂存关闭</button>
          <button type="submit" disabled={busy || !name.trim() || !photos.views.main || (!scene && photos.unconfirmedBackground)} className={`sales-collect-primary ${salesFocusClass}`}>{pending && <Loader2 size={14} className="animate-spin" />}{scene ? '保存修改' : '保存到资产库'}</button>
        </div>
      </footer>
    </form>
  </dialog>;
}
