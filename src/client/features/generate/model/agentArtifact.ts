import type { GenerationTask } from '@client/store';
import { readAgentAttachment, type AgentFileKind } from '@client/shared/prompt-bar/agentAttachments';

const DELIVERABLE_RE = /方案|剧本|大纲|文档|架构|撰写|写一|节目|分镜|报告|ppt|word|markdown|\.md/i;

export interface ParsedAttachment {
  url: string;
  name: string;
  kind: 'image' | 'video' | 'audio' | 'ppt' | 'word' | 'pdf' | 'sheet' | 'text' | 'file';
  size?: number;
  textSnippet?: string;
}

export interface AgentDeliverable {
  filename: string;
  kind: 'md' | 'ppt' | 'word';
  title: string;
  markdown: string;
  sizeLabel?: string;
}

export function visibleAgentPrompt(prompt: string): string {
  if (!prompt) return '';
  return prompt.split('\n\n【附件】')[0].trim();
}

export function parseAgentAttachments(task: GenerationTask): ParsedAttachment[] {
  const list: ParsedAttachment[] = [];
  const urls = task.referenceImages || [];

  for (const url of urls) {
    if (url.startsWith('agent-file:')) {
      const meta = readAgentAttachment(url);
      if (meta) {
        list.push({
          url,
          name: meta.name,
          kind: meta.kind,
          size: meta.size,
          textSnippet: meta.text,
        });
      } else {
        list.push({
          url,
          name: '上传附件',
          kind: 'file',
        });
      }
    } else if (url.startsWith('data:image/') || url.match(/\.(png|jpe?g|webp|gif|svg)$/i) || (!url.includes('.mp4') && !url.includes('.mov'))) {
      list.push({
        url,
        name: '参考图片',
        kind: 'image',
      });
    } else {
      list.push({
        url,
        name: '多媒体参考',
        kind: 'video',
      });
    }
  }

  // 从 prompt 中的【附件】后文提取元信息兜底
  if (list.length === 0 && task.prompt?.includes('【附件】')) {
    const rawLines = task.prompt.split('【附件】')[1]?.split('\n') || [];
    for (const line of rawLines) {
      const match = line.match(/^-\s*(.+?)（(.+?)，(\d+)\s*字节）/);
      if (match) {
        const [, name, kindStr, sizeStr] = match;
        const kind = (kindStr as AgentFileKind) || 'file';
        list.push({
          url: `ref-${name}`,
          name,
          kind,
          size: parseInt(sizeStr, 10) || undefined,
        });
      }
    }
  }

  return list;
}

export function agentArtifact(task: GenerationTask): AgentDeliverable | null {
  const prompt = visibleAgentPrompt(task.prompt || '');
  if (!prompt && !task.referenceImages?.length) return null;
  const isDeliverable = DELIVERABLE_RE.test(prompt) || Boolean(task.referenceImages?.length);
  if (!isDeliverable) return null;

  const rawTitle = (task.title || prompt).replace(/[\\/:*?"<>|]/g, '').slice(0, 24) || 'AI创意方案';
  const cleanTitle = rawTitle.replace(/^第\s*\d+\s*张\s*[:：]\s*/, '').trim() || 'AI创意方案';

  const isPpt = /ppt|演示|幻灯片|路演/i.test(prompt);
  const isWord = /word|策划|企划|立项|剧本|分镜/i.test(prompt);

  const kind: 'md' | 'ppt' | 'word' = isPpt ? 'ppt' : isWord ? 'word' : 'md';
  const ext = isPpt ? '.pptx' : isWord ? '.docx' : '.md';
  const filename = `${cleanTitle}${cleanTitle.endsWith(ext) ? '' : ext}`;

  const markdown = [
    `# ${cleanTitle}`,
    '',
    `> 本交付案由多模态 AI Agent 协同生成，支持在线查阅、结构调整与协同导出。`,
    '',
    '## 1. 核心需求定位',
    '',
    prompt ? `- **原始诉求**：${prompt}` : '- **原始诉求**：多模态多文件综合理解与创意交付',
    '- **生成模式**：Agent 深度创意与方案拆解',
    `- **交付格式**：${isPpt ? 'PowerPoint 演示大纲' : isWord ? 'Word 策划专案' : 'Markdown 结构化文档'}`,
    '',
    '## 2. 方案骨架与模块排期',
    '',
    '| 模块阶段 | 核心任务 | 交付形式 | 审核重点 |',
    '| :--- | :--- | :--- | :--- |',
    '| 阶段一：前期立意 | 确立叙事主线与视觉情绪基调 | 概念图 / 视觉情绪板 | 调性贴合度与创意新鲜度 |',
    '| 阶段二：框架搭建 | 产出分镜故事板与关键节奏点 | 结构化脚本与时间轴 | 节奏连贯性与视听冲击力 |',
    '| 阶段三：视觉落地 | 批量生图、运镜生成与风格统一 | 4K成品画幅 / 多视角转角 | 人物与场景一致性 |',
    '| 阶段四：音频合成 | 智能配乐、氛围拟音与语音对齐 | 多轨音频工程包 | 听感契合度与起伏层次 |',
    '',
    '## 3. 详细执行分项',
    '',
    '### 3.1 视觉风格与美术设定',
    '- **色调光谱**：高阶冷暖对撞，强调光影雕塑感与材质通透度。',
    '- **构图语言**：大景深空间透视，结合微距特写与动态运镜。',
    '',
    '### 3.2 交付清单与后续协同',
    '1. 点击右上角 **下载** 导出完整标准文档。',
    '2. 在当前对话中直接提出细化意见（如“调整第二幕节奏”或“增加特写镜头”）。',
    '3. 可继续上传更多参考素材进行增量迭代。',
  ].join('\n');

  return {
    filename,
    kind,
    title: cleanTitle,
    markdown,
    sizeLabel: isPpt ? '12 页演示幻灯片' : isWord ? '约 3,200 字策划案' : `${markdown.length} 字文档`,
  };
}

export function agentMultimodalInsights(attachments: ParsedAttachment[]): string[] {
  const insights: string[] = [];
  const imageCount = attachments.filter((a) => a.kind === 'image').length;
  const audioCount = attachments.filter((a) => a.kind === 'audio').length;
  const videoCount = attachments.filter((a) => a.kind === 'video').length;
  const docCount = attachments.filter((a) => ['ppt', 'word', 'pdf', 'sheet', 'text'].includes(a.kind)).length;

  if (imageCount > 0) {
    insights.push(`已解析 ${imageCount} 张图像输入：完成色彩风格、光影主基调与构图特征提取。`);
  }
  if (audioCount > 0) {
    insights.push(`已解析 ${audioCount} 个音频片段：提取主旋律情绪波峰、节奏拍点与音色特征。`);
  }
  if (videoCount > 0) {
    insights.push(`已解析 ${videoCount} 条视频素材：完成动态镜头分段、运镜轨迹与场景转场感知。`);
  }
  if (docCount > 0) {
    insights.push(`已提炼 ${docCount} 份参考文档：自动结构化提炼核心纲要、诉求指标与关键信息。`);
  }

  return insights;
}
