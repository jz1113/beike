import type { PptSlidePage } from '@shared/contracts/pptGeneration';
import { toEditableSlide } from './pptLayouts';

export async function exportEditablePptx(pages: PptSlidePage[], projectTitle = '演示文稿') {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';
  deck.title = projectTitle;
  pages.forEach((page) => {
    const slide = toEditableSlide({
      title: page.detail.title || page.title,
      contentText: page.detail.contentText,
      speakerNotes: page.detail.speakerNotes,
      pageIndex: page.pageIndex,
    });
    const view = deck.addSlide();
    view.addText(slide.title, { x: 0.6, y: 0.4, w: 12, h: 0.9, fontSize: slide.layout === 'cover' ? 36 : 28, bold: true, color: '0F172A' });
    if (slide.bullets.length > 0) {
      view.addText(slide.bullets.map((text) => ({ text, options: { bullet: slide.layout !== 'quote' } })), {
        x: 0.7, y: 1.6, w: 7.2, h: 4.8, fontSize: 18, color: '334155', paraSpaceAfter: 10,
      });
    }
    const image = page.versions.find((item) => item.id === page.currentVersionId)?.url || page.versions.at(-1)?.url;
    if (image && /^https?:/.test(image)) {
      view.addImage({ path: image, x: 8.2, y: 1.6, w: 4.4, h: 3.4 });
    }
    if (slide.notes) view.addNotes(slide.notes);
  });
  await deck.writeFile({ fileName: `${projectTitle || '演示文稿'}.pptx` });
}
