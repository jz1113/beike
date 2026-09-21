import { useLayoutEffect, useRef, type ChangeEvent, type DragEvent, type RefObject } from 'react';
import { ArrowUp, FileSpreadsheet, FileText, Plus, Square } from 'lucide-react';

interface Props {
  fileInputRef: RefObject<HTMLInputElement | null>;
  importMode: 'file' | 'paste';
  isDraggingFile: boolean;
  pasteText: string;
  isRunning: boolean;
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
  fileInputRef, importMode, isDraggingFile, pasteText, isRunning,
  onImportMode, onImportFile, onDragOver, onDragLeave, onDrop,   onPasteText, onPrimaryAction, onStop,
}: Props) {
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const input = pasteInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 80), 288)}px`;
  }, [pasteText]);

  return (
    <section className="mx-auto w-full max-w-[980px] text-center">
      <h1 className="text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-[40px]">一键批量制作大字报封面</h1>
      <p className="mt-3 text-sm text-slate-500">导入图片链接、原标题、文字方向；商品名称/型号可选。可在生产设置中选择 AI 优化标题或保留原标题，再一次设计并生成主体、场景与准确艺术字。</p>
      <div className="mt-6 inline-flex rounded-full bg-slate-100 p-1 shadow-inner">
        <button type="button" onClick={() => onImportMode('file')} className={`inline-flex min-w-[164px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${importMode === 'file' ? 'bg-black text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}><FileSpreadsheet className="h-4 w-4" />导入文件</button>
        <button type="button" onClick={() => onImportMode('paste')} className={`inline-flex min-w-[164px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${importMode === 'paste' ? 'bg-black text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}><FileText className="h-4 w-4" />粘贴表格</button>
      </div>
      <section className="mt-8 overflow-hidden rounded-[24px] border border-slate-200 bg-white text-left shadow-[0_14px_32px_-24px_rgba(15,23,42,0.28)]">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImportFile} />
        {importMode === 'file' ? (
          <button type="button" onClick={() => fileInputRef.current?.click()} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={`group relative flex min-h-[172px] w-full flex-col items-center justify-center gap-3 overflow-hidden transition-colors ${isDraggingFile ? 'bg-rose-50 ring-2 ring-inset ring-rose-300' : 'bg-gradient-to-br from-slate-50 via-white to-slate-100/70 hover:from-slate-100 hover:to-white'}`}>
            <span className="inline-flex h-14 w-20 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_10px_20px_-12px_rgba(15,23,42,0.7)] transition-transform group-hover:scale-[1.03]">
              <Plus className="h-7 w-7" strokeWidth={1.8} />
            </span>
            <span className="text-sm font-bold text-slate-800">导入 Excel / CSV 文件</span>
            <span className="text-xs text-slate-400">拖入文件或点击上传</span>
          </button>
        ) : (
          <div className="px-8 py-5 sm:px-9 sm:py-6">
            <div className="relative">
              <textarea ref={pasteInputRef} value={pasteText} onChange={(event) => onPasteText(event.target.value)} rows={1} wrap="off" spellCheck={false} aria-label="粘贴图片链接、原标题、文字方向和可选商品名称" placeholder={'从 Excel 复制四列内容到这里（第四列可留空）\n封面链接\t原标题\t文字方向\t商品名称/型号\nhttps://...\t洗衣效果很到位\t文字竖\t小米洗衣机 V10\nhttps://...\t轻盈贴合出行听得舒心\t文字横\tREDMI K100 Pro'} className="min-h-20 w-full max-h-72 resize-none overflow-auto whitespace-pre border-0 bg-transparent p-0 pr-24 text-sm leading-[1.8] text-slate-700 outline-none [scrollbar-width:none] placeholder:text-slate-400 focus:ring-0 [&::-webkit-scrollbar]:hidden" />
              <div className="absolute bottom-0 right-0">
              {isRunning ? (
                <button type="button" onClick={onStop} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-black"><Square className="h-3.5 w-3.5 fill-current" />停止生成</button>
              ) : (
                <button type="button" onClick={onPrimaryAction} disabled={!pasteText.trim()} aria-label="解析并加入生产清单" title="解析并加入生产清单" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><ArrowUp className="h-4 w-4" strokeWidth={2.25} /></button>
              )}
              </div>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
