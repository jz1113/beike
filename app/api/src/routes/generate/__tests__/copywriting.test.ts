import { describe, expect, it } from 'vitest';
import {
  stripEmojis,
  formatCleanTitle,
  formatCleanContent,
  POST,
} from '../copywriting';

describe('copywriting formatting & constraints', () => {
  it('stripEmojis should remove all emojis and decoration symbols', () => {
    const textWithEmojis = '原图直出！这件单品上手太显气质了✨📸🌿👗💎🔥👍❤️';
    const cleaned = stripEmojis(textWithEmojis);
    expect(cleaned).toBe('原图直出！这件单品上手太显气质了');
    // eslint-disable-next-line no-misleading-character-class
    expect(cleaned).not.toMatch(/[✨📸🌿👗💎🔥👍❤️]/u);
  });

  it('formatCleanTitle should enforce 5-20 characters without emojis', () => {
    const raw1 = '超火✨翡翠手镯📸';
    const title1 = formatCleanTitle(raw1, '翡翠手镯');
    expect(title1.length).toBeGreaterThanOrEqual(5);
    expect(title1.length).toBeLessThanOrEqual(20);
    expect(title1).not.toMatch(/[✨📸]/u);

    const veryLong = '这是一件超级无敌好看无敌显白无敌有气质的翡翠手镯日常穿搭分享推荐测评记录';
    const title2 = formatCleanTitle(veryLong, '手镯');
    expect(title2.length).toBeLessThanOrEqual(20);
  });

  it('formatCleanTitle should deduplicate against existingTitles', () => {
    const existing = ['实测这件羊绒大衣质感超出预期', '真实自用分享关于羊绒大衣'];
    const newTitle = formatCleanTitle('实测这件羊绒大衣质感超出预期', '羊绒大衣', existing);
    expect(newTitle.length).toBeGreaterThanOrEqual(5);
    expect(newTitle.length).toBeLessThanOrEqual(20);
    expect(existing).not.toContain(newTitle);
  });

  it('formatCleanContent should ensure >100 characters and double-newline paragraph separation', () => {
    const shortContent = '太好看了，非常推荐！';
    const fallback = `收到特意佩戴了一周才来写这篇测评，无滤镜自然光实拍，给大家整理了一份客观的实测复盘。

做工细节非常细腻，水头温润清亮，边缘打磨平整顺滑没有任何粗糙感。圈口尺寸标准，贴合手腕曲线。

日常无论搭配深色西装还是浅色针织衫都特别提气色，上手显得手腕很修长，百搭耐看。

需要注意的是日常避免剧烈磕碰或接触强酸碱洗涤剂，妥善存放能长久保持通透质感。`;
    const formatted = formatCleanContent(shortContent, fallback);
    expect(formatted.length).toBeGreaterThan(100);
    expect(formatted).toContain('\n\n');
  });

  it('POST endpoint should return compliant copy on fallback without api key', async () => {
    const req = new Request('http://localhost/api/generate/copywriting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productTitle: '天然翡翠手镯',
        productCategory: '珠宝饰品',
        style: 'authentic',
        existingTitles: ['已存在的标题1'],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();

    const { title, content, tags } = json.data;
    // 标题：5-20字，不要任何表情包，且不与已有标题重复
    expect(title.length).toBeGreaterThanOrEqual(5);
    expect(title.length).toBeLessThanOrEqual(20);
    expect(title).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✨📸🌿👗💎🔥👍]/u);
    expect(title).not.toBe('已存在的标题1');

    // 文案：大于100字，分段清晰
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain('\n\n');

    // 标签
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeGreaterThan(0);
  });
});
