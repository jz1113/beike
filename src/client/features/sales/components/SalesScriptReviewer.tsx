import { useMemo, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronDown, Layers, ListVideo, Loader2, Save, SlidersHorizontal, X } from 'lucide-react';
import { useMediaQuery } from '@client/shared/hooks/useMediaQuery';
import { useResizablePane, WorkbenchResizeHandle } from '@client/shared/ui/studio/ResizableWorkbench';
import { detectExclusionLeaks, isSalesProductImageView, validateScriptTemplate, type SalesScriptDomain } from '@shared/domain/sales';
import type { StoredSalesScript } from '../api/salesScripts';
import type { ScriptTaxonomyItem, ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';
import type { SalesScriptDraft } from '../hooks/useSalesScripts';
import { formatScriptSeconds, replaceExclusionLeak, scriptBeatCount } from '../model/salesScriptEditor';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import { SalesScriptOverviewPane } from './SalesScriptOverviewPane';
import { buildScriptStoryboard, exportScriptStoryboard } from '../model/salesScriptStoryboard';
import { SalesScriptCopyButton } from './SalesScriptCopyButton';
import { SalesScriptSegment } from './SalesScriptSegment';
import { useSalesScriptOutline } from '../hooks/useSalesScriptOutline';

interface Props {
  draft: SalesScriptDraft;
  linkedVideo?: ReactNode;
  taxonomyItems: readonly ScriptTaxonomyItem[];
  taxonomyLoading: boolean;
  onManageTaxonomy: (kind: ScriptTaxonomyKind) => void;
  onCreateTaxonomy?: (kind: ScriptTaxonomyKind, name: string) => Promise<ScriptTaxonomyItem | null>;
  saving: boolean;
  onChange: (script: SalesScriptDomain) => void;
  onBack: () => void;
  onSaveDraft: () => void | Promise<StoredSalesScript | null>;
  onConfirm: () => void;
}

function syncProductViews(script: SalesScriptDomain): SalesScriptDomain {
  const beatViews = script.shots.flatMap((shot) => shot.beats.map((beat) => beat.requiredView)).filter(isSalesProductImageView);
  const productViews = [...new Set(beatViews)];
  return {
    ...script,
    assetSlots: { ...script.assetSlots, productViews },
    reusable: { ...script.reusable, requiredViews: productViews },
  };
}

export function SalesScriptReviewer({ draft, linkedVideo, saving, onChange, onBack, onSaveDraft, onConfirm, taxonomyItems, taxonomyLoading, onManageTaxonomy, onCreateTaxonomy }: Props) {
  const { script } = draft;
  const wideLayout = useMediaQuery('(min-width: 1024px)');
  const sidebar = useResizablePane({ storageKey: 'beike.sales.reviewer.sidebar', defaultWidth: 276, minWidth: 220, maxWidth: 400 });
  const totalBeats = scriptBeatCount(script);
  const segments = useMemo(() => buildScriptStoryboard(script), [script]);
  const outline = useSalesScriptOutline({ wideLayout, scriptKey: `${draft.id || 'draft'}:${segments.length}` });
  const issues = useMemo(() => validateScriptTemplate(script), [script]);
  const leaks = useMemo(() => detectExclusionLeaks(script), [script]);

  const applyChange = (next: SalesScriptDomain) => onChange(syncProductViews(next));

  const dismissReviewItem = (index: number) => {
    applyChange({ ...script, review: script.review.filter((_, i) => i !== index) });
  };

  const readyToConfirm = issues.length === 0 && leaks.length === 0;

  return (
    <section className="sales-script-reviewer" aria-label="脚本分镜阅读与确认">
      <div className="sales-reviewer-topbar">
        <button type="button" disabled={saving} onClick={onBack} className={salesGhostButtonClass}><ArrowLeft size={14} aria-hidden />返回脚本库</button>
        <div className="sales-reviewer-title-meta">
          <strong>{script.title}</strong>
          <span className={`sales-script-status is-${draft.status}`}>{draft.status === 'verified' ? '已确认模板' : '草稿待核对'}</span>
          <span className="sales-reviewer-cache-tag">{formatScriptSeconds(script.durationSec)} · {script.visualSpec.aspectRatio} · {script.audioAvailable ? '含音轨' : '无音轨'}</span>
          {draft.cached && <span className="sales-reviewer-cache-tag">复用已缓存拆解</span>}
        </div>
        <div className="sales-reviewer-top-actions">
          <SalesScriptCopyButton text={exportScriptStoryboard(script)} label="复制完整分镜" />
          <button type="button" disabled={saving || issues.length > 0} onClick={() => { void onSaveDraft(); }} className={salesGhostButtonClass}>
            {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Save size={13} aria-hidden />}保存草稿
          </button>
          <button type="button" disabled={saving || !readyToConfirm} onClick={onConfirm} className={`sales-collect-primary ${salesFocusClass}`}>
            <Check size={14} aria-hidden />确认入库
          </button>
        </div>
      </div>

      <div ref={outline.shellRef} className={`sales-storyboard-shell${sidebar.dragging ? ' select-none' : ''}`}>
        <aside style={sidebar.style} className="sales-storyboard-sidebar" aria-label="脚本导航与设定">
          <nav className="sales-storyboard-outline" aria-label="分镜目录">
            <div className="sales-storyboard-sidebar-heading"><ListVideo size={15} aria-hidden /><strong>分镜目录</strong><span>{segments.length} 段</span></div>
            <ol>{segments.map((segment) => <li key={segment.index}>
              <button type="button" className={salesFocusClass}
                aria-controls={`sales-script-segment-${segment.index}`}
                aria-current={outline.activeSegment === segment.index ? 'step' : undefined}
                onClick={() => outline.navigateToSegment(segment.index)}>
                <span className="sales-storyboard-outline-number">{String(segment.index).padStart(2, '0')}</span>
                <span><strong>{segment.title}</strong><small>{segment.range}</small></span>
              </button>
            </li>)}</ol>
          </nav>
          <details className="sales-storyboard-settings" open={wideLayout}>
            <summary className={salesFocusClass}><SlidersHorizontal size={15} aria-hidden /><strong>脚本设定</strong><ChevronDown size={14} aria-hidden /></summary>
            <SalesScriptOverviewPane script={script} onChange={applyChange} taxonomyItems={taxonomyItems} taxonomyLoading={taxonomyLoading} onManageTaxonomy={onManageTaxonomy} onCreateTaxonomy={onCreateTaxonomy} />
          </details>
        </aside>
        <WorkbenchResizeHandle {...sidebar.handleProps} hidden={!wideLayout} />
        <div ref={outline.documentRef} className="sales-storyboard-document" aria-label="脚本分镜正文" tabIndex={0}>
          <header className="sales-storyboard-intro">
            <span className="sales-eyebrow">脚本概览</span>
            <h2>{script.title}</h2>
            <div className="sales-storyboard-summary-tags"><span>{formatScriptSeconds(script.durationSec)}</span><span>{script.visualSpec.aspectRatio} 画幅</span><span>{segments.length} 个分镜段落</span><span>{script.visualSpec.oneTake ? '一镜到底' : '多镜头剪辑'}</span></div>
            {script.overview && <p>{script.overview}</p>}
            {script.visualSpec.oneTake && <p className="sales-storyboard-description">本视频为一镜到底，按动作、节奏与运镜变化拆解为 {segments.length} 个分镜段落，保持镜头连续。</p>}
            <p className="sales-storyboard-template-note">提示词中的 {'{{商品}}'} 等占位内容会在视频制作时，结合商品与素材替换。</p>
          </header>
          {linkedVideo && <details className="sales-storyboard-reference" onToggle={(event) => {
            if (!event.currentTarget.open) event.currentTarget.querySelectorAll<HTMLMediaElement>('video, audio').forEach((media) => media.pause());
          }}>
            <summary className={salesFocusClass}>
              <Layers size={15} aria-hidden /><strong>深度动作视频</strong>
              <span>{draft.depthVideoUrl ? '已关联' : draft.depthOperationId || draft.depthTaskId ? '深度结果待查询' : '未关联深度视频'}</span>
              <ChevronDown size={14} aria-hidden />
            </summary>
            {linkedVideo}
          </details>}
          {script.review.length > 0 && (
            <details className="sales-reviewer-checklist sales-storyboard-review-notes">
              <summary>待核对事项（{script.review.length} 项）</summary>
              <ul>
                {script.review.map((note, idx) => (
                  <li key={`${idx}-${note}`}>
                    <span>{note}</span>
                    <button type="button" aria-label={`已完成核对：${note}`} onClick={() => dismissReviewItem(idx)} className={salesFocusClass}><Check size={12} aria-hidden />已核对</button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="sales-storyboard-segments">
            {segments.map((segment) => {
              const { address } = segment;
              const beatLeaks = leaks.filter((item) => item.label === `镜头 ${address.shot + 1}-${address.beat + 1} 动作模板`).map((item) => item.term);
              return (
                <SalesScriptSegment
                  key={`${address.shot}-${address.beat}`}
                  segment={segment}
                  leakedTerms={beatLeaks}
                  onFixLeak={(term) => applyChange(replaceExclusionLeak(script, term))}
                />
              );
            })}
          </div>

          <footer className="sales-reviewer-footer">
            <div className="sales-reviewer-validation">
              {readyToConfirm ? (
                <span className="is-ok"><CheckCircle2 size={14} aria-hidden />时间轴连续且无原片专属词残留（共 {script.shots.length} 镜 / {totalBeats} 段），可确认入库</span>
              ) : (
                <span className="is-err">
                  <AlertCircle size={14} aria-hidden />
                  {issues[0] || `检测到 ${leaks.length} 处原片专属词残留（${leaks.map((l) => `${l.label}：「${l.term}」`).join('；')}）`}
                  {leaks.length > 0 && <button type="button" onClick={() => {
                    let next = script;
                    for (const item of leaks) next = replaceExclusionLeak(next, item.term);
                    applyChange(next);
                  }} className={salesFocusClass}><X size={11} aria-hidden />一键全部替换为 {'{{商品}}'}</button>}
                </span>
              )}
            </div>
            <div className="sales-reviewer-top-actions">
              <button type="button" disabled={saving || issues.length > 0} onClick={() => { void onSaveDraft(); }} className={salesGhostButtonClass}>保存草稿</button>
              <button type="button" disabled={saving || !readyToConfirm} onClick={onConfirm} className={`sales-collect-primary ${salesFocusClass}`}>确认入库</button>
            </div>
          </footer>
        </div>
      </div>
    </section>
  );
}
