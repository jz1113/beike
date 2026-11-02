import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Loader2, X } from 'lucide-react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { type SalesCollectionState } from '../model/salesCollectionDraft';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { useSalesSummaryModels } from '../hooks/useSalesSummaryModels';
import { useSalesScriptBundle } from '../hooks/useSalesScriptBundle';
import { useSalesMaterialCatalog } from '../hooks/useSalesMaterialCatalog';
import { deleteSalesMaterial } from '../api/salesMaterials';
import { nextSequentialActionName, salesMaterialCards, type SalesMaterialCard } from '../model/salesMaterialCatalog';
import { SalesMaterialDetailDialog } from './SalesMaterialDetailDialog';
import { SalesMaterialCreateDialog } from './SalesMaterialCreateDialog';
import { SalesActionLinkDialog } from './SalesActionLinkDialog';
import { SalesDepthWorkspace } from './SalesDepthWorkspace';
import { SalesScriptLinkedVideo } from './SalesScriptLinkedVideo';
import { useSalesScripts } from '../hooks/useSalesScripts';
import { salesFocusClass } from './salesChrome';
import { SalesScriptImportPanel } from './SalesScriptImportPanel';
import { SalesScriptLibrary } from './SalesScriptLibrary';
import { SalesScriptReviewer } from './SalesScriptReviewer';
import { SalesScriptTaxonomyDialog } from './SalesScriptTaxonomyDialog';
import { AtlasHubDrawer } from './atlas/AtlasHubDrawer';
import { useSalesScriptTaxonomy } from '../hooks/useSalesScriptTaxonomy';
import type { ScriptTaxonomyItem, ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';
import { salesReferenceLibraryView } from '../model/salesReferenceLibrary';

interface Props {
  state: SalesCollectionState;
  onChange: (patch: Partial<SalesCollectionState>) => void;
  onDraftStateChange?: (hasUnsaved: boolean, saving: boolean) => void;
}

export function SalesScriptWorkspace({ state, onChange, onDraftStateChange }: Props) {
  const scripts = useSalesScripts();
  const materials = useSalesMaterialCatalog();
  const actionCards = salesMaterialCards(materials.catalog).filter((card) => card.kind === 'action');
  const [actionDetail, setActionDetail] = useState<SalesMaterialCard | null>(null);
  const [linkAction, setLinkAction] = useState<SalesMaterialCard | null>(null);
  const [depthOpen, setDepthOpen] = useState(false);
  const [depthSourceId, setDepthSourceId] = useState('');
  const [uploadDepth, setUploadDepth] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const depthDialog = useRef<HTMLDialogElement>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const deleteLock = useRef(false);
  const [actionError, setActionError] = useState('');
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [libraryNotice, setLibraryNotice] = useState('');
  const showSavedMaterials = () => {
    setLibraryRevision((revision) => revision + 1);
    setLibraryNotice('素材已保存，可在列表中查看。');
  };
  useEffect(() => { if (depthOpen) depthDialog.current?.showModal(); }, [depthOpen]);
  const bundle = useSalesScriptBundle({ onAnalysis: scripts.acceptAnalysis, onSaved: (saved) => { scripts.acceptStored(saved); showSavedMaterials(); } });
  const analysisModels = useSalesSummaryModels(state.summaryModel);
  const taxonomy = useSalesScriptTaxonomy();
  const [manageKind, setManageKind] = useState<ScriptTaxonomyKind | null>(null);
  const taxonomyUsage = useMemo(() => {
    if (!manageKind) return {};
    const view = salesReferenceLibraryView(scripts.items, salesMaterialCards(materials.catalog), taxonomy.items, { category: 'all', style: 'all', query: '' });
    return Object.fromEntries([
      ...view.categories.filter((item) => item.value.startsWith('category:')).map((item) => [item.value.slice(9), item.count]),
      ...view.styles.filter((item) => item.value !== 'all').map((item) => [item.value, item.count]),
    ]);
  }, [manageKind, materials.catalog, scripts.items, taxonomy.items]);
  const selectedScriptIdRef = useRef(state.selectedScriptId);
  selectedScriptIdRef.current = state.selectedScriptId;
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (scripts.draft) setImportOpen(false);
  }, [scripts.draft]);
  useEffect(() => {
    onDraftStateChange?.(scripts.hasUnsaved, scripts.busy === 'save' || bundle.analyzing || actionBusy);
  }, [onDraftStateChange, scripts.busy, scripts.hasUnsaved, bundle.analyzing, actionBusy]);
  useEffect(() => () => onDraftStateChange?.(false, false), [onDraftStateChange]);

  const backToLibrary = async () => {
    if (scripts.busy === 'save') return;
    if (scripts.hasUnsaved && !await confirmAction({
      title: '放弃未保存的脚本修改？',
      description: '当前脚本尚有未保存内容。返回脚本库会丢弃这些修改，可以先取消并保存草稿。',
      confirmText: '放弃修改', cancelText: '继续编辑', danger: true,
    })) return;
    scripts.closeDraft();
  };

  const confirmScript = async () => {
    const saved = await scripts.saveDraft('verified');
    if (saved) { scripts.closeDraft(); showSavedMaterials(); }
  };

  const removeTaxonomy = async (item: ScriptTaxonomyItem) => {
    if (!await taxonomy.remove(item.id)) return false;
    const draft = scripts.draft;
    const field = item.kind === 'category' ? 'categoryId' : 'styleId';
    if (draft?.script.taxonomy[field] === item.id) scripts.updateDraft({ ...draft.script, taxonomy: { ...draft.script.taxonomy, [field]: '' } });
    materials.refresh();
    await scripts.refresh();
    return true;
  };

  const deleteAction = async (card: SalesMaterialCard) => {
    if (deleteLock.current) return;
    deleteLock.current = true;
    try {
      if (!await confirmAction({ title: `删除「${card.title}」？`, confirmText: '确认删除', description: '将从素材库移除此动作素材，删除后不可恢复。', danger: true })) return;
      setActionBusy(true); setActionError('');
      await deleteSalesMaterial('action', card.id);
      materials.refresh();
    } catch (err) { setActionError(err instanceof Error ? err.message : '删除动作素材失败'); }
    finally { deleteLock.current = false; setActionBusy(false); }
  };

  return (
    <div className="sales-script-workspace flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {bundle.paused.length > 0 && <div className="sales-prod-card shrink-0" aria-label="暂存的视频处理">
        <p className="sales-card-hint">暂存的处理进度（{bundle.paused.length}）</p>
        <div className="flex flex-wrap gap-2">{bundle.paused.map((item) => <button type="button" key={item.operationId} disabled={Boolean(bundle.job)} className={salesFocusClass} onClick={() => { void bundle.restore(item); }}>恢复：{item.name}</button>)}</div>
      </div>}
      {(bundle.job || bundle.error) && <section className="sales-prod-card shrink-0" aria-label="脚本与深度视频处理进度">
        <p role="status">{(bundle.analyzing || bundle.converting) && <Loader2 size={13} className="inline mr-1 animate-spin" />}
          {bundle.job?.name} · 脚本{bundle.job?.scriptId ? '已保存' : bundle.analyzing ? '分析中' : '待处理'} · {bundle.progress || (bundle.converting ? '深度视频处理中' : '深度视频待处理')}</p>
        {bundle.error && <p role="alert" className="sales-material-error">{bundle.error}</p>}
        {bundle.job && !bundle.job.scriptId && !bundle.analyzing && <ConfiguredModelPicker ariaLabel="继续脚本分析使用的模型" value={analysisModels.model} options={analysisModels.options} onChange={(summaryModel) => onChange({ summaryModel })} variant="agent" showReasoning />}
        <div className="flex flex-wrap gap-2">
          {bundle.job && !bundle.job.scriptId && !bundle.analyzing && <button type="button" className={salesFocusClass} onClick={() => { void bundle.retryAnalysis(analysisModels.model); }}>{bundle.job.pendingScript ? '仅重试保存脚本' : '继续脚本分析'}</button>}
          {bundle.job && !bundle.converting && <button type="button" className={salesFocusClass} onClick={() => { void bundle.resumeDepth(); }}>{bundle.job.depthState === 'failed' ? '仅重试深度视频' : bundle.job.resultUrl ? '保存视频关联' : '继续深度处理'}</button>}
          {bundle.job && <button type="button" className={salesFocusClass} onClick={bundle.pause}>暂存进度，导入其他视频</button>}
          {bundle.job?.scriptId && <button type="button" className={salesFocusClass} onClick={() => { void bundle.deferDepth(); }}>保留脚本，稍后处理深度</button>}
          {(bundle.analyzing || bundle.converting) && <button type="button" className={salesFocusClass} onClick={bundle.cancel}>停止等待</button>}
        </div>
      </section>}
      {(actionError || materials.error) && <p role="alert" className="sales-material-error">{actionError || materials.error}<button type="button" onClick={() => { setActionError(''); materials.refresh(); }}>重试读取</button></p>}
      {scripts.error && !importOpen && (
        <div role="alert" className="flex shrink-0 items-start gap-3 rounded-xl bg-rose-500/10 px-4 py-3 text-xs leading-5 text-rose-700 dark:text-rose-200">
          <p className="min-w-0 flex-1">{scripts.error}</p>
          <button type="button" aria-label="关闭脚本提示" onClick={scripts.clearError} className={`rounded ${salesFocusClass}`}><X className="h-4 w-4" /></button>
        </div>
      )}
      {taxonomy.error && !manageKind && <div className="sales-taxonomy-error" role="alert">{taxonomy.error}<button type="button" onClick={() => { void taxonomy.refresh(); }} className={salesFocusClass}>重新读取</button></div>}
      {libraryNotice && !scripts.draft && <p role="status" className="sales-material-notice">{libraryNotice}<button type="button" aria-label="关闭保存提示" className={salesFocusClass} onClick={() => setLibraryNotice('')}><X size={13} /></button></p>}

      {scripts.draft ? (
        <SalesScriptReviewer
          draft={scripts.draft}
          taxonomyItems={taxonomy.items}
          taxonomyLoading={taxonomy.loading}
          onManageTaxonomy={setManageKind}
          onCreateTaxonomy={taxonomy.create}
          linkedVideo={<SalesScriptLinkedVideo key={scripts.draft.id || 'draft'} draft={scripts.draft}
            disabled={Boolean(bundle.job) || scripts.busy === 'save'} onSaved={scripts.acceptStored}
            onConvert={(item, file) => bundle.start(item.videoUrl, item.title, state.summaryModel, file, item)} />}
          saving={scripts.busy === 'save'}
          onChange={scripts.updateDraft}
          onBack={() => { void backToLibrary(); }}
          onSaveDraft={() => scripts.saveDraft('draft')}
          onConfirm={() => { void confirmScript(); }}
        />
      ) : (
        <SalesScriptLibrary
          key={libraryRevision}
          embedded
          items={scripts.items}
          loading={scripts.loading || materials.loading}
          loadError={scripts.listError || materials.error}
          actionCards={actionCards}
          actionBusy={actionBusy || Boolean(bundle.job)}
          onReviewAction={setActionDetail}
          onLinkAction={setLinkAction}
          onDeleteAction={(card) => { void deleteAction(card); }}
          onOpenDepth={() => { setDepthSourceId(''); setDepthOpen(true); }}
          onUploadDepth={() => setUploadDepth(true)}
          onOpenAtlas={() => setAtlasOpen(true)}
          taxonomyItems={taxonomy.items}
          taxonomyLoading={taxonomy.loading}
          taxonomyBusy={taxonomy.busy}
          onManageTaxonomy={setManageKind}
          onCreateTaxonomy={taxonomy.create}
          onRenameTaxonomy={taxonomy.rename}
          onRemoveTaxonomy={removeTaxonomy}
          onReview={scripts.openStored}
          onArchive={async (id) => { const ok = await scripts.archive(id); if (ok && selectedScriptIdRef.current === id) onChange({ selectedScriptId: '' }); return ok; }}
          onDelete={async (id) => {
            if (bundle.job?.scriptId === id) { scripts.reportError('该脚本的关联视频仍在处理中，请先暂存进度再删除'); return false; }
            const ok = await scripts.remove(id); if (ok && selectedScriptIdRef.current === id) onChange({ selectedScriptId: '' }); return ok;
          }}
          onRefresh={() => { void scripts.refresh(); void taxonomy.refresh(); materials.refresh(); }}
          onOpenImport={() => { scripts.clearError(); setImportOpen(true); }}
          onQuickClassify={async (item, categoryId, styleId) => { const saved = await scripts.reclassify(item, categoryId, styleId); if (saved) showSavedMaterials(); return saved; }}
        />
      )}

      {actionDetail && <SalesMaterialDetailDialog card={actionDetail} images={actionDetail.sourceImages?.length ? actionDetail.sourceImages : actionDetail.image ? [actionDetail.image] : []}
        actionCategories={taxonomy.items.filter((item) => item.kind === 'category')} onCreateActionCategory={(name) => taxonomy.create('category', name)}
        onConvert={actionDetail.mediaType === 'image' || actionDetail.mediaType === 'video' ? () => { setDepthSourceId(actionDetail.id); setActionDetail(null); setDepthOpen(true); } : undefined}
        onClose={() => setActionDetail(null)} onChanged={(msg) => { materials.refresh(); if (msg) setLibraryNotice(msg); }} />}
      {atlasOpen && <AtlasHubDrawer open={atlasOpen} defaultTab="pose" onClose={() => setAtlasOpen(false)}
        onImported={({ message }) => { materials.refresh(); void taxonomy.refresh(); setLibraryRevision((r) => r + 1); setLibraryNotice(message); }} />}
      {linkAction && <SalesActionLinkDialog action={linkAction} scripts={scripts.items} onSaved={(saved) => { scripts.acceptStored(saved); showSavedMaterials(); }} onClose={() => setLinkAction(null)} />}
      {uploadDepth && <SalesMaterialCreateDialog type="action" defaultName={nextSequentialActionName(materials.catalog.actions)}
        actionCategories={taxonomy.items.filter((item) => item.kind === 'category')} onCreateActionCategory={(name) => taxonomy.create('category', name)}
        onClose={() => setUploadDepth(false)} onCreated={() => { setUploadDepth(false); materials.refresh(); showSavedMaterials(); }} />}
      {depthOpen && <dialog ref={depthDialog} className="sales-depth-modal" aria-label="单独深度转换" onCancel={() => setDepthOpen(false)}>
        <header className="sales-depth-modal-header"><h2><Layers size={18} />单独深度转换</h2><button type="button" aria-label="关闭深度转换" onClick={() => setDepthOpen(false)} className={salesFocusClass}><X size={18} /></button></header>
        <SalesDepthWorkspace enabled source={materials.catalog.actions.find((item) => item.id === depthSourceId) || null}
          actionCategories={taxonomy.items.filter((item) => item.kind === 'category')} defaultActionName={nextSequentialActionName(materials.catalog.actions)}
          onSaved={() => { setDepthOpen(false); materials.refresh(); showSavedMaterials(); }} />
      </dialog>}

      {manageKind && <SalesScriptTaxonomyDialog initialKind={manageKind} items={taxonomy.items} usageCounts={taxonomyUsage} usageLoading={scripts.loading || materials.loading}
        loading={taxonomy.loading} busy={taxonomy.busy} error={taxonomy.error} onRetry={() => { void taxonomy.refresh(); }}
        onCreate={taxonomy.create} onRename={taxonomy.rename} onRemove={removeTaxonomy} onClose={() => setManageKind(null)} />}

      {importOpen && (
        <SalesScriptImportPanel
          preferredModel={state.summaryModel}
          onModelChange={(summaryModel) => onChange({ summaryModel })}
          video={scripts.video}
          busy={bundle.analyzing ? 'analyze' : scripts.busy}
          error={bundle.error || scripts.error}
          pendingBundle={Boolean(bundle.job)}
          onUpload={scripts.uploadVideo}
          onClearVideo={scripts.clearVideo}
          onAnalyze={(model) => { if (scripts.video) bundle.start(scripts.video.videoUrl, scripts.video.name, model, scripts.uploadedFile, undefined, scripts.video.durationSec); }}
          onCancel={() => { scripts.cancel(); bundle.cancel(); }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
