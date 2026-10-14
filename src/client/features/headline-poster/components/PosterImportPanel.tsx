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
      <h1 className="text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-[40px]">一键批量制作封面</h1>
      <p className="mt-3 text-sm text-slate-500">导入图片链接、原标题、文字方向；商品名称/型号可选。可在生产设置中选择 AI 优化标题或保留原标题，再一次设计并生成主体、场景与准确艺术字。</p>
      <div className="mt-6 inline-flex max-w-full rounded-full bg-slate-100 p-1 shadow-inner">
        <button type="button" onClick={() => onImportMode('paste')} disabled={isBusy} className={`inline-flex min-w-0 w-1/2 sm:min-w-[164px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-50 ${importMode === 'paste' ? 'bg-black text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}><FileText className="h-4 w-4" />粘贴表格</button>
        <button type="button" onClick={() => onImportMode('file')} disabled={isBusy} className={`inline-flex min-w-0 w-1/2 sm:min-w-[164px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-50 ${importMode === 'file' ? 'bg-black text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}><FileSpreadsheet className="h-4 w-4" />导入文件</button>
      </div>
      <section className={importMode === 'file' ? 'mt-8' : 'mt-8 min-h-[300px] overflow-hidden rounded-[32px] border-2 border-dashed border-slate-300 bg-white/80 text-left transition hover:border-rose-300 hover:bg-white'}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" disabled={isBusy} className="hidden" onChange={onImportFile} />
        {importMode === 'file' ? (
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isBusy} onDragOver={(event) => { event.preventDefault(); if (!isBusy) onDragOver(event); }} onDragLeave={onDragLeave} onDrop={(event) => { event.preventDefault(); if (!isBusy) onDrop(event); else onDragLeave(); }} className={`group flex min-h-[300px] w-full flex-col items-center justify-center rounded-[32px] border-2 border-dashed px-8 text-center shadow-[0_28px_80px_-50px_rgba(15,23,42,.45)] transition disabled:cursor-not-allowed disabled:opacity-50 ${isDraggingFile ? 'border-rose-500 bg-rose-50/90' : 'border-slate-300 bg-white/80 hover:border-rose-400 hover:bg-white'}`}>
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg transition group-hover:-translate-y-1 group-hover:bg-rose-600">
              <UploadCloud className="h-7 w-7" />
            </span>
            <span className="mt-5 text-lg font-black text-slate-900">点击或拖拽上传大字报表格</span>
            <span className="mt-2 text-sm text-slate-400">支持 .xlsx、.xls 和 .csv，自动识别图片链接、标题与文字方向</span>
          </button>
        ) : (
          <div className="min-h-[296px] px-8 py-6 sm:px-9 sm:py-8">
            <div className="relative min-h-[232px]">
              <textarea ref={pasteInputRef} value={pasteText} disabled={isBusy} onChange={(event) => onPasteText(event.target.value)} rows={1} wrap="off" spellCheck={false} aria-label="粘贴图片链接、原标题、文字方向和可选商品名称" placeholder={'从 Excel 复制四列内容到这里（第四列可留空）\n封面链接\t原标题\t文字方向\t商品名称/型号\nhttps://...\t洗衣效果很到位\t文字竖\t小米洗衣机 V10\nhttps://...\t轻盈贴合出行听得舒心\t文字横\tREDMI K100 Pro'} className="min-h-[220px] w-full max-h-72 resize-none overflow-auto whitespace-pre border-0 bg-transparent p-0 pr-24 text-sm leading-[1.8] text-slate-700 outline-none [scrollbar-width:none] placeholder:text-slate-400 focus:ring-0 [&::-webkit-scrollbar]:hidden" />
              <div className="absolute bottom-0 right-0">
              {isRunning ? (
                <button type="button" onClick={onStop} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-black"><Square className="h-3.5 w-3.5 fill-current" />停止生成</button>
              ) : (
                <button type="button" onClick={onPrimaryAction} disabled={isBusy || !pasteText.trim()} aria-label="解析并加入生产清单" title="解析并加入生产清单" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><ArrowUp className="h-4 w-4" strokeWidth={2.25} /></button>
              )}
              </div>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
