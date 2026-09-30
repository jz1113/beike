export const WORKSHOP_EXPORT_HEADERS = [
  '商品名称', '商品类目', '商品id',
  '生成图片链接1', '生成图片链接2', '生成图片链接3', '生成图片链接4',
  '标题', '文案', '对应生成的提示词资产分组组名',
] as const;

export type WorkshopExportRow = Record<(typeof WORKSHOP_EXPORT_HEADERS)[number], string>;

function safeFilePart(value: string, maxBytes: number): string {
  const clean = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');
  const encoder = new TextEncoder();
  let result = '';
  let bytes = 0;
  for (const char of clean) {
    const charBytes = encoder.encode(char).length;
    if (bytes + charBytes > maxBytes) break;
    result += char;
    bytes += charBytes;
  }
  return result.replace(/[. ]+$/g, '');
}

/** One product's folder (and single-product ZIP) uses the same visible name. */
export function workshopProductFolderName(groupName: string, productId: string, generatedTitle?: string): string {
  const group = safeFilePart(groupName, 48) || '未绑定图组';
  const id = safeFilePart(productId, 72) || '未知商品';
  const title = safeFilePart(generatedTitle || '', 100);
  return `${group}---${id}${title ? `-${title}` : ''}`;
}

export function uniqueWorkshopFolderName(name: string, used: Set<string>): string {
  let candidate = name;
  let number = 2;
  while (used.has(candidate)) candidate = `${name}-${number++}`;
  used.add(candidate);
  return candidate;
}

/** Export only the generated body, preserving words while giving paragraphs breathing room. */
export function formatWorkshopCopywriting(content?: string): string {
  if (!content?.trim()) return '';
  const normalized = content.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
  const paragraphs: string[] = [];
  for (const line of normalized.split(/\n+/).map(part => part.trim()).filter(Boolean)) {
    if (line.length <= 120) {
      paragraphs.push(line);
      continue;
    }
    const sentences = line.match(/[^。！？!?]*[。！？!?]+|[^。！？!?]+$/g) || [line];
    let paragraph = '';
    for (const sentence of sentences) {
      if (paragraph && paragraph.length + sentence.length > 120) {
        paragraphs.push(paragraph.trim());
        paragraph = '';
      }
      paragraph += sentence;
    }
    if (paragraph.trim()) paragraphs.push(paragraph.trim());
  }
  return paragraphs.join('\n\n');
}
