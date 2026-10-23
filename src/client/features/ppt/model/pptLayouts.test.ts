import { describe, expect, it } from 'vitest';
import { toEditableSlide } from './pptLayouts';

describe('ppt layouts', () => {
  it('turns page text into editable bullets', () => {
    const slide = toEditableSlide({
      title: '增长来自复购',
      contentText: '## 增长来自复购\n• 复购率提升 18%\n• 客单提升 12%',
      pageIndex: 2,
    });
    expect(slide.layout).toBe('bullets');
    expect(slide.bullets).toEqual(['复购率提升 18%', '客单提升 12%']);
  });
});