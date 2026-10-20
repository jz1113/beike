import { useState } from 'react';
import MarkdownCodeBlock from '@client/shared/ui/markdown/MarkdownCodeBlock';
import type { GenerationPromptSource } from './generationBatchSources';
import { dispatchGenerationBatch } from './dispatchGenerationBatch';

export default function GenerationPromptCodeBlock({ code, lang, incomplete, source, disabled }: {
  code: string; lang: string; incomplete: boolean; source: GenerationPromptSource; disabled: boolean;
}) {
  const [message, setMessage] = useState('');
  const entries = source.entries.filter(entry => entry.prompt === code.trim());
  const entry = entries.length === 1 ? entries[0] : undefined;
  return <div>
    <MarkdownCodeBlock code={code} lang={lang} incomplete={incomplete} action={entry && !incomplete ? <button type="button" disabled={disabled} className="mr-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] disabled:opacity-40 dark:border-white/20" onClick={() => {
      try {
        dispatchGenerationBatch({ sourceId: source.sourceId, entryIds: [entry.id], kind: source.kind, sessionId: source.sessionId });
        setMessage('提交记录已保留，可在本组清单查看进度；重复点击不会再次生成。');
      } catch (error) { setMessage(error instanceof Error ? error.message : '提交失败'); }
    }}>生成此项</button> : undefined} />
    {message && <p className="text-xs text-slate-500" role="status">{message}</p>}
  </div>;
}
