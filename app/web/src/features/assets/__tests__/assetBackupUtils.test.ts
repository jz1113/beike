// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  stripMeta,
  buildBackupData,
  parseBackupDataToBulkItems,
} from '../assetBackupUtils';

describe('assetBackupUtils', () => {
  it('stripMeta 能够剥离主键与自动时间戳', () => {
    const raw = {
      id: 'asset_123',
      title: '测试场景',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      lighting: '自然光',
    };
    const cleaned = stripMeta(raw);
    expect(cleaned).toEqual({
      title: '测试场景',
      lighting: '自然光',
    });
    expect((cleaned as any).id).toBeUndefined();
  });

  it('buildBackupData 能够正确封装导出的备份结构', () => {
    const backup = buildBackupData({
      scenes: [{ id: '1', title: '场景1' }],
      personas: [{ id: '2', title: '人物1' }],
    });
    expect(backup.system).toBe('beike-yuntu-prompt-assets');
    expect(backup.data.scenes).toHaveLength(1);
    expect(backup.data.personas).toHaveLength(1);
    expect(backup.data.outfits).toEqual([]);
  });

  it('parseBackupDataToBulkItems 能够解析合法的备份 JSON 并剥离元数据', () => {
    const jsonStr = JSON.stringify({
      data: {
        scenes: [{ id: 's1', title: '空间1', createdAt: 'date1' }],
        outfits: [{ id: 'o1', top: '白T', updatedAt: 'date2' }],
      },
    });
    const items = parseBackupDataToBulkItems(jsonStr);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      assetType: 'scene',
      sourceId: 's1',
      data: { title: '空间1' },
    });
    expect(items[1]).toEqual({
      assetType: 'outfit',
      sourceId: 'o1',
      data: { top: '白T' },
    });
  });

  it('parseBackupDataToBulkItems 对非法结构抛出明确异常', () => {
    const invalidJson = JSON.stringify({ other: 123 });
    expect(() => parseBackupDataToBulkItems(invalidJson)).toThrow('无效的资产库备份文件格式');
  });
});
