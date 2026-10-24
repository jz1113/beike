import { useState } from 'react';
import MarkdownCodeBlock from '@client/shared/ui/markdown/MarkdownCodeBlock';
import type { GenerationPromptSource } from './generationBatchSources';
import { dispatchGenerationBatch } from './dispatchGenerationBatch';
import { readGenerationBatchReceipts } from './generationBatchReceipts';

export default function GenerationPromptCodeBlock({ code, lang, incomplete, source, disabled }: {
  code: string; lang: string; incomplete: boolean; source: GenerationPromptSource; disabled: boolean;
}) {
  const [message, setMessage] = useState('');
  const entries = source.entries.filter((entry) => entry.prompt === code.trim());
  const entry = entries.length === 1 ? entries[0] : undefined;
  let alreadySubmitted = Boolean(source.legacySessionId);
  if (entry && !alreadySubmitted) {
    try {
      alreadySubmitted = readGenerationBatchReceipts(source.sourceId).some((receipt) => receipt.entryIds.includes(entry.id));
    } catch { /* Receipt errors are surfaced on click. */ }
  }
  return (
    <div>
      <MarkdownCodeBlock
        code={code}
        lang={lang}
        incomplete={incomplete}
        action={entry && !incomplete ? (
          <button
            type="button"
            disabled={disabled || alreadySubmitted}
            className="mr-1 cursor-pointer rounded-lg border border-slate-300 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
            onClick={() => {
              try {
                dispatchGenerationBatch({ sourceId: source.sourceId, entryIds: [entry.id], kind: source.kind, sessionId: source.sessionId });
                setMessage('已提交生成，可在本组清单查看进度；重复点击不会再次生成。');
              } catch (error) {
                setMessage(error instanceof Error ? error.message : '提交失败');
              }
            }}
          >
            {alreadySubmitted ? '已提交生成' : '生成此项'}
          </button>
        ) : undefined}
      />
      {message && <p className="text-xs text-slate-500" role="status">{message}</p>}
    </div>
  );
}
