function visionText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
      return '';
    }).join('').trim();
  }
  return '';
}

export function inspectVisionPayload(data: any): { rawText: string } {
  if (data?.error) throw new Error('网关返回错误响应');
  const choice = data?.choices?.[0];
  if (!choice) throw new Error('网关未返回可用正文');
  if (choice.finish_reason === 'content_filter' || choice.message?.refusal) {
    throw new Error('模型拒绝或内容过滤');
  }
  const rawText = visionText(choice.message?.content);
  if (choice.finish_reason === 'length') {
    const used = Number(data?.usage?.completion_tokens || data?.usage?.completionTokens || 0);
    throw new Error(used >= 1024 && !rawText ? '输出 token 额度已耗尽' : '分析结果为空或不完整');
  }
  if (!rawText) throw new Error('网关未返回可用正文');
  return { rawText };
}
