export type PptLayoutKind = 'cover' | 'bullets' | 'split' | 'quote' | 'metrics';

export interface EditablePptSlide {
  title: string;
  bullets: string[];
  layout: PptLayoutKind;
  notes: string;
}

const KINDS = new Set<PptLayoutKind>(['cover', 'bullets', 'split', 'quote', 'metrics']);

export function toEditableSlide(input: {
  title?: string;
  contentText?: string;
  speakerNotes?: string;
  layoutType?: string;
  bullets?: string[];
  pageIndex?: number;
}): EditablePptSlide {
  const bullets = (input.bullets && input.bullets.length > 0)
    ? input.bullets.map((item) => item.trim()).filter(Boolean)
    : String(input.contentText || '')
      .split('\n')
      .map((line) => line.replace(/^[#•\-\s]+/, '').trim())
      .filter((line) => line && line !== input.title);
  const requested = input.layoutType as PptLayoutKind;
  const layout = KINDS.has(requested) ? requested : (input.pageIndex === 1 ? 'cover' : 'bullets');
  return {
    title: input.title || '未命名页面',
    bullets: bullets.slice(0, 6),
    layout,
    notes: input.speakerNotes || '',
  };
}
