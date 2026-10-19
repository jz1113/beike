import type { SkillDraftData, SkillOutputGenre } from './skillTypes';
import type { SkillFileNode } from './skillFileTree';

export interface GeneratedSkillResult {
  files: SkillFileNode[];
  draft: SkillDraftData;
}

export function generateSkillFromIdea(rawIdea: string): GeneratedSkillResult {
  const idea = rawIdea.trim();
  if (!idea) {
    throw new Error('请输入技能想法');
  }

  const genres: SkillOutputGenre[] = [];
  if (/视频|短视频|动态|剪辑|镜头|分镜|mv|帧/i.test(idea)) {
    genres.push('视频');
  }
  if (/图片|封面|海报|插画|壁纸|人像|绘图|白底|写真|原画/i.test(idea)) {
    genres.push('图片');
  }
  if (/音频|配乐|声音|tts|语音|配音/i.test(idea)) {
    genres.push('音频');
  }
  if (/文案|标题|脚本|表格|代码|文本|审核|prompt/i.test(idea)) {
    genres.push('文本');
  }
  if (genres.length === 0) {
    genres.push('图片', '视频');
  }

  let title = idea.replace(/帮我做|想要一个|做一个|创建|生成|制作/g, '').trim();
  if (title.length > 18) {
    title = title.slice(0, 16) + '技能';
  } else if (!title.endsWith('技能') && !title.endsWith('助手') && !title.endsWith('生成')) {
    title = `${title}技能`;
  }
  if (title.length > 20) {
    title = title.slice(0, 20);
  }

  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-') || `skill-${Date.now().toString().slice(-4)}`;

  let description = `面向${idea}的专业创作技能，规范提示词结构并保障输出质量与风格一致性。`;
  if (description.length > 50) {
    description = description.slice(0, 48) + '。';
  }

  const skillMdContent = `---
name: ${slug}
description: ${description} 用于在涉及${idea}的任务中提供结构化提示词生成与工作流指导。
---

# ${title}

## 目标与适用场景
- **核心定位**：专注于 ${idea}，规范生成流程与交付标准。
- **适用场景**：适用于需要高质感、高保真产出对应视觉与内容的创作工作流。

## 输入要求与前置条件
1. 用户输入明确的创作主题或原始参考物。
2. 明确输出比例与视觉风格基调。
3. 遵循本技能的规范骨架，避免随意拼接无关修饰词。

## 固定工作流程 (Workflow SOP)
1. **意图拆解**：解析用户输入的核心主体、风格取向与构图层级。
2. **规范映射**：将用户意图转化为符合特定模型的结构化提示词。
3. **分层执行**：主体保真锁定 -> 背景材质构筑 -> 光影氛围强化 -> 负面禁忌过滤。
4. **质量复核**：检查主体结构完整性、排版可读性与比例适配。

## 结构化提示词骨架 (Prompt Architecture)
\`\`\`text
主体：[明确锁定核心对象，禁止变形与缺失]
风格与艺术体系：[指定美术风格/渲染器/镜头语言]
色彩与光影：[主色调、辅助色与环境光照方向]
构图与视角：[景别、视角与画面空间平衡]
禁忌项：[禁止模糊、重影、变形、乱码文字与多余构件]
\`\`\`

## 质量门槛 (Quality Checklist)
- 产出必须符合预设的体裁（${genres.join(' / ')}）。
- 画面关键要素不可被过度修饰或篡改。
- 保证在不同生成批次中的风格一致性与稳定性。
`;

  const examplesMdContent = `# ${title} - 样例与调用示例

## 基础示例
- 输入：简约现代风格，主体突出
- 推荐输出：主体明晰，背景留白协调，光影柔和。

## 进阶调优技巧
- 可以通过追加明确的负面提示词进一步压制多余伪影。
`;

  const files: SkillFileNode[] = [
    {
      id: 'file-skill-md',
      name: 'SKILL.md',
      type: 'file',
      content: skillMdContent,
    },
    {
      id: 'file-examples-md',
      name: 'examples.md',
      type: 'file',
      content: examplesMdContent,
    },
  ];

  const draft: SkillDraftData = {
    title,
    description,
    genres,
    tags: [],
    defaultVideoModel: genres.includes('视频') ? 'seedance-2.5' : '',
    defaultImageModel: genres.includes('图片') ? 'seedream-3.0' : '',
    coverUrl: '',
    showcaseUrls: [],
    promptGuide: `建议输入具体的画面主体与风格需求，避免过于宽泛的描述`,
    assetGuide: `可上传参考原图`,
    isPublic: false,
  };

  return { files, draft };
}
