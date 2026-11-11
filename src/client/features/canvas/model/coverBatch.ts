import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import skillPackages from '@shared/domain/assistant/skills/compiledSkillPackages.json';
import type { CanvasNode, StudioScene } from './types';

export const batchCoverSkill = skillPackages.find(skill => skill.id === 'cover-prompt-writer');
export const batchCoverLayouts = Array.from(
  batchCoverSkill?.files.find(file => file.path === 'references/phone-layouts.md')?.content
    .matchAll(/^- \*\*(PHONE-\d{2})｜([^\n]+?)\*\* \[样张\]\((\/cover-layouts\/[^\s)]+)\) (.+)$/gm) ?? [],
  ([, id, name, referencePath, guide]) => ({ id, referencePath, template: `- **${id}｜${name}** ${guide}` }),
);

const coverProfiles = ['phone-front', 'phone-back', 'phone-both', 'earbuds', 'keyboard', 'camera', 'tablet', 'other'] as const;
type CoverProfile = typeof coverProfiles[number];
const nonPhoneLayouts = {
  earbuds: ['PHONE-20', 'PHONE-06', 'PHONE-38'],
  keyboard: ['PHONE-25', 'PHONE-29', 'PHONE-38'],
  camera: ['PHONE-15', 'PHONE-17', 'PHONE-18', 'PHONE-36'],
  tablet: ['PHONE-27'],
  other: ['PHONE-29', 'PHONE-32', 'PHONE-38'],
};
const dedicatedLayouts = new Set(['PHONE-15', 'PHONE-17', 'PHONE-18', 'PHONE-20', 'PHONE-27', 'PHONE-36']);
const phoneLayouts = batchCoverLayouts.filter(layout => !dedicatedLayouts.has(layout.id)).map(layout => layout.id);

export const coverEarbudDockingRule =
  '以 @图片1 的耳机和充电盒为唯一结构依据，保持原图开合状态、视角、左右耳朝向和入仓姿态；版式只借用背景与标题，不改变商品结构。' +
  '原图为开盖且双耳在仓内时，只呈现一只充电盒和左右各一只耳机，每只耳机对应自己的充电槽，不额外复制或漂浮。' +
  '有耳柄时，耳柄底端按实物深度进入槽内，仓体前缘位于耳柄下段前方并自然遮挡，耳柄不得贴在仓体外壁、跨过槽沿或悬在槽口上方；' +
  '耳机头部与对应槽口贴合并保留真实接触阴影，两个槽口独立清晰，不能穿模、错槽或融为一体。' +
  '无耳柄时按原图保持耳机与各自凹槽的贴合；指示灯和标识仅按原图可见形状与位置保留。' +
  '原图未显示开盖入仓状态时，不推测内部结构、不强制开盖或添加耳机。';

export function coverLayoutOptions(offset: number, profile: CoverProfile, previous?: string, used: string[] = []) {
  const front = ['PHONE-33', 'PHONE-05'];
  const ids = profile === 'phone-front' ? front
    : profile === 'phone-back' ? phoneLayouts.filter(id => id !== 'PHONE-05')
    : profile === 'phone-both' ? phoneLayouts
    : nonPhoneLayouts[profile];
  const available = ids.filter(id => batchCoverLayouts.some(layout => layout.id === id));
  const unused = available.filter(id => !used.includes(id));
  const pool = unused.length ? unused : available;
  if (!pool.length) return [];
  const previousIndex = previous ? pool.indexOf(previous) : -1;
  const start = (previousIndex >= 0 ? previousIndex + 1 : offset) % pool.length;
  const order = [...pool.slice(start), ...pool.slice(0, start)];
  return order.flatMap(id => batchCoverLayouts.filter(item => item.id === id));
}

export function coverLayoutInstructions(offset: number, preferred?: string, previous?: string, used: string[] = []) {
  const compatible = coverProfiles.map(profile => {
    const layouts = coverLayoutOptions(offset, profile, previous, used);
    return [profile, preferred ? layouts.find(item => item.id === preferred) : layouts[0]] as const;
  });
  const choices = compatible.map(([profile, layout]) => `${profile}：${layout?.id || '不兼容'}`).join('\n');
  const guides = [...new Set(compatible.flatMap(([, layout]) => layout ? [layout.template] : []))];
  return [
    '先观察商品图，填写 profile。phone-front/phone-back 表示手机只看得到对应一面，phone-both 表示同一款手机有两面资料。earbuds 是耳机，keyboard 是键盘，camera 是相机或云台，tablet 是平板，other 是其他。标题和宣传字不能作为判断视角的依据。',
    preferred ? `使用指定版式 ${preferred}，仅在该 profile 有对应编号时使用，不兼容时返回 error。`
      : '填写已识别 profile 对应的唯一版式。候选已在兼容池内完成轮换。',
    choices,
    guides.join('\n'),
    '非手机按版式的文字、机位及背景迁移，省略手机结构。不要要求缺失的包装、屏幕内容或配件。构图、外观和保真段始终使用同一个主体和同一可见面。光线段只写一句，集中写光向、局部反光和接触影。',
  ].join('\n\n');
}

