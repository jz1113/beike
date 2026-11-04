import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { SalesSummaryResult } from '@shared/contracts/salesSummary';
import { salesSummarySourceLabel, salesSummaryText } from '../model/salesSummary';
import type { SalesOCRProps } from './salesOCRTypes';
import { salesFocusClass } from './salesChrome';

type Props = Pick<SalesOCRProps, 'state' | 'disabled' | 'onChange'>;

export function SalesSellingPoints({ state, disabled, onChange }: Props) {
  const saved = state.productSummary;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [copyStatus, setCopyStatus] = useState<{ text: string; ok: boolean } | null>(null);
  if (!saved) return null;
  const { result } = saved;
  const recommendation = saved.editedCopy ?? result.copy;
  const copyText = salesSummaryText({ ...result, copy: recommendation });
  const updateResult = (patch: Partial<SalesSummaryResult>) => onChange({ productSummary: { ...saved, result: { ...result, ...patch } } });
  const updatePoint = (index: number, patch: Partial<SalesSummaryResult['points'][number]>) => updateResult({ points: result.points.map((point, i) => i === index ? { ...point, ...patch } : point) });
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopyStatus({ text, ok: true }); }
    catch { setCopyStatus({ text, ok: false }); textarea.current?.focus(); textarea.current?.select(); }
  };
  const renderSource = (id: string) => {
    const image = state.imageCatalog.find((item) => item.index === Number(id.split('-')[1]) - 1);
    const label = salesSummarySourceLabel(id);
    return image ? <a key={id} href={proxyMediaUrl(image.url)} target="_blank" rel="noreferrer" className={salesFocusClass}>{label}</a> : <span key={id}>{label}</span>;
  };

  return (
    <section className="sales-selling" aria-label="最终卖点编辑">
      <div className="sales-document-toolbar">
        <span>可直接编辑，进入分镜时使用最新内容。</span>
        <button type="button" className={`sales-summary-copy ${salesFocusClass}`} onClick={() => { void copy(copyText); }}>
          {copyStatus?.text === copyText && copyStatus.ok ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          {copyStatus?.text === copyText && copyStatus.ok ? '已复制' : '复制全部'}
        </button>
      </div>
      <div className="sales-selling-body">
        <div className="sales-selling-overview">
          <label htmlFor="sales-summary-overview">一句话概括</label>
          <textarea id="sales-summary-overview" aria-label="最终卖点概括" value={result.summary} maxLength={1000} rows={2} disabled={disabled} onChange={(event) => updateResult({ summary: event.target.value })} />
        </div>
        {result.points.length > 0 && (
          <ol className="sales-selling-points">
            {result.points.map((point, index) => (
              <li key={index}>
                <div className="sales-selling-point-title" id={`sales-buying-point-${index + 1}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <input aria-label={`卖点 ${index + 1} 标题`} value={point.benefit} maxLength={1000} disabled={disabled} onChange={(event) => updatePoint(index, { benefit: event.target.value })} />
                </div>
                <div className="sales-selling-point-field"><label htmlFor={`sales-point-feature-${index}`}>依据</label><textarea id={`sales-point-feature-${index}`} aria-label={`卖点 ${index + 1} 依据`} value={point.feature} maxLength={1000} rows={2} disabled={disabled} onChange={(event) => updatePoint(index, { feature: event.target.value })} /></div>
                <div className="sales-selling-point-field"><label htmlFor={`sales-point-expression-${index}`}>表达</label><textarea id={`sales-point-expression-${index}`} aria-label={`卖点 ${index + 1} 表达`} value={point.expression} maxLength={1000} rows={2} disabled={disabled} onChange={(event) => updatePoint(index, { expression: event.target.value })} /></div>
                <div className="sales-selling-sources"><span>来源</span>{[...new Set(point.sources)].map(renderSource)}</div>
              </li>
            ))}
          </ol>
        )}
        <div className="sales-selling-copy">
          <div className="sales-selling-copy-heading"><label htmlFor="sales-recommendation-copy">推荐文案</label><button type="button" disabled={!recommendation} className={salesFocusClass} onClick={() => { void copy(recommendation); }}><Copy size={12} aria-hidden />复制文案</button></div>
          <textarea ref={textarea} id="sales-recommendation-copy" aria-label="完整推荐文案" value={recommendation} maxLength={4000} rows={8} disabled={disabled} onChange={(event) => onChange({ productSummary: { ...saved, editedCopy: event.target.value } })} />
        </div>
        {(result.cautions?.length ?? 0) > 0 && <div className="sales-selling-questions"><h4>使用与养护</h4><ul>{result.cautions?.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        {result.conflicts.length > 0 && <div className="sales-selling-questions"><h4>资料冲突 · 待核对</h4><ul>{result.conflicts.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        {result.questions.length > 0 && <div className="sales-selling-questions"><h4>待确认信息</h4><ul>{result.questions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      </div>
      {copyStatus && !copyStatus.ok && <p className="sales-copy-error" role="status">复制失败，请选中文字后手动复制。</p>}
    </section>
  );
}
