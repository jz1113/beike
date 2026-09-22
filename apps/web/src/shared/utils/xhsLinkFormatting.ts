/**
 * 规范化小红书文本为标准的一行一条独立链接，自动合并断行参数并去重。
 *
 * 不重写 `explore` 链接为不带 query 的短形式：`xsec_token` 等参数有时是
 * 小红书/API 解析所需的访问凭据，移除后会将可解析笔记错误地变为超时或失败。
 */
export function formatXhsLinksToOnePerLine(rawText: string): string {
  if (!rawText) return '';
  // 修复复制或排版导致的断行 URL，例如 explore 链接下一行接 xsec_token。
  const rawLines = rawText.split(/\r?\n/);
  const stitched: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].trim();
    if (!line) continue;
    while (i + 1 < rawLines.length) {
      const nextLine = rawLines[i + 1].trim();
      if (
        (line.endsWith('?') || line.endsWith('&') || line.includes('xiaohongshu.com/explore/')) &&
        (nextLine.startsWith('xsec_') || nextLine.startsWith('&') || nextLine.startsWith('?'))
      ) {
        line = line + (line.endsWith('?') || nextLine.startsWith('&') || nextLine.startsWith('?') ? '' : '?') + nextLine;
        i++;
      } else {
        break;
      }
    }
    stitched.push(line);
  }

  const urls: string[] = [];
  const seenKeys = new Set<string>();
  const URL_REGEX = /(https?:\/\/[^\s"'<>，。；）)]+)/gi;
  const pushUrl = (rawUrl: string) => {
    const url = rawUrl.replace(/[，。；）)\s]+$/, '');
    if (!url) return;
    // 用笔记 ID 去重，但保留首个原始 URL（及其安全参数）传给解析接口。
    const xhsExploreMatch = url.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/i);
    const key = xhsExploreMatch ? `xhs:${xhsExploreMatch[1].toLowerCase()}` : url;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    urls.push(url);
  };

  for (const line of stitched) {
    const matches = line.match(URL_REGEX);
    if (matches) {
      matches.forEach(pushUrl);
    } else {
      const soloIdMatch = line.match(/^([a-zA-Z0-9]{24})$/);
      if (soloIdMatch && !line.includes('token=')) {
        pushUrl(`https://www.xiaohongshu.com/explore/${soloIdMatch[1]}`);
      }
    }
  }

  return urls.join('\n');
}

/** 从粘贴文本中提取小红书候选链接（去重保序，确保一行一条）。 */
export function parseXhsUrlsFromText(rawText: string): string[] {
  const formatted = formatXhsLinksToOnePerLine(rawText);
  return formatted ? formatted.split('\n').filter(Boolean) : [];
}
