import { describe, expect, it } from 'vitest';
import { extractGenerationPrompts, isGenerationPrompt } from './generationPrompts';

const block = (text: string, lang = 'text') => `\`\`\`${lang}\n${text}\n\`\`\``;
describe('generation prompt deliverables', () => {
  it('extracts Chinese covers, ratios and full long text without rewriting', () => {
    const prompt = `3:4 竖版 1080×1440 封面，背景色米白，字体粗黑。${'保留原始设计。'.repeat(3000)}`;
    const entries = extractGenerationPrompts(`## 一、01 封面（叠层式）\n提示词\n${block(prompt)}\n## 二、02 内页\n${block('构图居中，柔和光影，1080×1440')}`);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ title: '一、01 封面（叠层式）', aspect: '3:4', prompt });
    expect(entries[1].aspect).toBe('3:4');
  });
  it('supports mixed explicit image and video tags and timing', () => {
    const entries = extractGenerationPrompts(`${block('商品居中', 'image-prompt')}\n${block('总时长：8秒，9:16 竖版，镜头从正面推进', 'video-prompt')}`);
    expect(entries.map(entry => entry.mediaType)).toEqual(['image', 'video']);
    expect(entries[1]).toMatchObject({ duration: 8, aspect: '9:16' });
  });
  it('does not execute ordinary code, negative appendices, examples or unclosed blocks', () => {
    const content = `${block('const 光影 = 1;', 'javascript')}\n## 示例\n${block('光影自然')}\n## 负面提示词\n${block('不要塑料质感')}\n## 01 封面\n\`\`\`text\n实拍构图`;
    expect(extractGenerationPrompts(content)).toEqual([]);
  });
  it('keeps equal prompts for different deliverables and stable identities', () => {
    const content = `## 01 封面\n${block('自然光影，产品质感')}\n## 02 封面\n${block('自然光影，产品质感')}`;
    const entries = extractGenerationPrompts(content);
    expect(entries).toHaveLength(2);
    expect(entries[0].id).not.toBe(entries[1].id);
    expect(extractGenerationPrompts(content)).toEqual(entries);
  });
  it('keeps a full video timeline as one deliverable', () => {
    expect(extractGenerationPrompts(block('0–3秒近景，3–6秒跟拍，视频时长6秒'))).toMatchObject([{ mediaType: 'video', duration: 6 }]);
  });
  it('marks dependencies instead of guessing generated reference URLs', () => {
    expect(extractGenerationPrompts(block('使用上面生成的图片作为首帧，镜头从正面推进', 'video-prompt'))[0].issue).toBeTruthy();
  });
  it('excludes nested example sections until the next peer heading', () => {
    const content = `# 示例\n## 01 图片\n图片提示词\n${block('光影自然')}\n# 正式交付\n## 02 封面\n${block('背景色米白，产品构图居中')}`;
    expect(extractGenerationPrompts(content)).toMatchObject([{ title: '02 封面' }]);
  });
  it('uses an explicit numbered video heading even without camera verbs', () => {
    expect(extractGenerationPrompts(`## 01 视频\n${block('人物站在自然光影中，背景保持简洁')}`)).toMatchObject([{ mediaType: 'video' }]);
  });
  it('does not infer media from arbitrary text or code language', () => {
    expect(isGenerationPrompt('一段普通回答')).toBeUndefined();
    expect(isGenerationPrompt('光影构图', 'python')).toBeUndefined();
  });
});
