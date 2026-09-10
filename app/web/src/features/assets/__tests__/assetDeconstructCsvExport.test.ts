import { describe, it, expect } from 'vitest';
import {
  buildDeconstructCsvContent,
  transformQueueItemToRecordRow,
  type DeconstructedRecordRow,
} from '../assetDeconstructCsvExport';

describe('assetDeconstructCsvExport', () => {
  it('should transform queue item into structured record row', () => {
    const mockItem = {
      id: 'xhs_123',
      name: '复古法式穿搭',
      images: ['https://img1.com', 'https://img2.com', 'https://img3.com'],
      sourceUrl: 'https://www.xiaohongshu.com/explore/6a844a9a0000000005032b86',
      author: '阿卓',
      status: 'done' as const,
      result: {
        master_prompt: 'A vintage french aesthetic girl in cafe, 35mm photography',
        persona: {
          name: '法式少女',
          description: '蓬松微卷发，清透底妆',
        },
        scenes: [
          {
            title: '巴黎街角咖啡馆',
            spatial_type: '半开放户外露台',
            lighting: '午后斜阳柔光',
            description: '绿白相间遮阳棚与复古藤编桌椅',
          },
        ],
        outfits: [
          {
            title: '法式慵懒碎花裙',
            top: '法式方领衬衫',
            bottom: '高腰碎花半裙',
            shoes: '玛丽珍粗跟鞋',
            color_palette: '奶油白配酒红',
          },
        ],
        actions: [
          {
            title: '倚靠窗台回眸',
            shot_type: 'medium_full_body',
            action: '手持咖啡杯微微侧身看向镜头',
            camera: '50mm f/1.4',
          },
        ],
      },
    };

    const row = transformQueueItemToRecordRow(mockItem);
    expect(row.sourceUrl).toBe('https://www.xiaohongshu.com/explore/6a844a9a0000000005032b86');
    expect(row.title).toBe('复古法式穿搭');
    expect(row.author).toBe('阿卓');
    expect(row.imageCount).toBe(3);
    expect(row.fullPrompt).toContain('A vintage french aesthetic');
    expect(row.personaSummary).toContain('法式少女');
    expect(row.sceneSummary).toContain('巴黎街角咖啡馆');
    expect(row.outfitSummary).toContain('法式方领衬衫');
    expect(row.actionSummary).toContain('倚靠窗台回眸');
    expect(row.status).toBe('success');
  });

  it('should build valid CSV content with UTF-8 BOM', () => {
    const rows: DeconstructedRecordRow[] = [
      {
        sourceUrl: 'https://www.xiaohongshu.com/explore/12345',
        title: '测试图集 1',
        author: '测试作者',
        imageCount: 5,
        imageUrls: ['https://cdn.com/1.jpg', 'https://cdn.com/2.jpg'],
        fullPrompt: 'Master prompt with "quotes" and commas, here',
        personaSummary: '博主',
        outfitSummary: '穿搭详情',
        sceneSummary: '场景详情',
        actionSummary: '动作详情',
        status: 'success',
        timestamp: '2026/8/30 23:20:00',
      },
      {
        sourceUrl: 'https://www.xiaohongshu.com/explore/67890',
        title: '视频或少图测试',
        author: '测试作者2',
        imageCount: 1,
        imageUrls: ['https://cdn.com/1.jpg'],
        fullPrompt: '',
        status: 'skipped',
        skipReason: '图片不足3张（已跳过）',
        timestamp: '2026/8/30 23:20:01',
      },
    ];

    const csv = buildDeconstructCsvContent(rows);
    // Must start with UTF-8 BOM
    expect(csv.startsWith('\uFEFF')).toBe(true);
    // Header check
    expect(csv).toContain('小红书采集链接');
    expect(csv).toContain('分析后的整条提示词 (Master Prompt)');
    // Escape check
    expect(csv).toContain('"Master prompt with ""quotes"" and commas, here"');
    expect(csv).toContain('已跳过');
    expect(csv).toContain('图片不足3张（已跳过）');
  });
});
