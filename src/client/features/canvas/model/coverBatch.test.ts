import { describe, expect, it, vi } from 'vitest';
import { batchCoverLayouts, coverBatchFileName, coverLayoutImageInput, coverLayoutOptions, coverResultReferencePath, coverReviewState, coverSubmittedProductUrl, formatCoverSkillReply, matchesCoverDraft, normalizeBatchCoverPrompt, readCoverBatch, renderCoverPng, validateCoverPromptFormat } from './coverBatch';
import { canvasNodeToStudioNode, studioNodeToCanvasNode } from './studioSceneAdapter';
import type { StudioScene } from './types';

it('uses the full Excel title for ordinary PNG names and reserves space for duplicate suffixes', () => {
  const original = '华为FreeBuds 7千元级别的享受';
  expect(coverBatchFileName(original)).toBe(original + '.png');
  expect(coverBatchFileName(original + ' / 测试', ' (2)')).toBe(original + ' _ 测试 (2).png');
  const longName = coverBatchFileName('耳机'.repeat(60), ' (2)');
  expect(new TextEncoder().encode(longName).length).toBeLessThanOrEqual(255);
  expect(longName).toMatch(/^[耳机]+ \(2\)\.png$/);
});

it.each([[1024, 0], [768, 128]])('saves a 1024×%i image as a complete square PNG', async (height, top) => {
  const drawImage = vi.fn();
  const bitmap = { width: 1024, height, close: vi.fn() };
  const png = new Blob(['cover'], { type: 'image/png' });
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect: vi.fn(), drawImage }),
    toBlob: vi.fn((callback: (blob: Blob) => void) => callback(png)) };
  vi.stubGlobal('createImageBitmap', async () => bitmap);
  vi.stubGlobal('document', { createElement: () => canvas });
  try {
    await expect(renderCoverPng('data:image/png;base64,YQ==', '1:1')).resolves.toBe(png);
    expect([canvas.width, canvas.height]).toEqual([1024, 1024]);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, top, 1024, height);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  } finally {
    vi.unstubAllGlobals();
  }
});

