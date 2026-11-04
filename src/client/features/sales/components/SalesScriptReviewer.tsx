import { useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, Check, Loader2, Save, SlidersHorizontal, X } from 'lucide-react';
import { detectExclusionLeaks, isSalesProductImageView, validateScriptTemplate, type SalesScriptDomain } from '@shared/domain/sales';
import type { StoredSalesScript } from '../api/salesScripts';
import type { ScriptTaxonomyItem, ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';
import type { SalesScriptDraft } from '../hooks/useSalesScripts';
import { formatScriptSeconds, replaceExclusionLeak, updateBeat } from '../model/salesScriptEditor';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import { SalesScriptOverviewPane } from './SalesScriptOverviewPane';
import { buildScriptStoryboard, exportScriptRecords, exportScriptStoryboard, storyboardStyle } from '../model/salesScriptStoryboard';
import { SalesScriptCopyButton } from './SalesScriptCopyButton';
import { SalesStoryboardTable } from './SalesStoryboardTable';
import { SalesScriptSegment } from './SalesScriptSegment';

interface Props {
  draft: SalesScriptDraft;
  linkedVideo?: ReactNode;
  taxonomyItems: readonly ScriptTaxonomyItem[];
  taxonomyLoading: boolean;
  onManageTaxonomy: (kind: ScriptTaxonomyKind) => void;
  onCreateTaxonomy?: (kind: ScriptTaxonomyKind, name: string) => Promise<ScriptTaxonomyItem | null>;
  hasUnsaved?: boolean;
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

export function SalesScriptReviewer({ draft, hasUnsaved, linkedVideo, saving, onChange, onBack, onSaveDraft, onConfirm, taxonomyItems, taxonomyLoading, onManageTaxonomy, onCreateTaxonomy }: Props) {
  const { script } = draft;
  const [editing, setEditing] = useState(false);
  const shots = useMemo(() => buildScriptStoryboard(script), [script]);
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
        <button type="button" disabled={saving} onClick={onBack} className={salesGhostButtonClass}><ArrowLeft size={14} aria-hidden />动作素材</button>
        <div className="sales-reviewer-title-meta">
          <strong title={script.title}>{script.title}</strong>
          <span className={`sales-script-status is-${draft.status}`}>{draft.status === 'verified' ? '已确认模板' : '草稿待核对'}</span>
          <span className="sales-reviewer-cache-tag">{formatScriptSeconds(script.durationSec)} · {script.visualSpec.aspectRatio} · {script.audioAvailable ? '含音轨' : '无音轨'}{script.sampleTimesSec?.length ? ` · 仅分析 ${script.sampleTimesSec.length} 帧画面` : ''}</span>
          {draft.depthVideoUrl && <span className="sales-reviewer-cache-tag">脚本 + 深度视频</span>}
          {draft.cached && <span className="sales-reviewer-cache-tag">复用已缓存拆解</span>}
        </div>
        <div className="sales-reviewer-top-actions">
          <button type="button" aria-pressed={editing} onClick={() => setEditing(!editing)} className={salesGhostButtonClass}>
            <SlidersHorizontal size={13} aria-hidden />{editing ? '返回阅读' : '编辑脚本'}
          </button>
          <SalesScriptCopyButton text={exportScriptStoryboard(script, shots)} label="复制分镜表" />
          {(draft.status !== 'verified' || editing || hasUnsaved) && <>
          <button type="button" disabled={saving || issues.length > 0} onClick={() => { void onSaveDraft(); }} className={salesGhostButtonClass}>
            {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Save size={13} aria-hidden />}保存草稿
          </button>
          <button type="button" disabled={saving || !readyToConfirm} onClick={onConfirm} className={`sales-collect-primary ${salesFocusClass}`}>
            <Check size={14} aria-hidden />{draft.status === 'verified' ? '保存修改' : '确认入库'}
          </button>
          </>}
        </div>
      </div>

      <div className="sales-storyboard-shell">
        <aside className="sales-storyboard-video" aria-label="深度视频预览">
          {linkedVideo ?? <p className="sales-card-hint">尚未关联深度动作视频</p>}
        </aside>
        <div className="sales-storyboard-document" aria-label="脚本分镜正文" tabIndex={0}>
          {editing && <section className="sales-storyboard-settings">
            <h2>脚本设定</h2>
            <SalesScriptCopyButton text={exportScriptRecords(script, shots)} label="复制完整原始资料" />
            <SalesScriptOverviewPane script={script} onChange={applyChange} taxonomyItems={taxonomyItems} taxonomyLoading={taxonomyLoading} onManageTaxonomy={onManageTaxonomy} onCreateTaxonomy={onCreateTaxonomy} />
          </section>}
          <header className="sales-storyboard-intro">
            <h2>视频总体风格</h2>
            <p>{storyboardStyle(script)}</p>
          </header>
          <div className="sales-storyboard-segments">
            <h2>{editing ? '分镜明细' : '分镜表'}</h2>
            {!editing && <>
              <SalesStoryboardTable rows={shots}/>
            </>}
            {editing && shots.map((shot) => <section key={shot.index} id={`sales-script-segment-${shot.index}`}
              className="sales-storyboard-segment" tabIndex={-1} aria-labelledby={`sales-script-shot-title-${shot.index}`}>
              <header className="sales-storyboard-segment-heading">
                <h3 id={`sales-script-shot-title-${shot.index}`}>{shot.title}（{shot.range}）</h3>
                {shot.estimated && <small>时间估计</small>}
              </header>
              <dl className="sales-storyboard-analysis">
                {shot.fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.text}</dd></div>)}
              </dl>
              {editing && <details className="sales-shot-records">
                <summary>动作段、台词与原始资料（{shot.segments.length} 段）</summary>
                {shot.segments.map((segment) => {
                  const { address } = segment;
                  const beatLeaks = leaks.filter((item) => item.label === `镜头 ${address.shot + 1}-${address.beat + 1} 动作模板`).map((item) => item.term);
                  return (
                    <SalesScriptSegment
                      key={`${address.shot}-${address.beat}`}
                      segment={segment}
                      leakedTerms={beatLeaks}
                      disabled={saving}
                      onChangeBeat={(patch) => applyChange(updateBeat(script, address, patch))}
                      onFixLeak={(term) => applyChange(replaceExclusionLeak(script, term))}
                    />
                  );
                })}
              </details>}
            </section>)}
          </div>
          {editing && script.review.length > 0 && (
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

          {!readyToConfirm && <div className="sales-reviewer-validation" role="status">
            <span className="is-err">
              <AlertCircle size={14} aria-hidden />
              {issues[0] || `检测到 ${leaks.length} 处原片专属词残留（${leaks.map((l) => `${l.label}：「${l.term}」`).join('；')}）`}
              {leaks.length > 0 && <button type="button" onClick={() => {
                let next = script;
                for (const item of leaks) next = replaceExclusionLeak(next, item.term);
                applyChange(next);
              }} className={salesFocusClass}><X size={11} aria-hidden />一键全部替换为 {'{{商品}}'}</button>}
            </span>
          </div>}
        </div>
      </div>
    </section>
  );
}
