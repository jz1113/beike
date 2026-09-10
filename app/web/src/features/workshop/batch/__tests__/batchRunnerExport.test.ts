import { describe, it, expect } from 'vitest';
import { buildMatrixExportRows } from '../batchRunnerExport';
import type { BatchProductItem } from '../batchTypes';

describe('buildMatrixExportRows', () => {
  it('严格输出用户指定的8个表头字段且拆分后图链接1-4横向平铺', async () => {
    const mockItem: BatchProductItem = {
      id: 'prod_123',
      itemId: 'ITEM_8899',
      title: '高定轻奢小金条戒指',
      platform: 'tb',
      category: '珠宝首饰',
      coverImage: 'https://example.com/cover.jpg',
      mainImages: [],
      status: 'success',
      selected: true,
      copywriting: {
        title: '戴上就摘不下来的心动金戒✨',
        content: '今天必须分享这枚小金条戒指，低调又显高级，日常通勤百搭！',
        tags: ['小众首饰', '小金条戒指', '日常穿搭'],
      },
      tasks: [
        {
          id: 'task_1',
          shot_no: 1,
          title: '佩戴特写',
          prompt: '手指特写...',
          status: 'SUCCESS',
          resultUrl: 'https://oss.example.com/slice_1.jpg',
        },
        {
          id: 'task_2',
          shot_no: 2,
          title: '托盘静物',
          prompt: '丝绒托盘...',
          status: 'SUCCESS',
          resultUrl: 'https://oss.example.com/slice_2.jpg',
        },
        {
          id: 'task_3',
          shot_no: 3,
          title: '半身互动',
          prompt: '手托下巴...',
          status: 'SUCCESS',
          resultUrl: 'https://oss.example.com/slice_3.jpg',
        },
        {
          id: 'task_4',
          shot_no: 4,
          title: '氛围随拍',
          prompt: '自然光随拍...',
          status: 'SUCCESS',
          resultUrl: 'https://oss.example.com/slice_4.jpg',
        },
      ],
    };

    const rows = await buildMatrixExportRows([mockItem]);

    expect(rows).toHaveLength(1);
    const row = rows[0];

    // 验证严格包含且仅包含指定表头 Keys
    const keys = Object.keys(row);
    expect(keys).toEqual([
      '任务标题',
      '任务文案',
      '商品名称',
      '商品ID',
      '图链接1',
      '图链接2',
      '图链接3',
      '图链接4',
    ]);

    // 验证具体字段内容映射
    expect(row['任务标题']).toBe('戴上就摘不下来的心动金戒✨');
    expect(row['任务文案']).toContain('今天必须分享这枚小金条戒指');
    expect(row['任务文案']).toContain('#小众首饰 #小金条戒指 #日常穿搭');
    expect(row['商品名称']).toBe('高定轻奢小金条戒指');
    expect(row['商品ID']).toBe('ITEM_8899');
    expect(row['图链接1']).toBe('https://oss.example.com/slice_1.jpg');
    expect(row['图链接2']).toBe('https://oss.example.com/slice_2.jpg');
    expect(row['图链接3']).toBe('https://oss.example.com/slice_3.jpg');
    expect(row['图链接4']).toBe('https://oss.example.com/slice_4.jpg');
  });

  it('文案为空时能合理降级，图少于4张时空位补空字符串', async () => {
    const mockItem: BatchProductItem = {
      id: 'prod_456',
      itemId: 'ITEM_7766',
      title: '复古法式耳环',
      platform: 'pdd',
      category: '饰品',
      coverImage: 'https://example.com/cover2.jpg',
      mainImages: [],
      status: 'success',
      selected: true,
      tasks: [
        {
          id: 'task_1',
          shot_no: 1,
          title: '镜头1',
          prompt: '...',
          status: 'SUCCESS',
          resultUrl: 'https://oss.example.com/earring_1.jpg',
        },
        {
          id: 'task_2',
          shot_no: 2,
          title: '镜头2',
          prompt: '...',
          status: 'SUCCESS',
          resultUrl: 'https://oss.example.com/earring_2.jpg',
        },
      ],
    };

    const rows = await buildMatrixExportRows([mockItem]);
    expect(rows).toHaveLength(1);
    const row = rows[0];

    expect(row['任务标题']).toBe('复古法式耳环');
    expect(row['任务文案']).toBe('');
    expect(row['商品名称']).toBe('复古法式耳环');
    expect(row['商品ID']).toBe('ITEM_7766');
    expect(row['图链接1']).toBe('https://oss.example.com/earring_1.jpg');
    expect(row['图链接2']).toBe('https://oss.example.com/earring_2.jpg');
    expect(row['图链接3']).toBe('');
    expect(row['图链接4']).toBe('');
  });
});