const coverWallpapers = [
  '晴日街角的玻璃店面与树影，照片质感',
  '窗边绿植与午后木桌，柔和自然色',
  '暖色室内里睡着的小动物，保留墙面留白',
  '有远山和低饱和云层的旅行照片',
  '纸质手绘小屋和植物，克制的暖色插画',
];

export function isBatchCover(settings: Record<string, unknown>) {
  return settings.beikeCoverExportRatio === '3:4' || settings.beikeCoverExportRatio === '4:3';
}

export function coverReviewState(settings: Record<string, unknown>, taskId: unknown, url: string) {
  if (isBatchCover(settings) || !taskId || !url || settings.beikeCoverReviewTaskId !== taskId) return;
  if (settings.beikeCoverReviewUrl !== url) return 'pending';
  const review = settings.beikeCoverReview as { taskId?: string; url?: string; decision?: string } | undefined;
  return review?.taskId === taskId && review.url === url &&
    (review.decision === 'approved' || review.decision === 'rejected') ? review.decision : 'pending';
}

const coverTextOperationPrefix = `cover-${batchCoverSkill?.version.replace(/\./g, '-')}-`;
export const newCoverTextOperationId = () => coverTextOperationPrefix + crypto.randomUUID();
export const isCurrentCoverTextOperation = (id: unknown) =>
  typeof id === 'string' && id.startsWith(coverTextOperationPrefix);

type CoverDraftInputs = {
  model: string;
  sourceUrl: string;
  offset: number;
  title?: string;
  used?: string[];
};

export function matchesCoverDraft(settings: Record<string, unknown>, inputs: CoverDraftInputs) {
  const draft = settings.beikeCoverDraftRequest as Partial<CoverDraftInputs> | undefined;
  // The studio adapter stores the same route without the beike:chat: prefix.
  const routeId = (value: unknown) => typeof value === 'string' ? value.replace(/^beike:chat:/, '') : '';
  return Boolean(inputs.sourceUrl && routeId(inputs.model) && draft &&
    routeId(draft.model) === routeId(inputs.model) &&
    draft.offset === inputs.offset && draft.title === inputs.title &&
    JSON.stringify(draft.used ?? []) === JSON.stringify(inputs.used ?? []) &&
    draft.sourceUrl === inputs.sourceUrl && settings.beikeCoverSourceUrl === inputs.sourceUrl);
}

const coverLayoutHeading = /^画幅与构图[：:][ \t]*(PHONE-\d{2})\b/m;
export const coverLayoutId = (design: string) => coverLayoutHeading.exec(design)?.[1];

export function coverWorkflowRole(node: CanvasNode) {
  return (node.studioRaw?.settings as Record<string, unknown> | undefined)?.beikeCoverStage;
}

export function coverLinkedNodes(node: CanvasNode, nodes: readonly CanvasNode[]) {
  return (node.referenceNodeIds || []).flatMap(id => {
    const source = nodes.find(item => item.id === id);
    return source ? [source] : [];
  });
}

function coverRenderSource(nodes: readonly CanvasNode[]) {
  return nodes.find(source => source.type === 'drawing' && source.generationKind === 'image');
}

export function coverLayoutPreview(node: CanvasNode, nodes: readonly CanvasNode[]) {
  const linked = coverLinkedNodes(node, nodes);
  const render = coverRenderSource(linked);
  const renderSettings = (render?.studioRaw?.settings as Record<string, unknown> | undefined) ?? {};
  const submitted = typeof renderSettings.beikeCoverSubmittedPrompt === 'string' ? renderSettings.beikeCoverSubmittedPrompt : '';
  const writer = linked.find(source => source.studioSubType === 'cover-prompt-writer');
  const submittedLayout = coverLayoutId(submitted);
  if (render?.imageUrl || renderSettings.beikeCoverReviewUrl) {
    return { url: render?.missingMedia ? undefined : render?.imageUrl, generated: true,
      layout: render?.status === 'success' ? submittedLayout : undefined };
  }
  const layout = (render?.status === 'generating' ? submittedLayout : undefined) ?? coverLayoutId(writer?.content || '');
  const style = linked.find(source => source.type === 'image' && source.imageUrl && !source.missingMedia);
  return { url: batchCoverLayouts.find(item => item.id === layout)?.referencePath ?? style?.imageUrl, generated: false, layout };
}

