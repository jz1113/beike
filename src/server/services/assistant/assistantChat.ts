import { getInternalApiOrigin } from '@server/infrastructure/auth/apiAuth';
import type { AssistantDocAttachment } from '@shared/domain/assistant/tools/defs';

export function resolveRequestOrigin(req: Request): string {
  void req;
  return getInternalApiOrigin();
}

/** 工具规划轮次：去掉 image_url，避免部分网关 tools+vision 不兼容 */
export function toTextOnlyMessages(msgs: any[]): any[] {
  return msgs.map((m) => {
    if (typeof m.content === 'string' || m.content == null) return m;
    if (!Array.isArray(m.content)) return m;
    const texts = m.content.filter((p: any) => p?.type === 'text').map((p: any) => p.text || '');
    const imgN = m.content.filter((p: any) => p?.type === 'image_url').length;
    return {
      ...m,
      content:
        texts.join('\n') +
        (imgN > 0 ? `\n[附带 ${imgN} 张图片，最终回复阶段可结合视觉理解]` : ''),
    };
  });
}

export function summarizeToolResult(raw: string): string {
  try {
    const j = JSON.parse(raw);
    if (j.success === false) return j.error || '失败';
    if (j.kind === 'social') return `社媒「${j.title || ''}」图${j.imageCount || 0}张`;
    if (j.kind === 'ecommerce') return `商品「${j.title || ''}」`;
    if (j.products) return `商品库 ${j.count || j.products.length} 条`;
    if (j.excerpt) return `文档片段 ${String(j.excerpt).length} 字`;
    return '完成';
  } catch {
    return raw.slice(0, 80);
  }
}

/** 仅在有 URL / 文档 / 商品库查询等明确需求时跑工具规划轮，避免纯文本对话多等一整轮 LLM */
export function needsAssistantTools(
  lastUserMsg: string,
  documents: AssistantDocAttachment[],
  enableAgentTools: boolean,
): boolean {
  if (enableAgentTools === false) return false;
  if (documents.length > 0) return true;
  if (/https?:\/\/[^\s"'<>]+/i.test(lastUserMsg)) return true;
  if (/(?:xhslink\.com|xiaohongshu\.com|douyin\.com|kuaishou\.com|weibo\.com|b23\.tv|bilibili\.com)/i.test(lastUserMsg)) {
    return true;
  }
  if (/(?:item\.jd\.com|item\.taobao\.com|detail\.tmall\.com|1688\.com|pinduoduo\.com)/i.test(lastUserMsg)) {
    return true;
  }
  if (/(?:抓取|采集|解析|商品库|我有哪些商品|历史采集|本地商品|万邦|sku)/i.test(lastUserMsg)) {
    return true;
  }
  if (/\b\d{9,16}\b/.test(lastUserMsg) && /(?:抓取|采集|商品|sku|万邦)/i.test(lastUserMsg)) {
    return true;
  }
  return false;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  attachments?: Array<{
    type: 'image' | 'video' | 'document';
    url?: string;
    name?: string;
    mentionName?: string;
    extractedText?: string;
  }>;
}




export function getAssistantDocuments(messages: ChatMessage[]): AssistantDocAttachment[] {
  const seen = new Set<string>();
  const documents: AssistantDocAttachment[] = [];
  for (const message of [...messages].reverse()) {
    if (message.role !== 'user') continue;
    for (const attachment of message.attachments || []) {
      if (attachment.type !== 'document' || !attachment.extractedText) continue;
      const key = JSON.stringify([attachment.name || '', attachment.extractedText]);
      if (seen.has(key)) continue;
      seen.add(key);
      documents.push({ name: attachment.name, extractedText: attachment.extractedText });
      if (documents.length === 20) return documents;
    }
  }
  return documents;
}
