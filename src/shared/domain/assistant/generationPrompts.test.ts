import { describe, expect, it } from 'vitest';
import { clientContextSchema } from '../../contracts/assistant';
import { extractGenerationPrompts, isGenerationPrompt } from './generationPrompts';
import { explicitBatchGenerationRequest, shouldAnalyzeVideoDirectly } from './mediaAnalysis';
import { getOpenAITools, getToolDefinition } from './tools/defs';
import { parseToolAction, summarizeToolResult, toolDisplayName } from './tools/resultPresentation';

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
  it('reads parameters from a natural Chinese video introduction without mistaking shot timings for duration', () => {
    const prompt = '制作一条8秒、9:16竖屏、自然生活化UGC商品展示视频。0–2秒展示，2–5秒佩戴，5–8秒取下。';
    expect(extractGenerationPrompts(block(prompt, 'video-prompt'))).toMatchObject([{ duration: 8, aspect: '9:16', prompt }]);
    expect(extractGenerationPrompts(block('0–2秒展示，2–5秒佩戴，镜头稳定。', 'video-prompt'))[0].duration).toBeUndefined();
  });
  it('does not execute ordinary code, negative appendices, examples or unclosed blocks', () => {
    const content = `${block('const 光影 = 1;', 'javascript')}\n## 示例\n${block('光影自然')}\n## 负面提示词\n${block('不要塑料质感')}\n## 01 封面\n\`\`\`text\n实拍构图`;
    expect(extractGenerationPrompts(content)).toEqual([]);
  });
  it('reads explicit Chinese duration qualifiers and orientation from live replies', () => {
    expect(extractGenerationPrompts(block('生成一段总时长严格为10秒、画幅16:9的写实电影视频。0–2秒发现，2–5秒拾起。', 'video-prompt'))[0])
      .toMatchObject({ duration: 10, aspect: '16:9' });
    expect(extractGenerationPrompts(block('横向画幅，宽高比3:2，白色背景，同一成年人物正面、左侧面、背面的全身三视图。', 'image-prompt'))[0])
      .toMatchObject({ aspect: '3:2' });
    expect(extractGenerationPrompts(block('一条约10秒、24fps、宽幅横构图的单镜头电影化视频。', 'video-prompt'))[0])
      .toMatchObject({ duration: 10 });
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

const video = { role: 'user', content: '分析视频并生成分镜提示词', attachments: [{ type: 'video', url: '/storage/local/video.mp4' }] };

describe('direct multimodal video analysis', () => {
  it('analyzes an uploaded video and prompt-writing requests without skills', () => {
    expect(shouldAnalyzeVideoDirectly([video])).toBe(true);
  });
  it('keeps follow-up questions in the same direct analysis flow', () => {
    expect(shouldAnalyzeVideoDirectly([video, { role: 'assistant', content: '分析结果' }, { role: 'user', content: '继续细化最后一个镜头' }])).toBe(true);
  });
  it('preserves explicitly selected skills and requests to generate actual media', () => {
    expect(shouldAnalyzeVideoDirectly([video], 'video-teardown')).toBe(false);
    expect(shouldAnalyzeVideoDirectly([video, { role: 'user', content: '把上面的这些视频全部生成' }])).toBe(false);
  });
  it('keeps normal text and image-only conversations on the agent route', () => {
    expect(shouldAnalyzeVideoDirectly([{ role: 'user', content: '你好', attachments: [null, { type: 'image' }] }])).toBe(false);
  });
});

describe('explicit paid batch generation authorization', () => {
  it.each(['把上面全部生成', '这些图片直接生成', '这组视频开始生成', '生成第 2 张', '把上述画出来',
    '所有视频渲染', '出图', 'Generate all images', 'render the above videos'])('accepts explicit final-media instructions: %s', text => {
    expect(explicitBatchGenerationRequest(text)).toBe(true);
  });

  it.each(['', '继续', '保存清单', '解释这些图片', '调整第2张的光影', '先写方案', '生成',
    '只要提示词', '只写提示词，所有图片先不要生成', '只给 prompt', '生成提示词', '写图片提示词',
    '不要生成全部图片', '不用生成这些视频', '先别生成图片', '暂不渲染这些视频', '不能生成图片', '不需要出图',
  ])('rejects planning, ambiguous instructions and explicit refusal: %s', text => {
    expect(explicitBatchGenerationRequest(text)).toBe(false);
  });

  it.each(['不生成图片', '请勿生成所有图片', 'Do not generate images', "Don't render videos", 'Generate image prompts only',
    '生成所有图片的提示词'])('keeps refusals and prompt-only instructions outside paid authorization: %s', text => {
    expect(explicitBatchGenerationRequest(text)).toBe(false);
  });
});

const generationBatches = [{
  sourceId: 'draft:a',
  entries: [{ id: 'image:1', title: '首图', mediaType: 'image' as const }],
}];

describe('batch generation tool contract', () => {
  it('requires only manifest source and entry IDs with bounded entries', () => {
    const tool = getToolDefinition('trigger_generate_batch');
    expect(tool).toMatchObject({ scope: 'client', approval: 'per_turn' });
    expect(tool?.openaiTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        sourceId: expect.objectContaining({ type: 'string', minLength: 1, maxLength: 255 }),
        entryIds: expect.objectContaining({ type: 'array', minItems: 1, maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 255 } }),
      },
      required: ['sourceId', 'entryIds'],
      additionalProperties: false,
    });
    expect(tool?.openaiTool.function.description).toContain('写提示词、整理方案不代表生成授权');
    expect(getOpenAITools([], ['trigger_generate']).some((item) => item.function.name === 'trigger_generate_batch')).toBe(false);
    expect(getOpenAITools([], ['trigger_generate_batch'])).toHaveLength(1);
  });

  it('validates manifest limits, required fields and duplicate identities', () => {
    expect(clientContextSchema.safeParse({ generationBatches }).success).toBe(true);
    expect(clientContextSchema.safeParse({}).success).toBe(true);
    expect(clientContextSchema.safeParse({ generationBatches: [] }).success).toBe(true);
    const groups = Array.from({ length: 8 }, (_, index) => ({ ...generationBatches[0], sourceId: String(index) }));
    const entries = Array.from({ length: 30 }, (_, index) => ({ ...generationBatches[0].entries[0], id: String(index) }));
    expect(clientContextSchema.safeParse({ generationBatches: groups }).success).toBe(true);
    expect(clientContextSchema.safeParse({ generationBatches: [{ sourceId: 'a', entries }] }).success).toBe(true);
    for (const invalid of [
      null,
      [...groups, { ...groups[0], sourceId: 'extra' }],
      [{ sourceId: 'a', entries: [...entries, { ...entries[0], id: 'extra' }] }],
      [generationBatches[0], generationBatches[0]],
      [{ sourceId: 'a', entries: [entries[0], entries[0]] }],
      [{ entries }],
      [{ sourceId: 'a', entries: [{ id: 'x', mediaType: 'image' }] }],
      [{ sourceId: 'a', entries: [{ id: 'x', title: '', mediaType: 'document' }] }],
    ]) {
      expect(clientContextSchema.safeParse({ generationBatches: invalid }).success).toBe(false);
    }
  });

  it('shows a request receipt rather than claiming submission or generation success', () => {
    const raw = JSON.stringify({ success: true, action: 'generate_batch', sourceId: 'draft:a', entryIds: ['image:1'], operationId: 'batch_1' });
    expect(toolDisplayName('trigger_generate_batch')).toBe('请求批量生成');
    expect(summarizeToolResult(raw)).toBe('已请求批量提交，客户端将校验后执行');
    expect(parseToolAction(raw)).toMatchObject({ action: 'generate_batch', sourceId: 'draft:a', operationId: 'batch_1' });
    expect(summarizeToolResult('{"success":false,"error":"清单无效"}')).toBe('清单无效');
  });
});
