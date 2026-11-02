import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ShoppingBag, X } from 'lucide-react';
import { StudioBrandChip } from '@client/shared/ui/studio/StudioBrandChip';
import { useResizablePane, WorkbenchResizeHandle } from '@client/shared/ui/studio/ResizableWorkbench';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { ProductSetupPanel } from './components/salesProductSetup';
import { SalesProductSelectionSummary } from './components/SalesProductSelectionSummary';
import { salesFocusClass, salesGhostButtonClass } from './components/salesChrome';
import { useSalesCollection } from './hooks/useSalesCollection';
import { useSalesPrompts } from './hooks/useSalesPrompts';
import { SalesPromptWorkspace } from './components/SalesPromptWorkspace';
import { hasSalesCollection } from './model/salesCollectionDraft';
import { SalesWorkflowStatus } from './components/SalesWorkflowStatus';
import { SalesOCRWorkspace } from './components/SalesOCRWorkspace';
import { SalesScriptWorkspace } from './components/SalesScriptWorkspace';
import { SalesProductionWorkspace } from './components/SalesProductionWorkspace';
import './salesProduct.css';
import './salesOCR.css';
import './salesWorkflow.css';
import './salesWorkspace.css';
import './salesSummary.css';
import './salesScript.css';
import './salesStoryboard.css';
import './salesProduction.css';
import './salesLibrary.css';
import './salesTaxonomy.css';
import { SalesMaterialWorkspace } from './components/SalesMaterialWorkspace';
import { SalesWorkspaceNavigation } from './components/SalesWorkspaceNavigation';
import type { SalesAssetSection, SalesWorkspace } from './model/salesWorkspace';
import './salesStudio.css';
import './salesNavigation.css';
import './salesPrompts.css';
import './salesAtlas.css';
import { SalesEditorNavigation, type SalesEditorView } from './components/SalesEditorNavigation';
import './salesEditor.css';

interface Props { onBack: () => void }

function isMockedWindowConfirm(): boolean {
  return typeof window !== 'undefined' && typeof window.confirm === 'function' && 'mock' in window.confirm;
}

function confirmDiscardDraft(message: string, onConfirmed: () => void) {
  if (isMockedWindowConfirm()) {
    if (window.confirm(message)) onConfirmed();
    return;
  }
  void confirmAction({
    title: '未保存修改提醒',
    description: message,
    confirmText: '丢弃并离开',
    cancelText: '继续编辑',
    danger: true,
  }).then((ok) => {
    if (ok) onConfirmed();
  });
}

