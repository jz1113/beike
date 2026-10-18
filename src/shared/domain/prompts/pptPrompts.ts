export type PptLanguage = 'zh' | 'en' | 'ja' | 'auto';
export type PptAspectRatio = '16:9' | '4:3' | '3:4' | '9:16';
export type PptDetailLevel = 'concise' | 'default' | 'detailed';

export interface PptOutlinePage {
  pageIndex: number;
  title: string;
  takeaway?: string;
  points: string[];
  visualDescription?: string;
  layoutSuggestion?: string;
  part?: string;
}

export const PPT_LANGUAGE_CONFIG: Record<PptLanguage, { name: string; instruction: string; pptText: string }> = {
  zh: {
    name: '中文',
    instruction: '请使用全中文输出。',
    pptText: 'PPT文字请使用全中文。',
  },
  ja: {
    name: '日本語',
    instruction: 'すべて日本語で出力してください。',
    pptText: 'PPTのテキストは全て日本語で出力してください。',
  },
  en: {
    name: 'English',
    instruction: 'Please output all in English.',
    pptText: 'Use English for PPT text.',
  },
  auto: {
    name: '自动',
    instruction: '',
    pptText: '',
  },
};

export const PPT_DETAIL_SPECS: Record<PptDetailLevel, string> = {
  concise: '文字极致地压缩和精简，每条要点用一个核心词语或数据代替，例如效率↑80%。',
  default: '清晰明了，每条要点控制在15-20字以内，优先使用短语而非完整句子；落地到页面的文字建议在2-6句之内，避免冗长和复杂表述，为演示服务，而不是代替演讲人叙述。',
  detailed: '忠于原文的基础上做到内容详实，逻辑清晰，有充分的数据与论证细节。',
};

/** 构建生成论断式大纲的 Prompt */
export function buildOutlinePrompt(options: {
  ideaPrompt?: string;
  outlineText?: string;
  language?: PptLanguage;
  requirements?: string;
  referenceFilesSummary?: string;
}): string {
  const lang = options.language || 'zh';
  const langConfig = PPT_LANGUAGE_CONFIG[lang];

  const sourceContent = options.outlineText
    ? `用户提供的大纲/资料：\n${options.outlineText}`
    : `用户核心主题/想法：\n${options.ideaPrompt || '精美商业演讲演示文稿'}`;

  const filesBlock = options.referenceFilesSummary ? `\n<reference_materials>\n${options.referenceFilesSummary}\n</reference_materials>\n` : '';
  const extraReq = options.requirements ? `\n额外设计与内容要求：\n${options.requirements}\n` : '';

  return `你是一位顶级演示文稿架构师与麦肯锡级商业顾问。
请根据用户提供的输入，生成一份结构精炼、故事线清晰的论断式（assertion-evidence）PPT大纲。

${sourceContent}
${filesBlock}${extraReq}

## 核心设计规范（必须严格执行）：
1. **论断式标题规则（Takeaway rule）**：
   - 对于正文内容页，标题必须是**具有论断性的一句话结论**（例如：“算力瓶颈而非算法停滞是历次AI寒冬的根因”），坚决不要使用泛泛的话题词（例如禁止使用：“AI寒冬回顾”）。
   - 必须陈述结论本身，给出笃定的判断或洞察。
2. **证据支撑（Evidence points）**：
   - 每页紧跟 2~4 条支撑要点，提供具体数据、案例机制或对比事实，论证标题的结论。
3. **结构规范**：
   - 第 1 页必须是**封面页**，标题醒目精炼，要点写明副标题与主讲人信息；
   - 若 PPT 较长（超过 5 页），必须采用分章节（Part）模式：封面 -> # Part 1: xxx -> 内容页...；封面不属于任何 Part。
   - 最后可以安排总结页或致谢展望页。
4. **输出 Markdown 格式（便于流式解析）**：
   对于普通页面，使用 \`## 页面标题\` 引导，下方直接使用列表写要点：
   \`\`\`markdown
   ## 封面标题
   - 副标题：一句话商业提案
   - 演讲人：贝壳云图

   # Part 1: 破局与现状
   ## 算力极限打破传统模型扩张路径
   - 芯片功耗年增 45%，数据中心电力瓶颈凸显
   - 单点集群扩展边际效益已递减至 18%
   \`\`\`

${langConfig.instruction}
请直接输出规范的 Markdown 大纲内容，不要输出多余解释开场白。`;
}

