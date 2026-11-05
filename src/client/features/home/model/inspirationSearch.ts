export const INSPIRATION_CATEGORIES = [
  { id: 'all', label: '精选', categories: [] },
  { id: 'video', label: '影视创作', categories: ['video'] },
  { id: 'animation', label: '插画·3D', categories: ['illustration', '3d'] },
  { id: 'ecommerce', label: '广告电商', categories: ['ecommerce'] },
  { id: 'design', label: '平面设计', categories: ['poster'] },
  { id: 'photo', label: '摄影写真', categories: ['photo'] },
  { id: 'social', label: '社交创作', categories: ['social'] },
  { id: 'workbook', label: '工作簿', categories: ['workbook'] },
] as const;
export type InspirationCategory = typeof INSPIRATION_CATEGORIES[number]['id'];
interface SearchableInspiration { title: string; prompt: string; category: string; tag: string; author?: { name: string } }
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase();

export function matchesInspirationSearch(item: SearchableInspiration, category: InspirationCategory, query: string) {
  const selected = INSPIRATION_CATEGORIES.find(entry => entry.id === category)!;
  if (category !== 'all' && !(selected.categories as readonly string[]).includes(item.category)) return false;
  const categoryLabels = INSPIRATION_CATEGORIES.filter(entry => (entry.categories as readonly string[]).includes(item.category)).map(entry => entry.label);
  const haystack = normalize([item.title, item.prompt, item.tag, item.category, item.author?.name ?? '', ...categoryLabels].join(' '));
  return normalize(query).trim().split(/\s+/).filter(Boolean).every(term => haystack.includes(term));
}