export default function SalesStudio({ onBack }: Props) {
  const studio = useSalesCollection();
  const [stage, setStage] = useState<SalesWorkspace>('workflow');
  const [assetSection, setAssetSection] = useState<SalesAssetSection>('script');
  const [scriptDraft, setScriptDraft] = useState({ unsaved: false, saving: false });
  const onScriptDraftChange = useCallback((unsaved: boolean, saving: boolean) => {
    setScriptDraft((previous) => previous.unsaved === unsaved && previous.saving === saving ? previous : { unsaved, saving });
  }, []);
  const prompts = useSalesPrompts(stage === 'assets' && assetSection === 'prompts');

  const guardScriptLeave = (proceed: () => void) => {
    if (stage !== 'assets' || assetSection !== 'script') { proceed(); return; }
    if (scriptDraft.saving) return;
    if (!scriptDraft.unsaved) { proceed(); return; }
    confirmDiscardDraft('脚本还有未保存的修改。离开后将丢弃这些修改，确定离开吗？', proceed);
  };

  const leaveStudio = (navigate: () => void) => {
    if (productionBusy) return;
    if (!studio.flushDraft()) return;
    guardScriptLeave(() => {
      if (prompts.hasUnsaved) {
        confirmDiscardDraft('提示词还有未保存的修改。离开后将丢弃这些修改，确定离开吗？', navigate);
        return;
      }
      navigate();
    });
  };

  const workspaceId = useId();
  const [draggedImage, setDraggedImage] = useState<string | null>(null);
  const galleryRef = useRef<HTMLElement>(null);
  const expandGalleryRef = useRef<HTMLButtonElement>(null);
  const [editorView, setEditorView] = useState<SalesEditorView>('summary');
  const [productionBusy, setProductionBusy] = useState(false);
  const [showGallery, setShowGallery] = useState(true);
  const galleryPane = useResizablePane({ storageKey: 'beike:sales:gallery-width', defaultWidth: 420, minWidth: 288, maxWidth: 500 });

  const changeEditorView = (next: SalesEditorView) => {
    setEditorView(next);
    if (next !== 'summary' && next !== editorView && studio.state.colorSelection.confirmedImageUrls.length > 0) setShowGallery(false);
  };
  const galleryProductKey = studio.state.collectedProductUrl || studio.state.imageCatalog[0]?.url || (hasSalesCollection(studio.state) ? 'draft' : '');
  useEffect(() => { setShowGallery(true); }, [galleryProductKey]);

  const [libraryVersion, setLibraryVersion] = useState(0);
  const navigationBusy = productionBusy || (stage === 'assets' && assetSection === 'script' && scriptDraft.saving);
  const changeWorkspace = (workspace: SalesWorkspace) => {
    if (workspace === stage) return;
    if (productionBusy && workspace !== 'workflow') return;
    guardScriptLeave(() => {
      if (workspace === 'workflow' && stage !== 'workflow') setLibraryVersion((version) => version + 1);
      setStage(workspace);
    });
  };

  const changeAssetSection = (section: SalesAssetSection) => {
    if (section === assetSection) return;
    guardScriptLeave(() => setAssetSection(section));
  };
  const openAssetLibrary = (target: 'scripts' | 'materials', section: 'persona' | 'scene' | 'sound' = 'persona') => {
    if (productionBusy) return;
    guardScriptLeave(() => {
      setAssetSection(target === 'scripts' ? 'script' : section);
      setStage('assets');
    });
  };
  const addOCRImages = (urls: string[]) => { studio.addOCRImages(urls); setEditorView('summary'); };
  const focusGallery = () => {
    setShowGallery(true);
    requestAnimationFrame(() => galleryRef.current?.focus());
  };
  const collapseGallery = () => {
    setShowGallery(false);
    requestAnimationFrame(() => expandGalleryRef.current?.focus());
  };
  const busy = studio.isCollecting || studio.isUploading || Boolean(studio.ocrProgress);
  const activeTaskLabel = studio.isCollecting
    ? '正在采集商品资料'
    : studio.isUploading
      ? '正在上传商品图片'
      : studio.ocrProgress
        ? `正在识别文字 (${studio.ocrProgress.completed}/${studio.ocrProgress.total})`
        : studio.isSummarizing
          ? '正在提炼卖点'
          : productionBusy
            ? '分镜合成任务运行中'
            : undefined;

  return (
    <div className="sales-studio flex h-full w-full min-w-0 flex-col overflow-hidden">
      <header className="sales-studio-topbar">
        <div className="sales-topbar-left">
          <h1><StudioBrandChip title="电商视频" icon={<ShoppingBag size={16} />} onBack={() => leaveStudio(onBack)} disabled={productionBusy} inline /></h1>
          <span className="sales-topbar-divider" aria-hidden />
          <SalesWorkspaceNavigation
            workspace={stage}
            disabled={navigationBusy}
            onChange={changeWorkspace}
            id={workspaceId}
            hasUnsavedAssets={scriptDraft.unsaved || prompts.hasUnsaved}
          />
        </div>

        <div className="sales-topbar-center" hidden={stage !== 'workflow'}>
          <SalesEditorNavigation view={editorView} onChange={changeEditorView} id={workspaceId} />
        </div>

        <div className="sales-topbar-right">
          <SalesWorkflowStatus saveStatus={studio.saveStatus} onRetry={studio.flushDraft} taskLabel={activeTaskLabel} />
          {stage === 'assets' && (
            <button
              type="button"
              disabled={navigationBusy}
              onClick={() => changeWorkspace('workflow')}
              className={salesGhostButtonClass}
            >
              <ArrowLeft size={13} aria-hidden />返回视频制作
            </button>
          )}
        </div>
      </header>

      {studio.error && (
        <div role="alert" className="sales-studio-alert flex shrink-0 items-start gap-3 bg-rose-50 px-4 py-2.5 text-xs leading-5 text-rose-700 dark:bg-rose-500/12 dark:text-rose-200">
          <p className="min-w-0 flex-1">{studio.error}</p>
          <button type="button" aria-label="关闭错误提示" onClick={studio.clearError} className={`rounded ${salesFocusClass}`}><X className="h-4 w-4" /></button>
        </div>
      )}

      <div
        className="sales-workspace-host"
        role="tabpanel"
        id={`${workspaceId}-panel`}
        aria-labelledby={`${workspaceId}-tab-${stage}`}
        tabIndex={0}
      >
        <div className="sales-editing-surface" hidden={stage !== 'workflow'}>
          <div className={`sales-editor-layout ${showGallery ? '' : 'is-gallery-collapsed'} ${galleryPane.dragging ? 'select-none' : ''}`}>
            {!showGallery && (
              <SalesProductSelectionSummary
                state={studio.state}
                galleryId={`${workspaceId}-gallery`}
                onExpand={focusGallery}
                expandButtonRef={expandGalleryRef}
                onImageDragging={(url) => { setDraggedImage(url); if (url) setEditorView('summary'); }}
              />
            )}
            <aside
              ref={galleryRef}
              id={`${workspaceId}-gallery`}
              hidden={!showGallery}
              tabIndex={-1}
              aria-label="商品图片选择区"
              style={galleryPane.style}
              className="sales-editor-gallery sales-workspace-layout"
            >
              <ProductSetupPanel
                state={studio.state}
                updateState={studio.updateState}
                isBusy={busy || productionBusy}
                onCollapse={collapseGallery}
                onConfirmSelection={studio.flushDraft}
                galleryId={`${workspaceId}-gallery`}
                isCollecting={studio.isCollecting}
                isUploading={studio.isUploading}
                selectionLocked={productionBusy}
                onCollect={studio.runProductCollect}
                onUpload={studio.addProductImages}
                onImageError={studio.markImageUnavailable}
                onRetryUnavailable={studio.retryUnavailableImages}
                onAddOCRImages={addOCRImages}
                onRecognizeImages={(urls) => { addOCRImages(urls); void studio.recognizeImages(undefined, false, false, urls); }}
                onImageDragging={(url) => { setDraggedImage(url); if (url) setEditorView('summary'); }}
                onResetProduct={() => { void studio.resetProduct(); }}
              />
            </aside>
            <WorkbenchResizeHandle {...galleryPane.handleProps} hidden={!showGallery} />
            <main className="sales-editor-main flex-1" aria-label="视频内容编辑区">
              <div id={`${workspaceId}-editor-panel`} role="tabpanel" aria-labelledby={`${workspaceId}-editor-${editorView}`} className="sales-editor-content">
                <div className="sales-editor-copy" hidden={editorView !== 'summary'}>
                  <SalesOCRWorkspace
                    state={studio.state}
                    disabled={busy || productionBusy}
                    onChange={studio.updateState}
                    onRecognize={(url, force) => { void studio.recognizeImages(url, force); }}
                    progress={studio.ocrProgress}
                    report={studio.ocrReport}
                    onRetryFailed={() => { void studio.retryFailedImages(); }}
                    onCancel={studio.cancelOCR}
                    imageDragging={Boolean(draggedImage)}
                    onAddOCRImages={addOCRImages}
                    onUploadOCRImages={(files) => studio.addProductImages(files, true)}
                    onDropFinished={() => setDraggedImage(null)}
                    summaryActions={{
                      pending: studio.isSummarizing,
                      error: studio.summaryError,
                      onRun: (model) => { void studio.summarize(model); },
                      onCancel: () => studio.cancelSummary(),
                      onScrollToProduction: () => changeEditorView('storyboard'),
                    }}
                  />
                </div>
                <SalesProductionWorkspace
                  active={stage === 'workflow'}
                  refreshVersion={libraryVersion}
                  onBusyChange={setProductionBusy}
                  view={editorView}
                  onViewChange={changeEditorView}
                  sourceBusy={busy || studio.isSummarizing}
                  state={studio.state}
                  onChange={studio.updateState}
                  onOpenStage={openAssetLibrary}
                />
              </div>
            </main>
          </div>
        </div>

        {stage === 'assets' && (
          <SalesMaterialWorkspace
            section={assetSection}
            onSectionChange={changeAssetSection}
            navigationDisabled={navigationBusy}
            promptContent={<SalesPromptWorkspace manager={prompts} />}
            promptsUnsaved={prompts.hasUnsaved}
          >
            <SalesScriptWorkspace state={studio.state} onChange={studio.updateState} onDraftStateChange={onScriptDraftChange} />
          </SalesMaterialWorkspace>
        )}
      </div>
    </div>
  );
}