/** 将 Markdown 格式的大纲解析为结构化的 PptOutlinePage 数组 */
export function parseMarkdownToOutlinePages(markdown: string): PptOutlinePage[] {
  const lines = markdown.split('\n');
  const pages: PptOutlinePage[] = [];
  let currentPart: string | undefined = undefined;
  let currentPage: PptOutlinePage | null = null;
  let pageIndex = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('# ')) {
      // 章节标题
      currentPart = line.replace(/^#\s+/, '').trim();
    } else if (line.startsWith('## ')) {
      // 新页面标题
      if (currentPage) {
        pages.push(currentPage);
      }
      const title = line.replace(/^##\s+/, '').trim();
      currentPage = {
        pageIndex: pageIndex++,
        title,
        takeaway: title,
        points: [],
        part: currentPart,
      };
    } else if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
      const point = line.replace(/^[-*•]\s+/, '').trim();
      if (currentPage) {
        currentPage.points.push(point);
      }
    }
  }

  if (currentPage) {
    pages.push(currentPage);
  }

  return pages;
}

/** 构建流式展开逐页详细描述的 Prompt */
export function buildDescriptionsStreamPrompt(options: {
  outlinePages: PptOutlinePage[];
  ideaPrompt?: string;
  detailLevel?: PptDetailLevel;
  language?: PptLanguage;
  requirements?: string;
}): string {
  const lang = options.language || 'zh';
  const level = options.detailLevel || 'default';
  const langConfig = PPT_LANGUAGE_CONFIG[lang];

  const outlineText = options.outlinePages
    .map((p) => `第 ${p.pageIndex} 页：${p.title}${p.part ? ` [所属章节: ${p.part}]` : ''}\n要点：${p.points.join('；')}`)
    .join('\n\n');

  return `你是一位专业级 UI/UX 演示设计师与资深 PPT 编排专家。
请将以下 PPT 大纲逐页扩写为极其精确、字段彻底解耦的页面详细描述。

【完整大纲】：
${outlineText}

## 字段解耦与输出契约：
每一页包含以下字段，每页以 \`<!-- BEGIN -->\` 开始，以 \`<!-- PAGE_END -->\` 结束：

--- 页面文字 ---
[这里只写真正逐字出现在 PPT 画面上的内容，包含论断大标题、副标题、正文字句、数据高亮或表格。严禁写任何设计注释或说明文字！细致度要求：${PPT_DETAIL_SPECS[level]}]
--- 页面文字结束 ---

配图与素材：[本页需要的视觉元素：如"折线图：展现 2024-2026 翻倍增长"、"科技感架构流程拓扑图"、或引用的素材图片。若无需配图则写无]
版式与重点：[不超过两句：第一句写版面结构（如：左文右图 / 上标题下三栏卡片 / 居中大字报），第二句写视觉聚焦重心]
演讲者备注：[演讲人口述展开逻辑，仅供演讲参考，不渲染到画面中]
<!-- PAGE_END -->

${langConfig.instruction}
请严格从第 1 页开始依序输出每页，不输出多余闲聊。`;
}

