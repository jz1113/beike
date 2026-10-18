import { toEditableSlide } from '../model/pptLayouts';
import { exportEditablePptx } from '../model/pptEditableExport';
import { usePptStore } from '../store/usePptStore';

export function PptLayoutStage() {
  const { pages, title, isGeneratingSlides, slideProgressText, error, generateAllSlides, generateSingleSlide } = usePptStore();
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 pb-10 pt-16">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">{title}</h2>
          <p className="text-xs text-slate-400">{isGeneratingSlides ? slideProgressText : '可编辑排版：文字在本地模板里，图像模型只负责配图'}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => { void generateAllSlides(); }} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-950">生成配图</button>
          <button type="button" onClick={() => { void exportEditablePptx(pages, title); }} className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold dark:border-white/10">导出可编辑 PPTX</button>
        </div>
      </div>
      {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {pages.map((page) => {
          const slide = toEditableSlide({
            title: page.detail.title || page.title,
            contentText: page.detail.contentText,
            speakerNotes: page.detail.speakerNotes,
            pageIndex: page.pageIndex,
          });
          const image = page.versions.find((item) => item.id === page.currentVersionId)?.url;
          return (
            <article key={page.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1B1B1E]">
              <div className="flex min-h-40">
                <div className="flex-1 p-4">
                  <h3 className="text-base font-black">{slide.title}</h3>
                  <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                    {slide.bullets.map((bullet) => <li key={bullet}>• {bullet}</li>)}
                  </ul>
                  {page.error && <p className="mt-2 text-xs text-rose-500">{page.error}</p>}
                </div>
                {image && <img src={image} alt="" className="hidden w-36 object-cover sm:block" />}
              </div>
              <button type="button" onClick={() => { void generateSingleSlide(page.pageIndex); }} className="w-full border-t border-slate-100 px-4 py-2 text-left text-xs font-semibold text-indigo-600 dark:border-white/10">重绘这一页配图</button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
