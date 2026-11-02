import { describe, expect, it } from 'vitest';
import { eligibleSalesImages } from '@shared/domain/sales';
import { emptySalesCollection, parseSalesCollection } from './salesCollectionDraft';
import { confirmedOCRText, patchOCRImage, summarizeSalesOCR, confirmSalesOCRImages } from './salesOCR';

const catalog = [{ index: 4, url: '/a.png', role: 'main' as const }, { index: 9, url: '/b.png', role: 'detail' as const }];
const result = { engine: 'test', width: 100, height: 4000, text: '棉 61.7%', lines: [], cached: false };

describe('independent product and OCR image selections', () => {
  it('persists independent selections and editable text without automatically confirming it', () => {
    const saved = parseSalesCollection({ ...emptySalesCollection(), step: 'text', imageCatalog: catalog,
      colorSelection: { confirmedImageUrls: ['/a.png'] }, ocrImageUrls: ['/b.png', '/a.png', '/b.png', '/unknown.png'],
      ocrImages: [{ imageUrl: '/b.png', result, editedText: '棉 61.7% 已核对' }, { imageUrl: '/unknown.png', result }],
    });
    expect(eligibleSalesImages(saved.imageCatalog, saved.colorSelection).map((image) => image.url)).toEqual(['/a.png']);
    expect(saved.ocrImageUrls).toEqual(['/b.png', '/a.png']);
    expect(saved.ocrImages).toHaveLength(1);
    expect(saved.ocrImages[0].editedText).toBe('棉 61.7% 已核对');
    expect(confirmedOCRText(saved.ocrImages)).toBe('');
    expect(parseSalesCollection(saved)).toEqual(saved);
  });
  it('keeps confirmed text stable until explicitly updated and deduplicates whole lines', () => {
    let entries = patchOCRImage([], '/a.png', { result, editedText: ' 棉 61.7%\n请勿漂白 ' });
    entries = patchOCRImage(entries, '/a.png', { confirmedText: entries[0].editedText.trim() });
    entries = patchOCRImage(entries, '/b.png', { confirmedText: '棉 61.7%\n低温熨烫' });
    expect(confirmedOCRText(entries)).toBe('棉 61.7%\n请勿漂白\n低温熨烫');
    entries = patchOCRImage(entries, '/a.png', { editedText: '棉 60%' });
    expect(confirmedOCRText(entries)).toContain('棉 61.7%');
    entries = patchOCRImage(entries, '/a.png', { confirmedText: undefined });
    expect(confirmedOCRText(entries)).toBe('棉 61.7%\n低温熨烫');
  });
  it('clears OCR on a fresh product and tolerates malformed saved results', () => {
    expect(emptySalesCollection()).toMatchObject({ step: 'images', ocrImages: [], ocrImageUrls: [] });
    const state = parseSalesCollection({ imageCatalog: catalog, ocrImages: [null, { imageUrl: '/a.png', editedText: '保留编辑', result: { bad: true } }] });
    expect(state.ocrImages[0]).toEqual({ imageUrl: '/a.png', editedText: '保留编辑' });
  });
});

describe('recognized text summaries', () => {
  it('combines the latest edits in catalog order and removes only identical trimmed lines', () => {
    const entries = [
      { imageUrl: '/b.png', editedText: '洗护说明\r\n 请勿漂白 \r\n棉 61.7%\n棉 60%', result },
      { imageUrl: '/a.png', editedText: ' 面料成分 \n棉 61.7%\n请勿漂白\n', result },
    ];
    const summary = summarizeSalesOCR(catalog, ['/b.png', '/a.png'], entries);
    expect(summary.text).toBe('面料成分\n棉 61.7%\n请勿漂白\n洗护说明\n棉 60%');
    expect(summary.images.map((entry) => entry.imageUrl)).toEqual(['/a.png', '/b.png']);
    expect(summary.duplicateLines).toBe(2);
    expect(summary.lineCount).toBe(5);
    entries[0].editedText = '洗护说明\n温度不高于40°C';
    expect(summarizeSalesOCR(catalog, ['/a.png', '/b.png'], entries).text).toContain('温度不高于40°C');
  });
  it('excludes deselected, failed, unrecognized and deliberately cleared text', () => {
    const entries = [{ imageUrl: '/a.png', editedText: '旧文字', result, error: '重试失败' }, { imageUrl: '/b.png', editedText: '已取消选择', result }];
    expect(summarizeSalesOCR(catalog, ['/a.png'], entries).text).toBe('');
    expect(summarizeSalesOCR(catalog, ['/a.png'], [{ imageUrl: '/a.png', editedText: '' , result }]).text).toBe('');
    expect(summarizeSalesOCR(catalog, ['/a.png'], [{ imageUrl: '/a.png', editedText: '没有识别结果' }]).images).toEqual([]);
  });
  it('confirms only eligible selected results while preserving other confirmed product notes', () => {
    const entries = [
      { imageUrl: '/a.png', editedText: ' 新文字 ', result, confirmedText: '旧文字' },
      { imageUrl: '/b.png', editedText: '未选择', result, confirmedText: '已确认的其他资料' },
      { imageUrl: '/failed.png', editedText: '错误文字', result, error: '失败' },
      { imageUrl: '/pending.png', editedText: '等待' },
    ];
    const confirmed = confirmSalesOCRImages(entries, ['/a.png', '/failed.png', '/pending.png']);
    expect(confirmed.map((entry) => entry.confirmedText)).toEqual(['新文字', '已确认的其他资料', undefined, undefined]);
    expect(entries[0].confirmedText).toBe('旧文字');
    expect(confirmedOCRText(confirmed)).toBe('新文字\n已确认的其他资料');
  });
  it('excludes unavailable originals until they recover without deleting their reviewed text', () => {
    const entries = [{ imageUrl: '/a.png', editedText: '已核对文字', confirmedText: '已核对文字', result }];
    const unavailable = catalog.map((image) => ({ ...image, unavailable: true }));
    expect(summarizeSalesOCR(unavailable, ['/a.png'], entries)).toMatchObject({ text: '', images: [] });
    expect(entries[0].confirmedText).toBe('已核对文字');
    expect(summarizeSalesOCR(catalog, ['/a.png'], entries).text).toBe('已核对文字');
  });
});
