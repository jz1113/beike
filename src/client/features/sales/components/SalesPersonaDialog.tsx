import { PERSONA_CATEGORIES, PERSONA_SHEET_VIEWS, type PersonaCategory, classifyPersonaGroup, personaCategory, personaGender, personaImageFields, readPersonaViews, type SupplementView } from '../model/salesActionViews';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { SalesPersonaCandidate, SalesVoiceCandidate } from '@shared/domain/sales';
import { generateSalesAssetGrid } from '../api/salesAssetViews';
import { createSalesMaterial, deleteSalesMaterial, updateSalesMaterial } from '../api/salesMaterials';
import { useSalesAssetDraft, useSalesAssetViews, type SalesAssetBackground } from '../hooks/useSalesAssetViews';
import { compareSalesAssetNames, readSalesAssetCreation, readSalesAssetJobId, type SalesAssetDraftPersistence } from '../model/salesAssetDraft';
import { mergeGroupTag } from '../model/salesMaterialCatalog';
import { SalesAssetDraftStatus, salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';
import { SalesAssetViewGallery } from './SalesAssetViewGallery';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import '../salesAssetDialog.css';
import '../salesPersona.css';

function useSalesPersonaViews(persona?: SalesPersonaCandidate, draft?: SalesAssetDraftPersistence, background?: SalesAssetBackground<SupplementView>) {
  return useSalesAssetViews<SupplementView>({
    draft, background, creationMode: !persona || Boolean(readSalesAssetCreation(persona.dimensions)),
    creation: readSalesAssetCreation(persona?.dimensions), jobId: readSalesAssetJobId(persona?.dimensions),
    initial: () => readPersonaViews(persona), definitions: PERSONA_SHEET_VIEWS,
    referenceKeys: ['main', 'face'], prefix: 'persona-grid',
    generate: (request, signal, onStage, onProgress) => generateSalesAssetGrid('persona', request, signal, onStage, onProgress),
  });
}

interface Props {
  persona?: SalesPersonaCandidate;
  draftId?: string;
  voices: SalesVoiceCandidate[];
  defaultGroup?: PersonaCategory;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function SalesPersonaDialog({ persona, draftId, voices, defaultGroup = 'female', onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const abort = useRef<AbortController | null>(null);
  const draft = useSalesAssetDraft('persona', draftId ?? persona?.id, { name: persona?.name || '', group: persona ? classifyPersonaGroup(persona) : defaultGroup, voiceId: persona?.defaultVoiceId || '' });
  const { name, voiceId } = draft.fields;
  const storedGroup = draft.fields.group;
  const group = storedGroup === 'senior' || storedGroup === 'child'
    ? personaCategory(personaGender(persona ? classifyPersonaGroup(persona) : defaultGroup), storedGroup)
    : Object.hasOwn(PERSONA_CATEGORIES, storedGroup) ? storedGroup as PersonaCategory : defaultGroup;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const photos = useSalesPersonaViews(persona, draft, {
    kind: 'persona', assetId: persona?.id, enabled: Boolean(name.trim()), waitForResult: true,
    data: (views, extraImages) => ({
      name: name.trim(), tags: mergeGroupTag(persona?.tags || '', PERSONA_CATEGORIES[group], Object.values(PERSONA_CATEGORIES)),
      ...personaImageFields(views, extraImages, persona?.dimensions, group, voiceId),
    }),
    onQueued: () => {},
  });
  const readOnly = Boolean(persona && persona.source !== 'persona_library');
  const busy = pending || photos.active.length > 0;
  const canClose = !pending && (!busy || Boolean(photos.background && photos.savedAssetId && !photos.unconfirmedBackground && photos.stage !== 'uploading'));
  useEffect(() => {
    if (abort.current?.signal.aborted) {
      abort.current = null; setPending(false);
      setError('操作已中断，草稿已保留。请确认资产库结果后再重试。');
    }
    dialog.current?.showModal();
    return () => abort.current?.abort();
  }, []);

  const close = () => { if (canClose && (readOnly || draft.flush())) onClose(); };

  const discardDraft = async () => {
    if (busy) return;
    if (!await confirmAction({ title: '放弃本次草稿？', description: '未保存的编辑将被清除，已入库资产和上传的图片文件会保留。', confirmText: '放弃草稿', danger: true })) return;
    if (draft.clear()) onClose();
  };

  const save = async () => {
    if (busy || abort.current || readOnly || !name.trim() || !photos.views.main || (!persona && photos.unconfirmedBackground)) return;
    const controller = new AbortController(); abort.current = controller;
    setPending(true); setError('');
    try {
      const data = {
        name: name.trim(), tags: mergeGroupTag(persona?.tags || '', PERSONA_CATEGORIES[group], Object.values(PERSONA_CATEGORIES)),
        ...personaImageFields(photos.views, photos.extraImages, photos.withCreationDimensions(persona?.dimensions), group, voiceId),
      };
      const assetId = persona?.id || photos.savedAssetId;
      if (assetId) await updateSalesMaterial('persona', assetId, data, controller.signal);
      else await createSalesMaterial('persona', data, controller.signal);
      if (!controller.signal.aborted) {
        const cleared = draft.clear();
        onSaved(`已保存人物「${name.trim()}」${cleared ? '' : '；本机旧草稿未清除，请勿重复入库'}`);
        onClose();
      }
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '保存失败，请重试'); }
    finally { if (abort.current === controller && !controller.signal.aborted) { abort.current = null; setPending(false); } }
  };
  const removePersona = async () => {
    if (busy || abort.current || readOnly || !persona) return;
    if (!await confirmAction({ title: `删除「${persona.name}」？`, confirmText: '确认删除', description: '删除后将从当前工作区移除，已绑定该资产的槽位会自动解绑。' })) return;
    const controller = new AbortController(); abort.current = controller;
    setPending(true); setError('');
    try {
      await deleteSalesMaterial('persona', persona.id, controller.signal);
      if (!controller.signal.aborted) { const cleared = draft.clear(); onSaved(`已删除「${persona.name}」${cleared ? '' : '；本机旧草稿未清除'}`); onClose(); }
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '删除失败'); }
    finally { if (abort.current === controller && !controller.signal.aborted) { abort.current = null; setPending(false); } }
  };

  return <dialog ref={dialog} className="sales-material-dialog sales-asset-dialog sales-persona-dialog" aria-labelledby="sales-persona-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <header className="sales-asset-header">
        <div className="sales-asset-heading"><h2 id="sales-persona-title">{persona ? readOnly ? '人物资产' : '编辑人物' : '新增人物'}</h2>
          <SalesAssetDraftStatus status={draft.status} existing={Boolean(persona || photos.savedAssetId)} busy={busy} pending={pending} readOnly={readOnly} onDiscard={() => void discardDraft()} />
        </div>
        <button type="button" className={salesGhostButtonClass} aria-label="关闭人物窗口" disabled={!canClose} onClick={close}><X size={18} /></button>
      </header>
      <div className="sales-asset-content">
        <div className="sales-asset-fields sales-asset-identity-fields">
          <label>人物名称 <span className="sales-asset-required">*</span><input autoFocus required maxLength={80} value={name} disabled={busy || readOnly} onChange={(event) => draft.setField('name', event.target.value)} placeholder="给人物起个名字" className={salesInputClass} /></label>
          <div className="sales-dialog-field sales-asset-select-field"><span>音色</span>
            <SalesLibrarySelect label="音色" value={voiceId} disabled={busy || readOnly} searchable onChange={(value) => draft.setField('voiceId', value)}
              options={[{ value: '', label: '无配音' },
                ...(voiceId && !voices.some((voice) => voice.id === voiceId) ? [{ value: voiceId, label: '原音色（暂不可用）' }] : []),
                ...[...voices].sort((a, b) => compareSalesAssetNames(a.name, b.name)).map((voice) => ({ value: voice.id, label: voice.name }))]} />
          </div>
          <div className="sales-dialog-field sales-asset-select-field"><span>人物分类</span>
            <SalesLibrarySelect label="人物分类" value={group} disabled={busy || readOnly} onChange={(value) => draft.setField('group', value)}
              options={Object.entries(PERSONA_CATEGORIES).map(([value, label]) => ({ value, label }))} />
          </div>
        </div>
        <SalesAssetViewGallery subject="人物" definitions={PERSONA_SHEET_VIEWS} photos={photos} busy={busy} readOnly={readOnly} />
        {draft.error && <p role="alert" className="sales-material-error">{draft.error}</p>}
        {error && <p role="alert" className="sales-material-error">{error}</p>}
      </div>
      <footer className="sales-asset-footer">
        {persona && !readOnly && <button type="button" className={salesGhostButtonClass} disabled={busy} onClick={() => void removePersona()}><Trash2 size={14} />删除人物</button>}
        <div><button type="button" className={salesGhostButtonClass} disabled={!canClose} onClick={close}>{readOnly ? '关闭' : '暂存关闭'}</button>
          {!readOnly && <button type="submit" disabled={busy || !name.trim() || !photos.views.main || (!persona && photos.unconfirmedBackground)} className={`sales-collect-primary ${salesFocusClass}`}>{pending && <Loader2 size={14} className="animate-spin" />}{persona ? '保存修改' : '保存到资产库'}</button>}
        </div>
      </footer>
    </form>
  </dialog>;
}
