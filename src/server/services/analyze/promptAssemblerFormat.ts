export function formatAssetWithCode(
  val: string | undefined,
  list: Array<{ title?: string; name?: string; code?: string }> | undefined,
  _prefix: string,
  fallbackIdx = 0,
): string | undefined {
  if (!val && (!list || list.length === 0)) return undefined;
  const raw = (val || list?.[fallbackIdx]?.title || list?.[fallbackIdx]?.name || '').trim();
  if (!raw) return undefined;
  if (/^\[?#[PSOA]-[\w-]+\]?/i.test(raw)) {
    const matchedPrefix = raw.match(/^\[?#?([PSOA]-[\w-]+)\]?\s*(.*)$/i);
    if (matchedPrefix) {
      return `[#${matchedPrefix[1].toUpperCase()}] ${matchedPrefix[2]}`.trim();
    }
    return raw;
  }
  const matched = list?.find(item =>
    (item.title && (raw.includes(item.title) || item.title.includes(raw))) ||
    (item.name && (raw.includes(item.name) || item.name.includes(raw)))
  );
  if (matched?.code) {
    return `[#${matched.code.replace(/^#/, '')}] ${raw.replace(/^\[?#[PSOA]-[\w-]+\]?\s*/i, '')}`;
  }
  const fallbackCode = list?.[fallbackIdx]?.code;
  // Mother-group summaries are not standalone library assets. Never invent S-01/P-01/O-01.
  if (!fallbackCode) return raw;
  return `[#${fallbackCode.replace(/^#/, '')}] ${raw.replace(/^\[?#[PSOA]-[\w-]+\]?\s*/i, '')}`;
}

/** Remove portrait-only directions when an asset explicitly calls for a pure product frame. */
export function toPureProductPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/(?:人物|模特|女生|女性|人像|面容|人脸|五官|发型|表情|穿搭|服装|侧颜)[^；;。\n]*/g, '')
    .replace(/(?:手持|双手|手部)[^；;。\n]*/g, '')
    .replace(/[；;]\s*[；;]/g, '；')
    .trim();
  return `${cleaned}；画面仅呈现 @图片1 所示商品实物，禁止人物、模特、人脸、肢体与手部出镜`;
}
