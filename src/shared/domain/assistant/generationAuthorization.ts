/** A generation tool result is a request, not permission to spend without a user instruction. */
export function explicitBatchGenerationRequest(text: string): boolean {
  if (/\b(?:do\s+not|don['’]t|never|not\s+yet)\s+(?:generate|render)|\b(?:only|just)\b.{0,30}\bprompts?\b|\b(?:generate|write)\b.{0,30}\bprompts?\b/i.test(text)) return false;
  if (/(?:不要|不用|先别|暂不|别|不能|不需要|不|勿).{0,10}(?:生成|出图|渲染)|只(?:要|写|给).{0,8}(?:提示词|prompt)|(?:生成|写).{0,20}(?:提示词|prompt)(?!.*(?:全部生成|直接生成|开始生成))/i.test(text)) return false;
  return /生成|出图|画出来|渲染|\bgenerate\b|\brender\b/i.test(text)
    && /全部|所有|上面|上述|这些|这组|这几|第\s*[\d一二三四五六七八九十]|图片|视频|出图|\bgenerate\b|\brender\b/i.test(text);
}
