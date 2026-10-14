import React from 'react';
import { Copy, FileText, X } from 'lucide-react';
import { OFFICIAL_REVERSE_SYSTEM_PROMPT } from '../model/assetPromptConstants';

export interface AssetPromptSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

type PromptRow = {
  kind: 'section' | 'subsection' | 'numbered' | 'bullet' | 'text';
  text: string;
  number?: string;
  nested?: boolean;
  spaceBefore: boolean;
};

// Parse only for display. The copy action always uses the untouched source string.
const promptRows: PromptRow[] = (() => {
  const rows: PromptRow[] = [];
  let spaceBefore = false;

  for (const line of OFFICIAL_REVERSE_SYSTEM_PROMPT.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      spaceBefore = true;
      continue;
    }

    const section = /^## (.+)$/.exec(trimmed);
    const subsection = /^### (.+)$/.exec(trimmed);
    const numbered = /^(\d+)\.\s+(.+)$/.exec(trimmed);
    const bullet = /^(\s*)-\s+(.+)$/.exec(line);

    if (subsection) rows.push({ kind: 'subsection', text: subsection[1], spaceBefore });
    else if (section) rows.push({ kind: 'section', text: section[1], spaceBefore });
    else if (numbered) rows.push({ kind: 'numbered', text: numbered[2], number: numbered[1], spaceBefore });
    else if (bullet) rows.push({ kind: 'bullet', text: bullet[2], nested: bullet[1].length > 0, spaceBefore });
    else rows.push({ kind: 'text', text: trimmed, spaceBefore });

    spaceBefore = false;
  }

  return rows;
})();

function PromptContent() {
  return (
    <div className="select-text text-sm leading-7 text-slate-700">
      {promptRows.map((row, index) => {
        if (row.kind === 'section') {
          return <h3 key={index} className="mt-7 border-t border-slate-200/80 pt-6 text-base font-bold tracking-tight text-slate-950">{row.text}</h3>;
        }
        if (row.kind === 'subsection') {
          return <h4 key={index} className="mt-5 text-sm font-bold text-slate-900">{row.text}</h4>;
        }
        if (row.kind === 'numbered') {
          return (
            <div key={index} className={`flex gap-2.5 ${row.spaceBefore ? 'mt-4' : 'mt-1'}`}>
              <span className="w-5 shrink-0 text-right font-semibold text-indigo-600">{row.number}.</span>
              <p className="min-w-0 flex-1">{row.text}</p>
            </div>
          );
        }
        if (row.kind === 'bullet') {
          return (
            <div key={index} className={`flex gap-2.5 ${row.nested ? 'ml-8' : 'ml-2'} ${row.spaceBefore ? 'mt-4' : 'mt-1'}`}>
              <span className="w-2 shrink-0 font-semibold text-slate-400">•</span>
              <p className="min-w-0 flex-1">{row.text}</p>
            </div>
          );
        }
        return <p key={index} className={row.spaceBefore ? 'mt-4' : 'mt-1'}>{row.text}</p>;
      })}
    </div>
  );
}

export const AssetPromptSpecModal: React.FC<AssetPromptSpecModalProps> = ({ isOpen, onClose, showToast }) => {
  if (!isOpen) return null;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(OFFICIAL_REVERSE_SYSTEM_PROMPT);
      showToast('已复制反推提示词规范');
    } catch {
      showToast('复制失败，请手动选择文本复制');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/20 p-3 backdrop-blur-[2px] animate-in fade-in duration-150 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="asset-prompt-spec-title" className="flex max-h-[92vh] w-full max-w-[860px] flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)]" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileText className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h2 id="asset-prompt-spec-title" className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">多模态视觉大反推提示词工程规范</h2>
              <p className="mt-0.5 text-xs text-slate-500">System Prompt · 完整反推规则</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭反推提示词规范" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="mx-auto max-w-[760px]">
            <p className="mb-6 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">导入参考图集后，系统会依据以下规则逐图反推提示词，并提取可复用的人物、场景、穿搭和动作资产。</p>
            <PromptContent />
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3 sm:px-7">
          <button type="button" onClick={() => { void copyPrompt(); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 sm:text-sm"><Copy className="h-3.5 w-3.5" />复制反推提示词</button>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 sm:text-sm">确定</button>
        </footer>
      </section>
    </div>
  );
};

export default AssetPromptSpecModal;
