import { assistantMessageSchema } from '@shared/contracts/assistant';
import type { AssistantMessage, MediaAttachment } from '@client/store/appStoreTypes';

export function validateAssistantSubmission(content: string, attachments: MediaAttachment[], systemPrompt = ''): string | undefined {
  if (content.length > 100_000) return '单条消息最多 100000 字符，请缩短内容或作为文档上传；草稿已保留';
  if (attachments.length > 50) return '每条消息最多 50 个附件，请分批发送；草稿已保留';
  if (systemPrompt.length > 100_000) return '技能与品牌指令过长，请缩短配置后再发送；草稿已保留';
  const parsed = assistantMessageSchema.safeParse({ role: 'user', content, attachments });
  return parsed.success ? undefined : '附件名称、地址或正文超出支持范围，请调整后再发送；草稿已保留';
}

export function buildAssistantRequestMessages(messages: AssistantMessage[]) {
  const requestMessages = messages.slice(-500).map((message) => ({
    id: message.id, timestamp: message.timestamp, error: message.error,
    role: message.role, content: message.content || '',
    productWidget: message.role === 'assistant' ? message.productWidget : undefined,
    attachments: message.attachments?.length ? message.attachments.map((attachment) => ({
      type: attachment.type, url: attachment.type === 'document' ? undefined : attachment.url,
      name: attachment.name, mentionName: attachment.mentionName, extractedText: attachment.extractedText,
    })) : undefined,
  }));
  for (const message of requestMessages) {
    if (!assistantMessageSchema.safeParse(message).success) throw new Error('历史消息超出支持范围，请新建会话或调整对应附件；本次草稿已保留');
  }
  if (new TextEncoder().encode(JSON.stringify(requestMessages)).byteLength > 31_000_000) {
    throw new Error('当前对话素材过多，请新建会话并引用所需文件；本次草稿已保留');
  }
  return requestMessages;
}
