import { useRef, useState } from 'react';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import type { BatchProductItem } from '../../model/batchTypes';
import { readWorkshopTable } from '../../model/collection/readWorkshopTable';
import { workshopTableAdditionCount, MAX_PRODUCT_CONTENTS, type WorkshopImportRow } from '../../model/collection/workshopTableImport';

interface Props {
  items: BatchProductItem[];
  disabled: boolean;
  onImport: (rows: WorkshopImportRow[]) => void;
}

const PAGE_SIZE = 8;

export function WorkshopTableImport({ items, disabled, onImport }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof readWorkshopTable>>>();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [feedback, setFeedback] = useState('');
  const busy = disabled || reading;

  const load = async (nextFile: File, sheet?: string) => {
    if (busy) return;
    setReading(true); setFeedback('');
    try {
      const next = await readWorkshopTable(nextFile, sheet);
      setFile(nextFile); setResult(next); setQuery(''); setPage(0);
      setCounts(Object.fromEntries(next.rows.map(row => [row.key, row.count])));
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : '读取失败'); }
    finally { setReading(false); }
  };
  const selected = (result?.rows ?? []).filter(row => Object.hasOwn(counts, row.key)).map(row => ({ ...row, count: counts[row.key] }));
  const filtered = (result?.rows ?? []).filter(row => `${row.title} ${row.source} ${row.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const confirm = () => {
    try {
      const added = workshopTableAdditionCount(selected, items);
      onImport(selected);
      setResult(undefined);
      setFeedback(added ? `本批已加入 ${added} 条图文，请采集商品图片。` : '所选图文已在本批中。');
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : '加入批次失败'); }
  };

  return <section className="workshop-table-import" aria-label="表格导入商品" aria-busy={reading}>
    <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden aria-label="选择商品任务表" disabled={busy}
      onChange={event => { const next = event.target.files?.[0]; event.target.value = ''; if (next) void load(next); }} />
    {!result ? <>
      <button type="button" className="workshop-drop-target" disabled={busy} onClick={() => input.current?.click()}
        onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const next = event.dataTransfer.files[0]; if (next) void load(next); }}>
        <UploadCloud size={24} /><strong>{reading ? '正在读取…' : '选择或拖入商品任务表'}</strong><small>XLSX、XLS 或 CSV</small>
      </button>
      <details><summary>表头与数量说明</summary><p>表头需含「商品ID」或「商品链接」，以及「需要数量」。填 3 表示制作 3 条独立图文。商品 ID 请使用文本格式。</p></details>
    </> : <fieldset disabled={busy} className="space-y-2 min-w-0">
      <div className="flex min-w-0 items-center gap-2"><FileSpreadsheet size={15} /><strong className="min-w-0 flex-1 truncate">{file?.name}</strong>
        <button type="button" className="underline" onClick={() => input.current?.click()}>换表</button></div>
      <label>工作表<select value={result.sheetName} onChange={event => { if (file) void load(file, event.target.value); }}>
        {result.sheetNames.map(name => <option key={name}>{name}</option>)}</select></label>
      <input type="search" value={query} aria-label="筛选表格商品" placeholder="查找商品、链接或类目" onChange={event => { setQuery(event.target.value); setPage(0); }} />
      <div>{filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(row => {
        const checked = Object.hasOwn(counts, row.key);
        return <div key={row.key} className="workshop-import-row">
          <label><input type="checkbox" checked={checked} onChange={() => setCounts(previous => {
            const next = { ...previous }; if (checked) delete next[row.key]; else next[row.key] = row.count; return next;
          })} /><span>{row.title || row.source}{row.countConflict && <small>原表第 {row.sourceRows.join('、')} 行数量不同，已取最大值</small>}</span></label>
          <input type="number" aria-label={`${row.title || row.source}的图文数量`} min={1} max={MAX_PRODUCT_CONTENTS}
            disabled={!checked} value={checked ? counts[row.key] || '' : row.count} onChange={event => {
              const value = Number(event.target.value); setCounts(previous => ({ ...previous, [row.key]: value }));
            }} />
        </div>;
      })}{!filtered.length && <p>没有匹配的有效商品。</p>}</div>
      {pages > 1 && <div className="flex justify-between"><button type="button" disabled={!page} onClick={() => setPage(page - 1)}>上一页</button><span>{page + 1}/{pages}</span><button type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>下一页</button></div>}
      {result.errors.length > 0 && <details><summary>{result.errors.length} 行需要修正</summary>{result.errors.map((message, index) => <p key={index}>{message}</p>)}</details>}
      <button type="button" className="workshop-confirm" disabled={!selected.length} onClick={confirm}>加入本批 · {selected.length} 款 / {selected.reduce((sum, row) => sum + row.count, 0)} 条图文</button>
    </fieldset>}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