export function coverComparisonInputs(node: CanvasNode, nodes: readonly CanvasNode[]) {
  const render = coverRenderSource(coverLinkedNodes(node, nodes));
  const resultUrl = render && render.status !== 'generating' && !render.missingMedia ? render.imageUrl : undefined;
  return { render, resultUrl, productUrl: resultUrl && render ? coverSubmittedProductUrl(render) : undefined };
}

export function coverSubmittedProductUrl(node: CanvasNode) {
  const settings = node.studioRaw?.settings as Record<string, unknown> | undefined;
  const submitted = settings?.beikeCoverSubmittedSourceUrl;
  if (!node.taskId || !node.imageUrl || settings?.beikeCoverReviewTaskId !== node.taskId ||
      settings.beikeCoverReviewUrl !== node.imageUrl || typeof submitted !== 'string') return;
  return submitted || undefined;
}

export function coverReviewSource(node: CanvasNode, nodes: readonly CanvasNode[]) {
  const linked = coverLinkedNodes(node, nodes);
  const comparison = linked.find(source => coverWorkflowRole(source) === 'compare');
  return comparison ? coverComparisonInputs(comparison, nodes).render : coverRenderSource(linked);
}

export function coverResultReferencePath(settings: Record<string, unknown>, prompt: string) {
  if (typeof settings.beikeCoverSubmittedReferencePath === 'string') return settings.beikeCoverSubmittedReferencePath;
  // Before the 38-image catalog, result records did not store the sample path.
  const id = coverLayoutId(prompt)?.slice(-2);
  if (!id || Number(id) < 1 || Number(id) > 30) return;
  const ext = ['19', '21', '23', '28', '29', '30'].includes(id) ? 'jpg'
    : Number(id) >= 20 ? 'png' : 'webp';
  return `/cover-layouts/v0.1.0/phone-${id}.${ext}`;
}

export const coverSquareSafeArea = [
  '横屏任务输出完整 1:1 方图，平台会从方图中心裁出 3:4 竖图：左右各 12.5% 会被裁掉。标题和完整商品放在中央横向 25%–75%、纵向 10%–90% 的区域内。',
  '标题使用比样张小一号的字，居中排在商品上方。每行含标点、描边和阴影的实际占宽最多为方图总宽 46%，长标题按语义拆成 3–4 行，保持型号及标点完整，必要时继续缩小字号。',
  '商品整体按比例缩小一档并居中。完整外轮廓含倾斜后的两端最多占方图总宽 48%，较高的商品同时控制高度，给标题留出独立空间。',
  '背景自然铺满整张方图，左右保留连续场景。禁止画中画、边框、拼贴、模糊填充和缩小整张图片。样张或正文中的大小和位置与安全区冲突时，以安全区为准。',
].join(' ');

export function coverLayoutImageInput(design: string, ratio: string, squareSafeArea = false) {
  const heading = coverLayoutHeading.exec(design);
  const layout = heading && batchCoverLayouts.find(item => item.id === heading[1]);
  if (!heading || !layout) return;
  const guide = layout.template.replace(/^- \*\*/, '').replace('**', '');
  const { referencePath } = layout;
  const referenceRole = squareSafeArea
    ? '只借用样张的字体风格、色调、布光和背景材质。按中央竖幅重新构图，画面边缘只保留自然延续的背景。'
    : '对齐其主体大小与位置、机位与裁切、背景分区、文字锚点与字形层级、主光和局部反光。';
  const roles = [
    '@图片1 是唯一商品外观依据：配色、轮廓、镜头/部件与标识均以它为准。只展示所选版式需要的可见角度。',
    '@图片2 是版式样张。' + referenceRole + '禁止带入样张商品、商品配色、标题、账号、水印或未提供的包装与配件。',
    `输出画幅以当前任务的 ${ratio} 为准。${squareSafeArea ? coverSquareSafeArea : '横竖转换时重排背景和留白，保持样张的空间关系、文字层级及关键部件；仅保留版式指定的有意裁切。'}上图文字仅使用七段设计中「标题与排版」逐行指定的文案。`,
    squareSafeArea ? '标题放在中央区域上方，完整商品放在其下，两者水平居中并留出间距。' : '本版式固定特征（商品品类和可见面以正文为准）：' + guide,
    '拍成自然实拍的一帧。光线保持局部、简洁。参考里的手机正反视图、界面或配件不得覆盖本次选定的商品与可见面。',
  ].join('\n');
  let body = design.slice(heading.index + heading[0].length).replace(/^[｜|]/, '').trimStart();
  if (squareSafeArea) {
    const background = /^背景[：:]/m.exec(body);
    if (background) body = body.slice(background.index);
    body = body.replace(
      /^(第\d+行：“[^\r\n]*”｜)字号：[^\r\n]*?｜位置：[^\r\n]*?｜样式：/gm,
      '$1字号：较样张缩小一号，按实际行宽调整并保留主次｜位置：中央安全区内居中，按行顺序从上到下｜样式：',
    );
  }
  return { referencePath, prompt: `画幅与构图：${layout.id}｜\n${roles}\n${body}${squareSafeArea ? `\n最终排版硬约束：${coverSquareSafeArea}` : ''}` };
}

