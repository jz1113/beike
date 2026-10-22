import { useState } from 'react';
import type { PetImportItem } from '@shared/contracts/pets';
import { parsePetCommands } from '@shared/domain/pets/commands';
import { importPetCommands } from '@client/shared/pets/petClient';

export function PetImportForm({ onImported }: { onImported: () => void }) {
  const [commands, setCommands] = useState('npx codex-pets add q-ban-da-fei-yu');
  const [results, setResults] = useState<PetImportItem[]>([]);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const parsed = parsePetCommands(commands);
  const submit = async () => {
    setImporting(true);
    setError('');
    try {
      const next = await importPetCommands(commands);
      setResults(next);
      if (next.some((item) => item.ok)) onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };
  return (
    <section className="space-y-3">
      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">每行一条 `npx codex-pets add 宠物标识`。命令只用来识别宠物，不会在本机执行。</p>
      <textarea value={commands} onChange={(event) => setCommands(event.target.value)} rows={4} aria-label="桌宠导入命令" spellCheck={false} className="w-full rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#151518] dark:text-slate-100" />
      <div className="flex items-center gap-3">
        <button type="button" disabled={importing || parsed.length === 0} onClick={() => void submit()} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">{importing ? '导入中' : '导入'}</button>
        <span className="text-xs text-slate-500">{parsed.filter((item) => item.id).length} 条可导入{parsed.some((item) => item.error) ? `，${parsed.filter((item) => item.error).length} 条无法识别` : ''}</span>
      </div>
      {error && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{error}</p>}
      {results.length > 0 && (
        <ul className="space-y-1 text-xs">
          {results.map((item) => <li key={`${item.input}-${item.id || item.error}`} className={item.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{item.ok ? `已导入 ${item.pet?.displayName || item.id}` : `${item.input}：${item.error}`}</li>)}
        </ul>
      )}
    </section>
  );
}
