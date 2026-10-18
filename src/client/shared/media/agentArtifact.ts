import type { GenerationTask } from '@client/store/appStoreTypes';
import { readAgentAttachment, type AgentFileKind } from '@client/shared/prompt-bar/agentAttachments';

export interface ParsedAttachment {
  url: string;
  name: string;
  kind: 'image' | 'video' | 'audio' | 'ppt' | 'word' | 'pdf' | 'sheet' | 'text' | 'file';
  size?: number;
  textSnippet?: string;
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
