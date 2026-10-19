import { useLayoutEffect, useRef, type ChangeEvent, type DragEvent, type RefObject } from 'react';
import { ArrowUp, FileSpreadsheet, FileText, Square, UploadCloud } from 'lucide-react';

interface Props {
  fileInputRef: RefObject<HTMLInputElement | null>;
  importMode: 'file' | 'paste';
  isDraggingFile: boolean;
  pasteText: string;
  isRunning: boolean;
  isBusy: boolean;
  onImportMode: (mode: 'file' | 'paste') => void;
  onImportFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onPasteText: (value: string) => void;
  onPrimaryAction: () => void;
  onStop: () => void;
}

export function PosterImportPanel({
  fileInputRef, importMode, isDraggingFile, pasteText, isRunning, isBusy,
  onImportMode, onImportFile, onDragOver, onDragLeave, onDrop, onPasteText, onPrimaryAction, onStop,
}: Props) {
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const input = pasteInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 80), 288)}px`;
  }, [pasteText, importMode]);

  return (
    <section className="mx-auto w-full max-w-[980px] text-center">
      <h1 className="text-3xl font-black tracking-[-0.045em] text-slate-950 dark:text-white sm:text-[40px]">一键批量制作封面</h1>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">可粘贴表格，或直接上传图片。图片文件名会作为原标题，默认文字竖。封面技能按每张的构图、字体、字色、背景和主体一次生成。</p>

      {/* 导入模式切换 */}
      <div className="mt-6 inline-flex max-w-full rounded-full bg-slate-100 dark:bg-white/10 p-1 shadow-inner">
        <button type="button" onClick={() => onImportMode('paste')} disabled={isBusy} className={`inline-flex min-w-0 w-1/2 sm:min-w-[164px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-50 ${importMode === 'paste' ? 'bg-black dark:bg-white text-white dark:text-slate-950 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/10 hover:text-slate-950 dark:hover:text-white'}`}><FileText className="h-4 w-4" />粘贴表格</button>
        <button type="button" onClick={() => onImportMode('file')} disabled={isBusy} className={`inline-flex min-w-0 w-1/2 sm:min-w-[164px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-50 ${importMode === 'file' ? 'bg-black dark:bg-white text-white dark:text-slate-950 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/10 hover:text-slate-950 dark:hover:text-white'}`}><FileSpreadsheet className="h-4 w-4" />导入文件</button>
      </div>

      <section className={importMode === 'file' ? 'mt-8' : 'mt-8 min-h-[300px] overflow-hidden rounded-[32px] border-2 border-dashed border-slate-300 dark:border-white/10 bg-white/80 dark:bg-[#1B1B1E]/80 text-left transition hover:border-indigo-300 dark:hover:border-indigo-400/50 hover:bg-white dark:hover:bg-[#1B1B1E]'}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,image/jpeg,image/png,image/webp,image/gif" multiple disabled={isBusy} className="hidden" onChange={onImportFile} />
        {importMode === 'file' ? (
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isBusy} onDragOver={(event) => { event.preventDefault(); if (!isBusy) onDragOver(event); }} onDragLeave={onDragLeave} onDrop={(event) => { event.preventDefault(); if (!isBusy) onDrop(event); else onDragLeave(); }} className={`group flex min-h-[300px] w-full flex-col items-center justify-center rounded-[32px] border-2 border-dashed px-8 text-center shadow-[0_28px_80px_-50px_rgba(15,23,42,.45)] transition disabled:cursor-not-allowed disabled:opacity-50 ${isDraggingFile ? 'border-indigo-500 bg-indigo-50/90 dark:bg-indigo-950/40' : 'border-slate-300 dark:border-white/10 bg-white/80 dark:bg-[#1B1B1E]/80 hover:border-indigo-400 dark:hover:border-indigo-400/60 hover:bg-white dark:hover:bg-[#1B1B1E]'}`}>
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 dark:bg-white/10 text-white shadow-lg transition group-hover:-translate-y-1 group-hover:bg-indigo-600">
              <UploadCloud className="h-7 w-7" />
            </span>
            <span className="mt-5 text-lg font-black text-slate-900 dark:text-white">点击或拖拽上传表格或图片</span>
            <span className="mt-2 text-sm text-slate-400 dark:text-slate-500">表格支持 .xlsx、.xls、.csv。图片用文件名作为原标题，默认文字竖 720×960</span>
          </button>
        ) : (
          <div className="min-h-[296px] px-8 py-6 sm:px-9 sm:py-8">
            <div className="relative min-h-[232px]">
              <textarea ref={pasteInputRef} value={pasteText} disabled={isBusy} onChange={(event) => onPasteText(event.target.value)} rows={1} wrap="off" spellCheck={false} aria-label="粘贴图片链接、原标题、文字方向和可选商品名称" placeholder={'从 Excel 复制四列内容到这里（第四列可留空）：\n封面链接\t原标题\t文字方向\t商品名称/型号\nhttps://...\t洗衣效果很到位\t文字竖\t小米洗衣机 V10\nhttps://...\t轻盈贴合出行听得舒心\t文字横\tREDMI K100 Pro'} className="min-h-[220px] w-full max-h-72 resize-none overflow-auto whitespace-pre border-0 bg-transparent p-0 pr-24 text-sm leading-[1.8] text-slate-700 dark:text-slate-200 outline-none [scrollbar-width:none] placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-0 [&::-webkit-scrollbar]:hidden" />
              <div className="absolute bottom-0 right-0">
              {isRunning ? (
                <button type="button" onClick={onStop} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 dark:bg-white px-4 py-2.5 text-sm font-bold text-white dark:text-slate-950 shadow-sm transition-colors hover:bg-black dark:hover:bg-slate-200"><Square className="h-3.5 w-3.5 fill-current" />停止生成</button>
              ) : (
                <button type="button" onClick={onPrimaryAction} disabled={isBusy || !pasteText.trim()} aria-label="解析并加入生产清单" title="解析并加入生产清单" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 dark:bg-white text-white dark:text-slate-950 shadow-sm hover:bg-black dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-white/10 disabled:text-slate-400 dark:disabled:text-slate-600"><ArrowUp className="h-4 w-4" strokeWidth={2.25} /></button>
              )}
              </div>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