/** 构建单页视觉生图的最终 Prompt */
export function buildSlideVisualPrompt(options: {
  pageIndex: number;
  pageDesc: string;
  aspectRatio?: PptAspectRatio;
  hasTemplate?: boolean;
  pageStyleText?: string;
  hasMaterialImages?: boolean;
  language?: PptLanguage;
}): string {
  const ratio = options.aspectRatio || '16:9';
  const lang = options.language || 'zh';
  const langConfig = PPT_LANGUAGE_CONFIG[lang];

  const templateGuideline = options.hasTemplate
    ? '- 配色方案、排版字体与设计质感严格参考模板图片。\n- 严格只参考视觉风格与排版语言，禁止复制模板图片中原有的文本内容。'
    : '- 严格按照专业商务演示设计规范，构图严谨，色彩克制高雅。';

  const styleBlock = options.pageStyleText
    ? `\n<page_style>\n${options.pageStyleText.trim()}\n</page_style>\n- 必须完全遵循上述 page_style 中的视觉设计、配色方案与质感氛围。`
    : '';

  const materialNote = options.hasMaterialImages
    ? '\n- 已提供补充素材图片。请智能提取素材中的标志、主体或产品元素，自然无痕地融入本页构图之中。'
    : '';

  const isCover = options.pageIndex === 1;
  const coverGuideline = isCover
    ? '\n**【封面页特别要求】**：采用冲击力极强的封面版式，主标题醒目突出，主次分明，排版极简大气，极具视觉吸睛度。'
    : '';

  return `你是一位顶尖 UI/UX 演示设计师，正在生成一张 4K 极清、排版极佳的 PPT 幻灯片原图。

<page_description>
${options.pageDesc.trim()}
</page_description>
${styleBlock}

<design_guidelines>
- 画面比例为 ${ratio}，必须生成 4K 极清分辨率、字体边缘清晰锐利的完整渲染图。
${templateGuideline}
- 根据页面内容与版式要求精心设计布局，完整、不重不漏地渲染“页面文字”中的文字内容。
- 保证信息层级清晰（视觉焦点 -> 论断标题 -> 支撑数据与图表 -> 说明文字）。
- 严禁出现与内容无关的杂乱占位符或 markdown 符号。
${coverGuideline}
${materialNote}
</design_guidelines>
${langConfig.pptText}`;
}

/** 构建单页局部框选或 Vibe 修改的 Prompt */
export function buildSlideInpaintPrompt(options: {
  editInstruction: string;
  originalDescription?: string;
  editMode?: 'inpaint' | 'replace' | 'erase';
}): string {
  const mode = options.editMode || 'inpaint';
  const modeText = {
    inpaint: '对指定区域进行局部重绘与内容优化',
    replace: '将框选区域的内容替换为新的设计或素材元素',
    erase: '智能擦除选定区域的不必要瑕疵元素，并平滑修补背景',
  }[mode];

  return `你是一位专业级 PPT 视觉修复与图像编辑专家。
任务目标：保持原有 PPT 页面的整体设计风格、字体质感与未修改区域 100% 稳定一致，${modeText}。

用户修改指令：
"${options.editInstruction}"

${options.originalDescription ? `原始页面参考描述：\n${options.originalDescription}\n` : ''}
严格要求：
1. 仅在用户指定或框选的目标区域应用修改，绝对不破坏周围背景纹理和文字排版；
2. 确保新生成元素与整页的色调、光影、透视与设计语言完美融合。`;
}

/** 构建 PPT 口播旁白文案生成的 Prompt */
export function buildNarrationScriptPrompt(options: {
  pages: Array<{ pageIndex: number; title: string; contentText: string; speakerNotes?: string }>;
  speakerPersona?: string;
  targetAudience?: string;
  speechTone?: string;
  language?: PptLanguage;
}): string {
  const persona = options.speakerPersona || '专业且富有亲和力的资深行业演说家';
  const audience = options.targetAudience || '追求干货与商业价值的听众';
  const tone = options.speechTone || '自然生动、流畅自信、逻辑严密、口语化';
  const langConfig = PPT_LANGUAGE_CONFIG[options.language || 'zh'];

  const pagesText = options.pages
    .map((p) => `【第 ${p.pageIndex} 页 - ${p.title}】\n页面呈现内容：\n${p.contentText}\n${p.speakerNotes ? `演讲要点提示：${p.speakerNotes}` : ''}`)
    .join('\n\n');

  return `你是一位资深演讲撰稿人与专业口播旁白编剧。
请为以下 PPT 逐页撰写自然的口播旁白解说词（用于制作讲解视频配音）。

演讲者人设：${persona}
目标听众：${audience}
演讲基调：${tone}

【PPT 内容】：
${pagesText}

要求：
1. 口语化自然流畅，像现场生动演讲，严禁机械念读 PPT 上的字句，而是讲解字句背后的逻辑与洞察；
2. 每页字数控制在 80~150 字左右（对应约 20~40 秒口播时长）；
3. 严格使用 \`=== SLIDE [页码] ===\` 分割每页旁白，例如：
=== SLIDE 1 ===
大家好，欢迎来到今天的分享...
=== SLIDE 2 ===
首先我们来看这个核心结论...

${langConfig.instruction}
请直接输出规范的逐页解说词。`;
}
