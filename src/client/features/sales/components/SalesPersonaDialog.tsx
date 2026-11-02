import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { SalesPersonaCandidate, SalesVoiceCandidate } from '@shared/domain/sales';
import { fetchAtlasMediaAsFile } from '../api/salesAtlas';
import { createSalesMaterial, deleteSalesMaterial, updateSalesMaterial } from '../api/salesMaterials';
import { useSalesAssetDraft } from '../hooks/useSalesAssetDraft';
import { useSalesPersonaViews } from '../hooks/useSalesPersonaViews';
import { classifyPersonaGroup, mergeGroupTag, PERSONA_GROUP_LABELS, type SalesPersonaGroup } from '../model/salesMaterialCatalog';
import { PERSONA_VIEWS, personaImageFields } from '../model/salesPersonaViews';
import { compareSalesAssetNames } from '../model/salesAssetNames';
import { AtlasHubDrawer } from './atlas/AtlasHubDrawer';
import { salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';
import { SalesAssetDraftStatus } from './SalesAssetDraftStatus';
import { SalesAssetViewGallery } from './SalesAssetViewGallery';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import '../salesAssetDialog.css';
import '../salesPersona.css';

interface Props {
  persona?: SalesPersonaCandidate;
  voices: SalesVoiceCandidate[];
  defaultGroup?: SalesPersonaGroup;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function SalesPersonaDialog({ persona, voices, defaultGroup = 'female', onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const abort = useRef<AbortController | null>(null);
  const draft = useSalesAssetDraft('persona', persona?.id, { name: persona?.name || '', group: persona ? classifyPersonaGroup(persona) : defaultGroup, voiceId: persona?.defaultVoiceId || '' });
  const { name, voiceId } = draft.fields;
  const group = (Object.hasOwn(PERSONA_GROUP_LABELS, draft.fields.group) ? draft.fields.group : defaultGroup) as SalesPersonaGroup;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [pickingAtlasFace, setPickingAtlasFace] = useState(false);
  const photos = useSalesPersonaViews(persona, draft, {
    kind: 'persona', assetId: persona?.id, enabled: Boolean(name.trim()),
    data: (views, extraImages) => ({
      name: name.trim(), tags: mergeGroupTag(persona?.tags || '', PERSONA_GROUP_LABELS[group], ['男', '女', '老', '儿童']),
      ...personaImageFields(views, extraImages, persona?.dimensions, group, voiceId),
    }),
    onQueued: () => { const cleared = draft.clear(); onSaved(`人物「${name.trim()}」已入库，九宫格正在后台生成，完成后自动保存${cleared ? '' : '；本机旧草稿未清除，请勿重复入库'}`); onClose(); },
  });
  const readOnly = Boolean(persona && persona.source !== 'persona_library');
  const busy = pending || photos.active.length > 0;
  useEffect(() => {
    if (abort.current?.signal.aborted) {
      abort.current = null; setPending(false);
      setError('操作已中断，草稿已保留。请确认资产库结果后再重试。');
    }
    dialog.current?.showModal();
    return () => abort.current?.abort();
  }, []);

  const close = () => { if (!busy && (readOnly || draft.flush())) onClose(); };

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
        name: name.trim(), tags: mergeGroupTag(persona?.tags || '', PERSONA_GROUP_LABELS[group], ['男', '女', '老', '儿童']),
        ...personaImageFields(photos.views, photos.extraImages, persona?.dimensions, group, voiceId),
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
          <SalesAssetDraftStatus status={draft.status} existing={Boolean(persona)} busy={busy} pending={pending} readOnly={readOnly} onDiscard={() => void discardDraft()} />
        </div>
        <button type="button" className={salesGhostButtonClass} aria-label="关闭人物窗口" disabled={busy} onClick={close}><X size={18} /></button>
      </header>
      <div className="sales-asset-content">
        {!readOnly ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3.5 py-2.5">
            <div className="text-xs text-slate-600 dark:text-zinc-300">
              <strong className="font-semibold text-indigo-600 dark:text-indigo-300">快速建角色：</strong>
              可从开源人像图鉴（1,499 张正脸/造型图）挑选主图，再用 AI 九宫格一键补全全身与多角度参考。
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPickingAtlasFace(true)}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-white/90 px-3 text-xs font-semibold text-indigo-600 shadow-sm hover:border-indigo-500 hover:bg-indigo-50 dark:bg-zinc-900 dark:text-indigo-300 ${salesFocusClass}`}
            >
              <Sparkles size={13} />从人像图鉴选主图
            </button>
          </div>
        ) : null}
        <SalesAssetViewGallery subject="人物" definitions={PERSONA_VIEWS} photos={photos} busy={busy} readOnly={readOnly} />
        <label>人物名称 <span className="sales-asset-required">*</span><input autoFocus required maxLength={80} value={name} disabled={busy || readOnly} onChange={(event) => draft.setField('name', event.target.value)} placeholder="给人物起个名字" className={salesInputClass} /></label>
        <div className="sales-asset-fields">
          <div className="sales-dialog-field sales-asset-select-field"><span>音色</span>
            <SalesLibrarySelect label="音色" value={voiceId} disabled={busy || readOnly} searchable onChange={(value) => draft.setField('voiceId', value)}
              options={[{ value: '', label: '无配音' },
                ...(voiceId && !voices.some((voice) => voice.id === voiceId) ? [{ value: voiceId, label: '原音色（暂不可用）' }] : []),
                ...[...voices].sort((a, b) => compareSalesAssetNames(a.name, b.name)).map((voice) => ({ value: voice.id, label: voice.name }))]} />
          </div>
          <div className="sales-dialog-field sales-asset-select-field"><span>人物分类</span>
            <SalesLibrarySelect label="人物分类" value={group} disabled={busy || readOnly} onChange={(value) => draft.setField('group', value)}
              options={Object.entries(PERSONA_GROUP_LABELS).map(([value, label]) => ({ value, label }))} />
          </div>
        </div>
        {draft.error && <p role="alert" className="sales-material-error">{draft.error}</p>}
        {error && <p role="alert" className="sales-material-error">{error}</p>}
      </div>
      <footer className="sales-asset-footer">
        {persona && !readOnly && <button type="button" className={salesGhostButtonClass} disabled={busy} onClick={() => void removePersona()}><Trash2 size={14} />删除人物</button>}
        <div><button type="button" className={salesGhostButtonClass} disabled={busy} onClick={close}>{readOnly ? '关闭' : '暂存关闭'}</button>
          {!readOnly && <button type="submit" disabled={busy || !name.trim() || !photos.views.main || (!persona && photos.unconfirmedBackground)} className={`sales-collect-primary ${salesFocusClass}`}>{pending && <Loader2 size={14} className="animate-spin" />}{persona ? '保存修改' : '保存到资产库'}</button>}
        </div>
      </footer>
    </form>
    {pickingAtlasFace ? (
      <AtlasHubDrawer
        open={pickingAtlasFace}
        defaultTab="face"
        defaultFaceAudience={group === 'male' ? 'adult_male' : 'adult_female'}
        pickerMode="pick-persona-main"
        onClose={() => setPickingAtlasFace(false)}
        onPickPersonaFace={async (face, suggestedName) => {
          const file = await fetchAtlasMediaAsFile(face.fullUrl || face.thumbUrl, `${face.id}.jpg`);
          await photos.upload('main', file);
          if (!name.trim()) draft.setField('name', suggestedName);
        }}
      />
    ) : null}
  </dialog>;
}
