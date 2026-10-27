import { useState } from 'react';
import { Check, Copy, Pencil } from 'lucide-react';
import type { SalesActualReference } from '@shared/domain/sales';
import { salesPromptSections, salesPromptParagraphs } from '../model/salesPromptStructure';
import { SalesPromptReferences } from './SalesPromptReferences';
import { salesGhostButtonClass, salesInputClass } from './salesChrome';

/** Reading structure is derived from the original text; editing and copying use it verbatim. */
export function SalesPromptEditor({ prompt, references, disabled, onChange }: {
  prompt: string; references: SalesActualReference[]; disabled: boolean; onChange: (prompt: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopyStatus('已复制'); }
    catch { setCopyStatus('复制失败，请选中文本手动复制或重试'); }
  };
  return <div className="sales-prompt-editor">
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200/70 pb-3 dark:border-white/10">
      <h3 className="mr-auto text-sm font-semibold">最终完整视频提示词</h3>
      <button type="button" disabled={!editing && disabled} onClick={() => setEditing((value) => !value)} className={`h-8 disabled:opacity-40 ${salesGhostButtonClass}`}>{editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}{editing ? '完成' : '编辑'}</button>
      <button type="button" onClick={() => { void copy(); }} className={`h-8 ${salesGhostButtonClass}`}><Copy className="h-3.5 w-3.5" />{copyStatus === '已复制' ? '已复制' : '复制'}</button>
      <span role="status" className={copyStatus && copyStatus !== '已复制' ? 'w-full text-xs text-rose-500' : 'sr-only'}>{copyStatus}</span>
    </header>
    <div className="sales-prompt-content">
      {editing ? <textarea aria-label="最终完整视频提示词" value={prompt} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${salesInputClass} sales-full-prompt-input mt-0 text-sm leading-7`} />
        : <SalesStructuredPrompt prompt={prompt} references={references} />}
    </div>
  </div>;
}

export function SalesStructuredPrompt({ prompt, references }: { prompt: string; references: SalesActualReference[] }) {
  const sections = salesPromptSections(prompt);
  return <div className="sales-structured-prompt">
    {sections.map((section, index) => {
      return <section key={index} className="sales-prompt-segment">
        <h4 className="sales-prompt-heading"><span className="sales-prompt-section-number" aria-hidden>{String(index + 1).padStart(2, '0')}</span>{section.title}</h4>
        <div className="sales-prompt-paragraphs">{salesPromptParagraphs(section.body).map((paragraph, paragraphIndex) => <p key={paragraphIndex}><SalesPromptReferences prompt={paragraph} references={references} /></p>)}</div>
      </section>;
    })}
  </div>;
}