it('rejects a non-square horizontal cover instead of adding a border', async () => {
  const bitmap = { width: 1024, height: 768, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', async () => bitmap);
  try {
    await expect(renderCoverPng('data:image/png;base64,YQ==', '1:1', { requireSquare: true })).rejects.toThrow('不是方图');
    expect(bitmap.close).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});

describe('batch cover Skill output', () => {
  it('accepts a fenced Markdown reply with a formatted heading', () => {
    const reply = '```markdown\n## **画幅与构图**：**PHONE－05**｜4:3 横屏\n商品外观：单件主体\n```';
    expect(normalizeBatchCoverPrompt(reply, 'PHONE-05')).toBe(
      '画幅与构图：PHONE-05｜4:3 横屏\n商品外观：单件主体',
    );
  });

  it('uses the assigned identifier when the model omits the label', () => {
    expect(normalizeBatchCoverPrompt('画幅与构图：4:3 横屏，主体靠右', 'PHONE-05'))
      .toBe('画幅与构图：PHONE-05｜4:3 横屏，主体靠右');
  });

  it('keeps drawing instructions when the model writes freeform prose', () => {
    expect(normalizeBatchCoverPrompt('采用横向构图，键盘居右，标题靠左。', 'PHONE-30'))
      .toBe('画幅与构图：PHONE-30\n采用横向构图，键盘居右，标题靠左。');
  });

  it('blocks explicit layout substitutions and missing materials', () => {
    expect(() => normalizeBatchCoverPrompt('画幅与构图：PHONE-10｜横屏', 'PHONE-05')).toThrow('PHONE-10');
    expect(() => normalizeBatchCoverPrompt('NEED_INPUT', 'PHONE-28')).toThrow('NEED_INPUT');
    expect(() => normalizeBatchCoverPrompt('画幅与构图：PHONE-28\nNEED_INPUT', 'PHONE-28')).toThrow('NEED_INPUT');
    expect(() => normalizeBatchCoverPrompt('**NEED_INPUT**：缺少正面图', 'PHONE-05')).toThrow('缺少正面图');
  });
});

it('loads the remaining templates in order with distinct image paths', () => {
  expect(batchCoverLayouts.map(layout => layout.id)).toEqual(
    Array.from({ length: 38 }, (_, index) => `PHONE-${String(index + 1).padStart(2, '0')}`).filter(id => id !== 'PHONE-07'),
  );
  expect(new Set(batchCoverLayouts.map(layout => layout.referencePath)).size).toBe(37);
  expect(batchCoverLayouts.find(layout => layout.id === 'PHONE-23')?.referencePath).toBe('/cover-layouts/v0.2.0/phone-23.jpg');
  expect(batchCoverLayouts.find(layout => layout.id === 'PHONE-28')?.referencePath).toBe('/cover-layouts/v0.2.0/phone-28.png');
});

it('only accepts line breaks in a locked title', () => {
  const prompt = [
    '画幅与构图：PHONE-31｜竖版',
    '背景：灰墙',
    '商品外观：@图片1 的机身',
    '标题与排版：',
    '第1行：“真我GT8 Pro，”｜字号：大｜位置：左上｜样式：粗白',
    '第2行：“体验如何？”｜字号：小｜位置：左下｜样式：细白',
    '字体与视觉风格：白色黑体',
    '光线和画质：左侧窗光，左边框局部反光，右侧偏暗',
    '保真约束：保留镜头位置',
  ].join('\n');
  expect(() => validateCoverPromptFormat(prompt, '真我GT8 Pro，体验如何？')).not.toThrow();
  expect(() => validateCoverPromptFormat(prompt, '真我gt8 Pro，体验如何？')).toThrow('只允许断行');
  const markdown = prompt.replace('背景：灰墙', '## 【背景】\n灰墙')
    .replace('第1行：“真我GT8 Pro，”｜字号：大｜位置：左上｜样式：粗白',
      '- **第1行**： 「真我GT8 Pro，」\n字号：大 | 位置：左上 | 样式：粗白');
  expect(() => validateCoverPromptFormat(markdown, '真我GT8 Pro，体验如何？')).not.toThrow();
  expect(() => validateCoverPromptFormat(prompt.replace('｜位置：左上', ''))).toThrow('字号、位置和样式');
});

it('renders structured Skill replies into seven sections and preserves the exact title', () => {
  const reply = {
    layout: 'PHONE-02', composition: '3:4，主体在右侧', background: '木桌',
    product: '@图片1 的真实背板', typography: '粗黑体', lighting: '左侧窗光，右侧暗部', constraints: '保留镜头布局',
    titleLines: [
      { text: '真我 GT8，', size: '画宽约70%', position: '左上', style: '粗白' },
      { text: '体验如何？', size: '小一号', position: '左下', style: '细白' },
    ],
  };
  const prompt = normalizeBatchCoverPrompt(JSON.stringify(reply), 'PHONE-02');
  const wrapped = JSON.stringify(reply)
    .replace('PHONE-02', 'PHONE\n-02')
    .replace('"text":', '"text\n":')
    .replace('真我 GT8，', '真我 GT\n8，')
    .replace('画宽约70%', '画宽约7\r\n0%');
  expect(normalizeBatchCoverPrompt(wrapped, 'PHONE-02')).toBe(prompt);
  expect(() => validateCoverPromptFormat(normalizeBatchCoverPrompt(
    wrapped.replace('8，', '8'), 'PHONE-02'), '真我 GT8，体验如何？')).toThrow('只允许断行');

  const title = '真我 GT8，体验如何？';
  const missingComma = wrapped.replace('8，', '8');
  expect(normalizeBatchCoverPrompt(missingComma, 'PHONE-02', title)).toBe(prompt);
  for (const replyWithChangedTitle of [
    missingComma.replace('真我 GT', '真我 gt'),
    missingComma.replace('真我 GT', '真我GT'),
    missingComma.replace('体验如何？', '体验如何？啊'),
    missingComma.replace('体验如何？', '体验如何'),
    wrapped.replace('GT\n8，', 'GT\n8').replace('真我 GT', '真，我 GT'),
  ]) {
    expect(() => validateCoverPromptFormat(
      normalizeBatchCoverPrompt(replyWithChangedTitle, 'PHONE-02', title), title,
    )).toThrow('只允许断行');
  }

  expect(normalizeBatchCoverPrompt('以下是设计：\n' + JSON.stringify(reply) + '\n以上。', 'PHONE-02')).toBe(prompt);
  expect(() => normalizeBatchCoverPrompt('{"layout":"PHONE-02"', 'PHONE-02')).toThrow('缺少结尾');
  expect(() => normalizeBatchCoverPrompt('{"error":"缺少手机背面图"}', 'PHONE-02')).toThrow('缺少手机背面图');
  expect(prompt).toContain('画幅与构图：PHONE-02｜3:4，主体在右侧');
  expect(prompt).toContain('保真约束：保留镜头布局');
  expect(() => validateCoverPromptFormat(prompt, '真我 GT8，体验如何？')).not.toThrow();
  expect(() => validateCoverPromptFormat(prompt, '真我GT8，体验如何？')).toThrow('只允许断行');
  expect(() => normalizeBatchCoverPrompt(JSON.stringify({ ...reply, lighting: '' }), 'PHONE-02')).toThrow('lighting');
  expect(() => normalizeBatchCoverPrompt(JSON.stringify(reply), 'PHONE-03')).toThrow('指定版式 PHONE-03');
});

it('rotates only compatible layouts and keeps front-only sources on a front layout', () => {
  expect(coverLayoutOptions(1, 'phone-front').map(item => item.id)).toEqual(['PHONE-05', 'PHONE-33']);
  expect(coverLayoutOptions(1, 'keyboard')[0]?.id).toBe('PHONE-29');
  expect(coverLayoutOptions(0, 'phone-back').some(item => item.id === 'PHONE-05')).toBe(false);
});

it('ties visual approval to the exact result and generation attempt', () => {
  const settings = { beikeCoverReviewTaskId: 'new', beikeCoverReviewUrl: '/new.png', beikeCoverReview: { taskId: 'new', url: '/new.png', decision: 'approved' } };
  expect(coverReviewState(settings, 'new', '/new.png')).toBe('approved');
  expect(coverReviewState(settings, 'new', '/replaced.png')).toBe('pending');
  expect(coverReviewState(settings, 'old', '/new.png')).toBeUndefined();
});

it('shows a comparison original only for the image and task it was submitted with', () => {
  const raw = { id: 'cover', type: 'gen-image', imageUrl: '/storage/current.png', beikeLastTaskId: 'current',
    settings: { beikeCoverReviewTaskId: 'current', beikeCoverReviewUrl: '/storage/current.png',
      beikeCoverSubmittedSourceUrl: '/storage/used-product.png' } };
  const scene = { nodes: [raw], connections: [], groups: [], textBoxes: [], strokes: [], view: { x: 0, y: 0, zoom: 1 } };
  const node = studioNodeToCanvasNode(raw, scene);
  expect(coverSubmittedProductUrl(node)).toBe('/storage/used-product.png');
  expect(coverSubmittedProductUrl({ ...node, imageUrl: '/storage/older.png' })).toBeUndefined();
  expect(coverSubmittedProductUrl({ ...node, taskId: 'other' })).toBeUndefined();
});

it.each(['3:4', '4:3'])('ignores historical manual review records for %s Excel results', ratio => {
  const settings = { beikeCoverExportRatio: ratio, beikeCoverReviewTaskId: 'batch-task', beikeCoverReviewUrl: '/cover.png' };
  expect(coverReviewState(settings, 'batch-task', '/cover.png')).toBeUndefined();
  const rejected = { taskId: 'batch-task', url: '/cover.png', decision: 'rejected' };
  expect(coverReviewState({ ...settings, beikeCoverReview: rejected }, 'batch-task', '/cover.png')).toBeUndefined();
  expect(coverReviewState({ ...settings, beikeCoverExportRatio: undefined, beikeCoverReview: rejected }, 'batch-task', '/cover.png')).toBe('rejected');
});

function simulatedCoverReply(layout: string, profile: string, title: string) {
  return JSON.stringify({
    layout, profile,
    composition: '竖放在桌面并同时展示手机正面与背面',
    background: '均匀棚拍渐变',
    product: '同时展示镜头与蓝色抽象渐变壁纸',
    typography: '两行粗字等大',
    lighting: '左侧主光，局部反光，握点有接触影',
    constraints: '正反面并排',
    titleLines: [{ text: title, size: '相对画宽 80%', position: '左上', style: '重投影，真话标红' }],
  });
}

it.each([
  ['PHONE-08', '4:3', '右手从下方自然握一台手机'],
  ['PHONE-09', '4:3', '三条自上而下分离的横向画格'],
  ['PHONE-19', '3:4', '近距离横握单台手机背面'],
])('keeps %s reference composition while removing conflicting draft instructions', (layout, ratio, anchor) => {
  const title = '原文，REDMI Pro 不改字。';
  const design = formatCoverSkillReply(simulatedCoverReply(layout, 'phone-both', title), title, { offset: 0, preferred: layout });
  const { prompt } = coverLayoutImageInput(design, ratio)!;
  expect(prompt).toContain(anchor);
  expect(prompt).toContain(`输出画幅以当前任务的 ${ratio} 为准`);
  expect(prompt).toContain('单台手机只展示背面');
  expect(prompt).not.toMatch(/竖放在桌面|同时展示镜头与蓝色|均匀棚拍渐变|正反面并排/);
  expect(() => validateCoverPromptFormat(prompt, title)).not.toThrow();
});

it('prefers unused compatible layouts and cycles after the pool is exhausted', () => {
  const all = coverLayoutOptions(0, 'keyboard').map(item => item.id);
  expect(all.length).toBeGreaterThan(1);
  expect(coverLayoutOptions(0, 'keyboard', undefined, [all[0]])[0].id).toBe(all[1]);
  expect(coverLayoutOptions(0, 'keyboard', undefined, all)[0].id).toBe(all[0]);
  const unused = all.slice(1);
  expect(coverLayoutOptions(1, 'keyboard', undefined, [all[0]])[0].id).toBe(unused[1 % unused.length]);
});

it('prioritizes the square cover crop safe area over reference composition', () => {
  const title = '从机械键盘换到迈从Ace68V2，体验如何';
  const design = formatCoverSkillReply(simulatedCoverReply('PHONE-08', 'phone-back', title), title, { offset: 0, preferred: 'PHONE-08' });
  const { prompt } = coverLayoutImageInput(design, '1:1', true)!;
  expect(prompt).toContain('左右各 12.5% 会被裁掉');
  expect(prompt).toContain('横向 25%–75%');
  expect(prompt).toContain('每行含标点、描边和阴影的实际占宽最多为方图总宽 46%');
  expect(prompt).toContain('完整外轮廓含倾斜后的两端最多占方图总宽 48%');
  expect(prompt).toContain('长标题按语义拆成 3–4 行');
  expect(prompt).toContain('禁止画中画、边框、拼贴、模糊填充');
  expect(prompt).toContain('最终排版硬约束');
  expect(() => validateCoverPromptFormat(prompt, title)).not.toThrow();
});

it('keeps rounded title styling with its sample after renumbering', () => {
  const title = '真我gt8pro收官之作体验夯，售后交给OPPO';
  const prompt = formatCoverSkillReply(simulatedCoverReply('PHONE-04', 'phone-back', title), title, { offset: 0, preferred: 'PHONE-04' });
  expect(prompt).toContain('短而浅的灰影');
  expect(prompt).toContain('第2行：“售后交给OPPO”');
  expect(() => validateCoverPromptFormat(prompt, title)).not.toThrow();
});

it('locks a compatible layout and picks a lifestyle wallpaper only for a front view', () => {
  const title = '一台亮屏手机';
  const reply = simulatedCoverReply('PHONE-05', 'phone-front', title);
  const street = formatCoverSkillReply(reply, title, { offset: 1, wallpaper: 0 });
  const animal = formatCoverSkillReply(reply, title, { offset: 1, wallpaper: 2 });
  expect(street).toContain('单台手机只展示正面');
  expect(street).toContain('晴日街角');
  expect(animal).toContain('睡着的小动物');
  expect(street).not.toContain('蓝色抽象渐变');
  expect(() => formatCoverSkillReply(reply, title, { offset: 0 })).toThrow('轮换顺序不符');
  expect(() => formatCoverSkillReply(simulatedCoverReply('PHONE-05', 'earbuds', title), title,
    { offset: 0, preferred: 'PHONE-05' })).toThrow('与商品品类');
});

it('imports the original Excel title including spaces and existing line breaks', async () => {
  const { utils, write } = await import('xlsx');
  const workbook = utils.book_new();
  const title = ' 真我 GT8，\n售后交给OPPO ';
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([[title, 'https://example.com/product.jpg', '横屏']]), 'Sheet1');
  const file = new File([write(workbook, { type: 'array', bookType: 'xlsx' })], 'cover.xlsx');
  const [row] = await readCoverBatch(file);
  expect(row).toMatchObject({ title, ratio: '4:3' });
  const design = formatCoverSkillReply(simulatedCoverReply('PHONE-01', 'phone-back', title.replace('\n', '')), title, { offset: 0 });
  expect(() => validateCoverPromptFormat(design, title)).not.toThrow();
  expect(() => validateCoverPromptFormat(design, title.trim())).toThrow('只允许断行');
});

it.each(['PHONE-06', 'PHONE-20'])('includes reference-dependent earbud docking in the submitted %s prompt', layout => {
  const title = '华为FreeBuds 7通话降噪实测';
  const reply = {
    ...JSON.parse(simulatedCoverReply(layout, 'earbuds', title)),
    composition: '展示充电盒与实物可见状态',
    product: '橙色开盖耳机盒，正面白色圆环指示灯',
    constraints: '与商品图保持一致',
  };
  const design = formatCoverSkillReply(JSON.stringify(reply), title, { offset: 0, preferred: layout });
  const { prompt } = coverLayoutImageInput(design, '3:4')!;
  expect(prompt).toContain('仓体前缘位于耳柄下段前方并自然遮挡');
  expect(prompt).toContain('耳柄不得贴在仓体外壁');
  expect(prompt).toContain('原图未显示开盖入仓状态时');
  expect(prompt).toContain('耳柄底端按实物深度进入槽内');
  expect(prompt).toContain('指示灯和标识仅按原图可见形状与位置保留');
  expect(prompt).toContain('橙色开盖耳机盒，正面白色圆环指示灯');
  expect(() => validateCoverPromptFormat(prompt, title)).not.toThrow();
});

it('rotates the new camera, earbud and tablet layouts only within compatible categories', () => {
  expect(coverLayoutOptions(0, 'camera').map(item => item.id)).toEqual(['PHONE-15', 'PHONE-17', 'PHONE-18', 'PHONE-36']);
  expect(coverLayoutOptions(0, 'earbuds')[0]?.id).toBe('PHONE-20');
  expect(coverLayoutOptions(20, 'tablet').map(item => item.id)).toEqual(['PHONE-27']);
  expect(coverLayoutOptions(0, 'phone-both').map(item => item.id)).not.toContain('PHONE-20');
});

it('keeps historical cover review on the actual sample after layout numbers change', () => {
  const old = '画幅与构图：PHONE-18｜黑底白字';
  expect(coverResultReferencePath({}, old)).toBe('/cover-layouts/v0.1.0/phone-18.webp');
  const current = '/cover-layouts/v0.2.0/phone-18.webp';
  expect(coverResultReferencePath({ beikeCoverSubmittedReferencePath: current }, old)).toBe(current);
});

it.each([
  ['PHONE-10', '同属正文', '细白字'],
  ['PHONE-13', '连续、平整的暗区', '巨型淡灰背字'],
  ['PHONE-19', '在上一行下方独立排布', '机身保持垂直'],
])('keeps the reviewed legibility and layout fixes for %s', (layout, expected, discarded) => {
  const titleLines = ['外观简约耐看，', '触控灵敏，', '日常通勤使用很省心'];
  const title = titleLines.join('');
  const reply = JSON.parse(simulatedCoverReply(layout, 'phone-back', title));
  reply.titleLines = titleLines.map(text => ({ text, size: '极小', position: '贴近边缘', style: '细白字' }));
  reply.background = '巨型淡灰背字';
  reply.composition = '机身保持垂直';
  const design = formatCoverSkillReply(JSON.stringify(reply), title, { offset: 0, preferred: layout });
  const { prompt } = coverLayoutImageInput(design, '3:4')!;
  expect(prompt).toContain(expected);
  expect(prompt).not.toContain(discarded);
  expect(() => validateCoverPromptFormat(prompt, title)).not.toThrow();
});

it('reuses a paid draft when a canvas round trip strips the selected chat route prefix', () => {
  const selected = { model: 'beike:chat:gemini-route-a', title: '原始 Excel 标题', offset: 4, sourceUrl: 'https://example.com/product.webp' };
  const writer = {
    id: 'row-render-writer', type: 'text-node', content: '已返回的封面提示词',
    settings: { beikeBatchCoverWriter: true, textNodeChatModel: selected.model, beikeCoverSourceUrl: selected.sourceUrl },
  };
  const scene: StudioScene = { nodes: [writer], connections: [], groups: [], strokes: [], textBoxes: [], view: { x: 0, y: 0, zoom: 1 } };
  const canvas = studioNodeToCanvasNode(writer, scene);
  const roundTrip = canvasNodeToStudioNode(canvas, writer).settings as Record<string, unknown>;
  expect(roundTrip.textNodeChatModel).toBe('gemini-route-a');
  const saved = { ...roundTrip, beikeCoverDraftRequest: { ...selected, model: roundTrip.textNodeChatModel } };

  expect(matchesCoverDraft(saved, selected)).toBe(true);
  expect(matchesCoverDraft(saved, { ...selected, model: 'beike:chat:gemini-route-b' })).toBe(false);
  expect(matchesCoverDraft(saved, { ...selected, sourceUrl: 'https://example.com/other.webp' })).toBe(false);
  expect(matchesCoverDraft(saved, { ...selected, offset: 5 })).toBe(false);
  expect(matchesCoverDraft(saved, { ...selected, title: '修改后的标题' })).toBe(false);
  expect(matchesCoverDraft({ ...saved, beikeCoverSourceUrl: undefined }, selected)).toBe(false);
});
