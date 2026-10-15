import { readImageFileAsDataUrl, readVideoPreviewUrl, isImageFile, isVideoFile } from '@client/shared/api/mediaUpload';

const TEXT_EXT = /\.(txt|md|csv|json)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const DOC_EXT = /\.(pdf|docx?|pptx?|xlsx?|xls)$/i;

export type AgentFileKind = 'audio' | 'ppt' | 'word' | 'text' | 'pdf' | 'sheet' | 'file';

export interface AgentAttachmentMeta {
  name: string;
  kind: AgentFileKind;
  size: number;
  text?: string;
}

const metas = new Map<string, AgentAttachmentMeta>();

export function isAgentAttachmentFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  if (file.type.startsWith('text/')) return true;
  return TEXT_EXT.test(file.name) || AUDIO_EXT.test(file.name) || DOC_EXT.test(file.name);
}

export function isAgentAttachmentUrl(url: string): boolean {
  return url.startsWith('agent-file:');
}

export function readAgentAttachment(url: string): AgentAttachmentMeta | undefined {
  return metas.get(url);
}

function kindOf(file: File): AgentFileKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('audio/') || AUDIO_EXT.test(name)) return 'audio';
  if (name.endsWith('.ppt') || name.endsWith('.pptx')) return 'ppt';
  if (name.endsWith('.doc') || name.endsWith('.docx')) return 'word';
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) return 'sheet';
  if (file.type.startsWith('text/') || TEXT_EXT.test(name)) return 'text';
  return 'file';
}

export async function loadPromptBarUploads(files: File[], agentMode: boolean): Promise<{
  media: Array<{ previewUrl: string; origName: string; file: File }>;
  agentUrls: string[];
}> {
  const media: Array<{ previewUrl: string; origName: string; file: File }> = [];
  const agentUrls: string[] = [];
  for (const file of files) {
    if (agentMode && isAgentAttachmentFile(file) && !isImageFile(file) && !isVideoFile(file)) {
      const text = file.type.startsWith('text/') || TEXT_EXT.test(file.name)
        ? (await file.text()).slice(0, 8000)
        : undefined;
      const url = `agent-file:${globalThis.crypto.randomUUID()}`;
      metas.set(url, { name: file.name, kind: kindOf(file), size: file.size, text });
      agentUrls.push(url);
      continue;
    }
    const origName = file.name.replace(/\.[^/.]+$/, '').trim() || file.name;
    const previewUrl = isVideoFile(file) ? await readVideoPreviewUrl(file) : await readImageFileAsDataUrl(file);
    media.push({ previewUrl, origName, file });
  }
  return { media, agentUrls };
}

export function formatAgentAttachmentNote(urls: string[]): string {
  const lines = urls.map((url) => {
    const meta = readAgentAttachment(url);
    if (!meta) return '';
    const excerpt = meta.text ? `\n${meta.text.slice(0, 1500)}` : '';
    return `- ${meta.name}（${meta.kind}，${meta.size} 字节）${excerpt}`;
  }).filter(Boolean);
  return lines.length ? `【附件】\n${lines.join('\n')}` : '';
}

export function agentFileLabel(kind: AgentFileKind): string {
  if (kind === 'ppt') return 'PPT';
  if (kind === 'word') return 'Word';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'audio') return '音频';
  if (kind === 'sheet') return '表格';
  if (kind === 'text') return '文本';
  return '文件';
}