export function normalizeBatchCoverPrompt(value: string, expected: string, exactTitle?: string): string {
  const body = formatCoverSkillReply(value, exactTitle);
  const lines = normalizeCoverHeadings(body).split(/\r?\n/);
  const clean = (line: string) => line.replace(/[*`]/g, '').replace(/^\s*(?:#{1,6}\s*|[-•]\s+)/, '').trim();
  const refusal = lines.map(clean).find(line => /^NEED_INPUT(?:\s|[:：]|$)/i.test(line));
  if (refusal) throw new Error(refusal);
  const heading = lines.findIndex(line => /^画幅(?:与构图)?\s*[:：]/.test(clean(line)));
  if (!body) throw new Error(`版式 ${expected} 的绘图提示词为空`);
  if (heading < 0) return `画幅与构图：${expected}\n${body}`;
  const composition = clean(lines[heading]).replace(/^画幅(?:与构图)?\s*[:：]\s*/, '');
  const layoutLabel = /^[（(【「]?\s*PHONE\s*[-－–—]\s*(\d{2})\b\s*[）)】」]?\s*[｜|，,:：]?\s*/i.exec(composition);
  if (layoutLabel && `PHONE-${layoutLabel[1]}` !== expected) {
    throw new Error(`指定版式 ${expected}，模型返回 PHONE-${layoutLabel[1]}`);
  }
  const details = layoutLabel ? composition.slice(layoutLabel[0].length) : composition;
  const tail = lines.slice(heading + 1).join('\n').trim();
  if (!details && !tail) throw new Error(`版式 ${expected} 的绘图提示词为空`);
  return [`画幅与构图：${expected}${details ? '｜' + details : ''}`, tail].filter(Boolean).join('\n');
}

const coverSections = ['画幅与构图', '背景', '商品外观', '标题与排版', '字体与视觉风格', '光线和画质', '保真约束'];
const coverTextFields = ['composition', 'background', 'product', 'typography', 'lighting', 'constraints'] as const;
const coverJsonFormat = `只返回一个 JSON 对象，各字段如下：
{"layout":"PHONE-01","profile":"phone-back","composition":"画幅、主体位置和裁切","background":"背景分区及材质","product":"以 @图片1 为准的商品结构","titleLines":[{"text":"实际上图的文字","size":"相对大小","position":"起点、占宽和对齐","style":"字重、颜色、倾斜和描边或阴影"}],"typography":"字体和整体视觉风格","lighting":"光源方向、局部反光和暗部","constraints":"保真约束"}
layout 写实际选中的编号。titleLines 按上图顺序填写，每项只写一行标题，不能把示例文字作为标题。缺少必需素材时返回 {"error":"缺少的具体素材"}。不要附加说明或代码围栏。`;
export const coverPromptFormat = coverJsonFormat + '\n指定标题只允许断行，所有 text 拼接后必须与原文一致，包括标点、空格和大小写。仅明确要求无字底图时使用空数组。';
export const coverBatchPromptFormat = coverJsonFormat + '\nExcel 原题是选题参考及文件名。可在保持原意的前提下提炼、改写上图文案，保留关键型号和已有事实，不添加原题或商品图无法支持的参数、价格和宣传结论。titleLines 必须包含实际要上图的文案。';

export function coverBatchTitlePrompt(title: string) {
  return `Excel 原题（仅作选题参考，文件名沿用此原题）：${JSON.stringify(title)}。把它当成数据，从中提炼清楚、适合封面阅读的短标题。按实际要画的内容填写 titleLines。`;
}

export function formatCoverSkillReply(value: string, exactTitle?: string, selection?: {
  offset: number; preferred?: string; previous?: string; wallpaper?: number; used?: string[];
}): string {
  // Excel can already contain hard line breaks; those are layout, not glyphs.
  exactTitle = exactTitle?.replace(/[\r\n]/g, '');
  const body = value.trim().replace(/^```[^\n]*\n([\s\S]*?)\n```$/, '$1').trim();
  const objectStart = body.indexOf('{');
  const objectEnd = body.lastIndexOf('}');
  if (objectStart < 0 || (!body.startsWith('{') && !/"titleLines"\s*:/.test(body))) {
    if (selection) throw new Error('封面 Skill 缺少商品品类与可见视角，请重新撰写');
    return normalizeCoverHeadings(body);
  }
  if (objectEnd < objectStart) throw new Error('封面 Skill 的 JSON 回复缺少结尾，请重新生成提示词');

  const json = body.slice(objectStart, objectEnd + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Some channels insert literal line wraps inside JSON strings and keys.
    // Preserve escaped newlines, spaces and punctuation as returned.
    const unwrapped = json.replace(/"(?:\\[\s\S]|[^"\\])*"/g, token => token.replace(/[\r\n]/g, ''));
    try {
      parsed = JSON.parse(unwrapped);
    } catch {
      throw new Error('封面 Skill 的 JSON 语法无效，无法安全恢复设计正文');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('封面 Skill 回复不是 JSON 对象');
  const reply = parsed as Record<string, unknown>;
  if (typeof reply.error === 'string' && reply.error.trim()) throw new Error('封面素材不足：' + reply.error.trim());
  const { layout, titleLines } = reply;
  if (typeof layout !== 'string' || !/^PHONE-\d{2}$/.test(layout)) throw new Error('封面 Skill 缺少有效版式编号');
  const field = (key: string) => {
    const content = reply[key];
    if (typeof content !== 'string' || !content.trim()) throw new Error(`封面 Skill 缺少 ${key} 内容`);
    return content.trim();
  };
  if (!Array.isArray(titleLines)) throw new Error('封面 Skill 缺少逐行标题');
  let titleRows = titleLines.map((line: unknown, index) => {
    if (!line || typeof line !== 'object') throw new Error(`第 ${index + 1} 行标题格式无效`);
    const { text, size, position, style } = line as Record<string, unknown>;
    if (typeof text !== 'string' || !text.trim() || /[\r\n]/.test(text) ||
        ![size, position, style].every(part => typeof part === 'string' && part.trim())) {
      throw new Error(`第 ${index + 1} 行标题缺少原文、字号、位置或样式`);
    }
    return { text, size, position, style };
  });
  // Recover only source punctuation dropped at a line break. If any other
  // character differs, leave the reply untouched for the exact-title check.
  const restored: string[] = [];
  if (exactTitle !== undefined && titleRows.map(row => row.text).join('') !== exactTitle) {
    let offset = 0;
    for (const [index, { text }] of titleRows.entries()) {
      if (!exactTitle.startsWith(text, offset)) break;
      const start = offset;
      offset += text.length;
      const next = titleRows[index + 1]?.text;
      while (next && !exactTitle.startsWith(next, offset) && /\p{P}/u.test(exactTitle.charAt(offset))) offset++;
      restored.push(exactTitle.slice(start, offset));
    }
  }
  if (restored.length === titleRows.length && restored.join('') === exactTitle) {
    titleRows = titleRows.map((row, index) => ({ ...row, text: restored[index] }));
  }
  const fullTitle = titleRows.map(row => row.text).join('');
  if (selection && layout === 'PHONE-04') {
    const split = /[，,](?=.{3,}$)/.exec(fullTitle);
    if (split && titleRows[0]) {
      const end = split.index + 1;
      const base = titleRows[0];
      titleRows = [{ ...base, text: fullTitle.slice(0, end) }, { ...base, text: fullTitle.slice(end) }];
    }
  }
  let [composition, background, product, typography, lighting, constraints] = coverTextFields.map(field);
  const profile = coverProfiles.find(item => item === reply.profile);
  if (selection) {
    if (!profile) throw new Error('封面 Skill 缺少商品品类与可见视角，请重新撰写');
    const options = coverLayoutOptions(selection.offset, profile, selection.previous, selection.used);
    const expected = selection.preferred || options[0]?.id;
    if (layout !== expected || !options.some(item => item.id === layout)) {
      throw new Error(`所选版式 ${layout} 与商品品类、可见视角或本次轮换顺序不符`);
    }
    const phone = profile.startsWith('phone-');
    const front = phone && (layout === 'PHONE-05' || profile === 'phone-front');
    const protectedLayout = phone && ['PHONE-04', 'PHONE-08', 'PHONE-09', 'PHONE-10', 'PHONE-13', 'PHONE-19'].includes(layout);
    if (phone) {
      const side = front ? '正面' : '背面';
      const orientation = `单台手机只展示${side}。手持时指腹贴住侧框，其余手指从背后自然支撑。`;
      const wallpaper = front ? coverWallpapers[selection.wallpaper ?? Math.floor(Math.random() * coverWallpapers.length)] : undefined;
      product = front
        ? `依据 @图片1 的正面保留机身比例、边框、圆角和开孔。屏幕点亮，壁纸为${wallpaper}，覆盖显示区并随屏幕透视。界面只留必要的锁屏元素。`
        : '依据 @图片1 的背面保留机身比例、颜色、背板材质、镜头和闪光灯的形状、数量、位置及可辨认标识。';
      constraints = `只保留手机${side}及必要侧框，并排商品资料只取这一面，各分格只用该面或其局部。逐字使用确认标题，保留可辨认的实机标识。`;
      composition = `${orientation} 按所选版式的机位、主体占位及取景构图。`;
    }
    if (profile === 'earbuds') {
      constraints = `商品的开闭状态和入仓关系优先于构图与样张。 ${coverEarbudDockingRule} ${constraints}`;
    }
    if (protectedLayout) {
      background = layout === 'PHONE-13'
        ? '褐色草地焦外，上下暗边。标题背后使用连续、平整的暗区。排版文字只使用本次标题。'
        : '保持版式的背景材质与前后景分界，沿用其虚实关系。';
      lighting = '按版式主光保留局部反光和握点或台面的接触影。';
      typography = '按版式与逐行排版设定字形和层级，文字与关键商品部位分开。';
    }
  }
  const lines = titleRows.map(({ text, size, position, style }, index) => {
    const main = index === 0;
    if (selection && layout === 'PHONE-04') {
      size = main ? '字高约画高 5%，长行适度缩小，留出两侧边距' : '字高约画高 4%，次于主行';
      position = main ? '顶部标题区居中，从 y7% 起' : '同一标题组内居中，保持紧凑且清晰的行距';
      style = '白色圆头粗黑，短而浅的灰影，笔画边缘清楚';
    } else if (selection && layout === 'PHONE-09') {
      size = main ? '首格内主行，约占格高 17%' : '首格内次行，略小于主行';
      position = '仅在首格左下，左对齐，保留边距';
      style = '白色粗方黑，短深影，紧行距';
    } else if (selection && layout === 'PHONE-10') {
      size = main ? '正文大字' : '同属正文，字高略小于首行，缩略图中保持清晰';
      position = main ? '黑色标题带左上，左对齐' : '在上一行下方，左齐，预留独立行位和清楚行距';
      style = index === 1 ? '白色方黑粗字，可仅将一个原文完整词用橙色强调' : '白色方黑粗字';
    } else if (selection && layout === 'PHONE-13') {
      size = main ? '标题大字' : '正文略小，保持清楚可读';
      position = main ? '暗区上部靠左，留出安全边距' : '在右上正文区逐行向下，留独立行位和右侧安全边距';
      style = '白色粗黑，短暗影，标题背后保持纯暗区';
    } else if (selection && layout === 'PHONE-19') {
      size = main ? '较大主行' : '白色正文略小于主行，保持可读';
      position = main ? '沿横握机身上沿向右上扬'
        : index === 1 ? '置于机身下沿之外第一行，避开镜头及手指' : '在上一行下方独立排布，留出清楚行距';
      style = main ? '粗黄色斜字，短暗影' : '粗白斜字，短暗影';
    }
    return `第${index + 1}行：“${text}”｜字号：${size}｜位置：${position}｜样式：${style}`;
  });
  const sections = [layout + '｜' + composition, background, product, '\n' + (lines.join('\n') || '无上图文字'), typography, lighting, constraints];
  return coverSections.map((heading, index) => heading + '：' + sections[index]).join('\n\n');
}

function normalizeCoverHeadings(prompt: string) {
  const headings = new RegExp(
    `^\\s*(?:#{1,6} +)?(?:\\*\\*)?(?:【)?(${coverSections.join('|')})(?:】)?(?:\\*\\*)? *(?:[：:] *(?:\\*\\*)?|(?![^\\r\\n]))`,
    'gm',
  );
  return prompt.replace(headings, '$1：');
}

export function validateCoverPromptFormat(prompt: string, exactTitle?: string, requireTitle = false) {
  prompt = normalizeCoverHeadings(prompt);
  const sections = [...prompt.matchAll(/^(画幅与构图|背景|商品外观|标题与排版|字体与视觉风格|光线和画质|保真约束)[：:]/gm)];
  if (sections.map(match => match[1]).join() !== coverSections.join()) throw new Error('封面提示词须按固定顺序包含七段');
  const bodies = sections.map((match, index) => prompt.slice(match.index! + match[0].length, sections[index + 1]?.index ?? prompt.length).trim());
  if (bodies.some(body => !body)) throw new Error('封面提示词存在空段落');
  if (exactTitle === undefined && bodies[3] === '无上图文字') {
    if (requireTitle) throw new Error('批量封面缺少上图文案');
    return;
  }
  const lines = bodies[3].split(/\r?\n(?=[ \t]*(?:[-•][ \t]*)?(?:\*\*)?第\s*\d+\s*行)/);
  const titles = lines.map((line, index) => {
    const row = line.trim().replace(/^(?:[-•]\s*)?(?:\*\*)?/, '');
    const match = row.match(/^第\s*(\d+)\s*行(?:\*\*)?[：:]\s*(?:“(.+)”|「(.+)」|"(.+)")\s*[｜|]?\s*字号[：:]\s*([\s\S]+?)\s*[｜|]?\s*位置[：:]\s*([\s\S]+?)\s*[｜|]?\s*样式[：:]\s*([\s\S]+)$/);
    if (!match || Number(match[1]) !== index + 1 || match.slice(5).some(part => !part.trim())) {
      throw new Error('标题须逐行填写原文、字号、位置和样式');
    }
    const title = match[2] ?? match[3] ?? match[4];
    if (!title.trim()) throw new Error('上图文案不能为空');
    return title;
  });
  if (exactTitle !== undefined && titles.join('') !== exactTitle.replace(/[\r\n]/g, '')) throw new Error('封面标题与原文不一致，只允许断行');
}

export const coverSizes = { '3:4': [720, 960], '4:3': [960, 720] } as const;
type Ratio = keyof typeof coverSizes;
type CoverRow = { row: number; title: string; url: string; ratio: Ratio };

export function coverBatchGenerationRatio(ratio: Ratio) {
  return ratio === '4:3' ? '1:1' : '3:4';
}

export function coverBatchFileName(title: string, suffix = '') {
  // eslint-disable-next-line no-control-regex -- ZIP entry names must exclude ASCII control characters.
  const stem = title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || '封面';
  const encoder = new TextEncoder();
  const limit = 255 - encoder.encode(suffix + '.png').length;
  let size = 0;
  let name = '';
  for (const character of stem) {
    size += encoder.encode(character).length;
    if (size > limit) break;
    name += character;
  }
  return (name.replace(/[. ]+$/, '') || '封面') + suffix + '.png';
}

export type CoverBatch = { name: string; ids: string[]; runId?: string };

export function coverBatchSource(scene: StudioScene | undefined, projectId: string) {
  return scene?.nodes.find(node => node.id === projectId + '-product') ??
    scene?.nodes.find(node => node.id.endsWith('-product') && node.type === 'input-image' &&
      (node.settings as Record<string, unknown> | undefined)?.beikeCoverSharedInput === true);
}

export function getCoverBatch(node?: StudioScene['nodes'][number]): CoverBatch | undefined {
  const batch = (node?.settings as Record<string, unknown> | undefined)?.beikeCoverBatch as CoverBatch | undefined;
  return Array.isArray(batch?.ids) && batch.ids.length ? batch : undefined;
}

const coverBatchRowId = /^cover-[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}-\d+-(?:ref|render)$/i;
const coverBatchSaveId = /^cover-[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}-save$/i;

/** Batch jobs keep their input graph for execution and recovery. Their UI lives in the batch panel. */
export function hideCoverBatchNodes(scene: StudioScene): StudioScene {
  let changed = false;
  const nodes = scene.nodes.map(node => {
    const settings = (node.settings as Record<string, unknown> | undefined) ?? {};
    const batchWriter = node.type === 'text-node' && settings.beikeBatchCoverWriter === true && node.id.endsWith('-render-writer');
    const batchSave = node.type === 'local-save' && coverBatchSaveId.test(node.id);
    if (settings.beikeLayerHidden === true || (!batchWriter && !batchSave && !coverBatchRowId.test(node.id))) return node;
    changed = true;
    return { ...node, settings: { ...settings, beikeLayerHidden: true } };
  });
  return changed ? { ...scene, nodes } : scene;
}

export async function readCoverBatch(file: File): Promise<CoverRow[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Excel 文件不能超过 5 MB');
  const { read, utils } = await import('xlsx');
  const workbook = read(await file.arrayBuffer(), { sheets: 'Sheet1', sheetRows: 502 });
  const sheet = workbook.Sheets.Sheet1;
  if (!sheet) throw new Error('找不到 Sheet1');
  const cells = utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0, blankrows: true });
  const value = (v: unknown) => typeof v === 'string' ? v.trim() : '';
  const isLink = (v: string) => {
    try { const url = new URL(v); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  };
  const rows = cells.flatMap((line, i) => {
    const [a, b, c] = [value(line[0]), value(line[1]), value(line[2])];
    if (!line.slice(0, 3).some(v => v != null && String(v).trim())) return [];
    if (i === 0 && /^(横竖屏|比例|画幅|方向)$/.test(c)) return [];
    const ratio: Ratio | undefined = /^(横(屏|版)?|4[:：]3|960\s*[x×*]\s*720)$/i.test(c) ? '4:3'
      : /^(竖(屏|版)?|3[:：]4|720\s*[x×*]\s*960)$/i.test(c) ? '3:4' : undefined;
    if (isLink(a) === isLink(b) || !a || !b || !ratio) throw new Error(`Sheet1 第 ${i + 1} 行：请检查标题、HTTP(S) 图片链接及横竖屏`);
    return [{ row: i + 1, title: (isLink(a) ? line[1] : line[0]) as string, url: isLink(a) ? a : b, ratio }];
  });
  if (!rows.length || cells.length > 501) throw new Error('Sheet1 需要 1–500 条封面数据');
  return rows;
}

export function appendCoverBatch(scene: StudioScene, sourceId: string, name: string, rows: CoverRow[], model?: unknown): StudioScene {
  const batch = 'cover-' + crypto.randomUUID();
  const nodes = [...scene.nodes];
  const connections = [...scene.connections];
  const link = (from: string, to: string) => connections.push({ id: from + ':' + to, from, to });
  const ids = rows.map(row => {
    const id = batch + '-' + row.row;
    const height = row.ratio === '4:3' ? 340 : 453;
    const product = id + '-ref';
    const image = id + '-render';
    const fileName = coverBatchFileName(row.title);
    nodes.push(
      { id: product, type: 'input-image', x: 0, y: 0, width: 300, height: 250, nodeName: row.title, content: row.url, imageUrl: row.url, settings: { mediaType: 'image', beikeOriginalFileName: fileName } },
      { id: image, type: 'gen-image', x: 0, y: 0, width: 340, height, nodeName: row.title,
        prompt: `制作一张 ${coverBatchGenerationRatio(row.ratio)} 商品封面。根据 @图片1 保留商品外观。${coverBatchTitlePrompt(row.title)}`,
        settings: { model, ratio: coverBatchGenerationRatio(row.ratio), batchCount: 1, beikeRequiredInputs: [product], beikeCoverExportRatio: row.ratio, beikeCoverTitle: row.title, beikeOriginalFileName: fileName } },
    );
    link(product, image);
    return image;
  });
  return hideCoverBatchNodes({ ...scene, connections, nodes: nodes.map(n => n.id === sourceId
    ? { ...n, settings: { ...n.settings as object, beikeCoverBatch: { name, ids } } } : n) });
}

export async function renderCoverPng(url: string, ratio: Ratio | '1:1', options?: { requireSquare?: boolean }) {
  const image = await createImageBitmap(await fetchMediaBlob(url));
  try {
    if (options?.requireSquare && image.width !== image.height) throw new Error('横屏封面生成的图片不是方图，无法无边框保存，请重新生成');
    const squareSize = Math.max(image.width, image.height);
    const [width, height] = ratio === '1:1' ? [squareSize, squareSize] : coverSizes[ratio];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建封面导出画布');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    const scale = Math.min(width / image.width, height / image.height);
    const w = image.width * scale, h = image.height * scale;
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('封面导出失败')), 'image/png'));
  } finally { image.close(); }
}


export async function downloadCoverBatchZip(workbookName: string, mediaItems: { title: string; url: string; referenceUrl?: string; ratio?: unknown; layout?: unknown }[]) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const names = new Set<string>();
  const rows = [['标题', '图片链接', '比例', '使用版式', '成品文件']];
  for (const item of mediaItems) {
    let name = coverBatchFileName(item.title);
    for (let suffix = 2; names.has(name.toLowerCase()); suffix++) {
      name = coverBatchFileName(item.title, ` (${suffix})`);
    }
    names.add(name.toLowerCase());
    zip.file(name, await fetchMediaBlob(item.url));
    rows.push([item.title, item.referenceUrl || '', String(item.ratio || ''),
      typeof item.layout === 'string' ? item.layout : '未记录', name]);
  }
  const archive = workbookName.replace(/\.xlsx?$/i, '');
  const { utils, write } = await import('xlsx');
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), 'Sheet1');
  zip.file('封面明细.xlsx', write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  await saveToDownloadDir(archive + '.zip', await zip.generateAsync({ type: 'blob' }));
}
