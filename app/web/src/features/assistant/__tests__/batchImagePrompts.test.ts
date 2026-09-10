import { describe, expect, it } from 'vitest';
import { buildAssistantBatch, extractImageBatch } from '../batchImagePrompts';
import { groupTasksIntoBatches } from '@/lib/taskBatchGrouping';
const block = (text: string, lang = 'text') => '```' + lang + '\n' + text + '\n```';
const content = '### 第 1 张 | 封面\n' + block('实拍 @图片3 --ar 3:4') + '\n### 封面文案\n' + block('周末不必走远') + '\n### 第 9 张 | 收藏页\n' + block('光影 @图片1 --ar 1:1');
const media = [1, 2, 3].map(n => ({ type: 'image' as const, url: `https://example.com/${n}.jpg` }));
describe('assistant image batches', () => {
  it('extracts complete image prompts only, preserving page titles and order', () => {
    const entries = extractImageBatch(content + '\n' + block('const x = "光影";', 'js') + '\n```text\n实拍 unfinished');
    expect(entries.map(e => e.title)).toEqual(['第 1 张 | 封面', '第 9 张 | 收藏页']);
  });
  it('maps references per image and groups different prompts as one submission', () => {
    const tasks = buildAssistantBatch(extractImageBatch(content), media, { model: 'gpt-image-2', size: '3:4', quality: 'high' });
    expect(tasks[0].images).toEqual([media[2].url]);
    expect(tasks[1].images).toEqual([media[0].url]);
    expect(tasks[0].prompt).toBe('实拍 @图片1');
    expect(tasks[0].batchId).toBe(tasks[1].batchId);
    expect(tasks[0].size).not.toBe(tasks[1].size);
    expect(groupTasksIntoBatches(tasks, { bySubmissionOnly: true })).toHaveLength(1);
    expect(tasks.map(t => t.shotNo)).toEqual([1, 2]);
  });
  it('rejects the whole batch when any selected page has missing references', () => {
    expect(() => buildAssistantBatch(extractImageBatch(content), [], { model: 'gpt-image-2', size: '3:4', quality: 'high' })).toThrow('第 1 张 | 封面');
  });
});

it('excludes old examples and keyword advice from a revised numbered batch', () => {
  const revised = '以前不要再写：\n' + block('多张照片拼贴，光影，实拍旧版') + '\n'
    + content + '\n### 最关键的提示词修改方向\n建议改成：\n' + block('单张真实手机旅行照片，实拍')
    + '\n真实感关键词可以反复使用：\n' + block('手机原相机，抓拍，浅景深')
    + '\n需要减少或删除的关键词：\n' + block('光影，电影感');
  expect(extractImageBatch(revised).map(entry => entry.code)).toEqual(['实拍 @图片3 --ar 3:4', '光影 @图片1 --ar 1:1']);
});
it('uses the last revision of each numbered page within a reply', () => {
  const revised = content + '\n### 第 1 张 | 封面新版\n' + block('新版实拍 @图片2 --ar 3:4');
  expect(extractImageBatch(revised)).toHaveLength(2);
  expect(extractImageBatch(revised)[0].code).toContain('新版实拍');
});
