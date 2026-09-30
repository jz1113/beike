/** 严格过滤操作系统文件系统禁止命名的特殊符号 (\ / : * ? " < > | 以及换行符等) */
export function sanitizeFileSystemName(name: string, fallback = 'EXPORT'): string {
  if (!name) return fallback;
  let sanitized = (name || '').normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\r\n\t\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');
  if (!sanitized) sanitized = fallback;
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitized)) sanitized = `_${sanitized}`;
  let truncated = '';
  for (const character of sanitized) {
    const code = character.charCodeAt(0);
    const safeCharacter = character.length === 1 && code >= 0xd800 && code <= 0xdfff ? '_' : character;
    if (Buffer.byteLength(truncated + safeCharacter, 'utf8') > 200) break;
    truncated += safeCharacter;
  }
  return truncated.replace(/[. ]+$/g, '') || fallback;
}

/** 按照【商品id-标题】生成合法的目录名与压缩包名 */
export function buildProductFolderName(skuId?: string, title?: string): string {
  const cleanId = sanitizeFileSystemName(skuId || 'PROD', 'PROD');
  const cleanTitle = sanitizeFileSystemName(title || '', '');
  if (cleanTitle) {
    if (cleanTitle.startsWith(cleanId)) {
      return cleanTitle;
    }
    return sanitizeFileSystemName(`${cleanId}-${cleanTitle}`);
  }
  return cleanId;
}

/** Allocate the media and its possible failure note together, avoiding case-insensitive overwrites. */
export function reserveExportFileNames(name: string, extension: string, used: Set<string>) {
  const stem = sanitizeFileSystemName(name.replace(/\.[^./\\]+$/, ''), '素材');
  let index = 1;
  let candidate = stem;
  while (used.has(`${candidate}.${extension}`.toLowerCase()) || used.has(`${candidate}.error.txt`.toLowerCase())) candidate = `${stem}_${++index}`;
  const filename = `${candidate}.${extension}`;
  const errorFilename = `${candidate}.error.txt`;
  used.add(filename.toLowerCase());
  used.add(errorFilename.toLowerCase());
  return { filename, errorFilename };
}

/** 规范化拼接小红书种草文案文本文件内容 */
export function buildCopywritingTxtContent(
  title?: string,
  content?: string,
  tags?: string[],
  fallbackDesc?: string
): string {
  if (title || content) {
    const lines: string[] = [];
    if (title) {
      lines.push(`【小红书种草标题】：\n${title.trim()}\n`);
    }
    if (content) {
      lines.push(`【小红书买家秀正文】：\n${content.trim()}\n`);
    }
    if (tags && tags.length > 0) {
      lines.push(`【话题标签】：\n${tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}\n`);
    }
    if (fallbackDesc?.trim()) lines.push(`【来源与说明】：\n${fallbackDesc.trim()}\n`);
    return lines.join('\n');
  }
  return (fallbackDesc || '').trim();
}
