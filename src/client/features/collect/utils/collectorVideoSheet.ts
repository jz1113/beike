export interface VideoSheetItem {
  id: string;
  title: string;
  url: string;
  filename: string;
}

export interface VideoSheetParseResult {
  items: VideoSheetItem[];
  error?: string;
}

const TITLE_HEADERS = new Set(['新标题', '标题', 'title', '视频标题', '名称']);
const URL_HEADERS = new Set(['链接', '视频链接', 'url', '视频地址', 'oss链接', '视频url', '下载链接']);
const RESERVED_WINDOWS_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function sanitizeVideoTitle(title: string) {
  let cleaned = '';
  for (const char of title.trim()) {
    const code = char.charCodeAt(0);
    cleaned += code < 32 || '\\/:*?"<>|'.includes(char) ? '_' : char;
  }
  return cleaned.replace(/^[. ]+|[. ]+$/g, '');
}

function cellText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function headerKind(value: string): 'title' | 'url' | null {
  const key = value.replace(/\s/g, '').toLowerCase();
  if (URL_HEADERS.has(key)) return 'url';
  if (TITLE_HEADERS.has(key)) return 'title';
  return null;
}

/** 用标题做文件名：已有 .mp4 不重复追加，并避开 Windows 非法字符与重名。 */
export function videoDownloadFilename(title: string, used: Set<string>): string {
  const cleaned = sanitizeVideoTitle(title);
  let stem = cleaned;
  while (/\.mp4$/i.test(stem)) stem = stem.slice(0, -4);
  stem = stem.replace(/[. ]+$/g, '').slice(0, 180);
  if (!stem) stem = '视频';
  if (RESERVED_WINDOWS_NAME.test(stem)) stem = `_${stem}`;
  let filename = `${stem}.mp4`;
  let index = 2;
  while (used.has(filename.toLowerCase())) {
    filename = `${stem} (${index}).mp4`;
    index += 1;
  }
  used.add(filename.toLowerCase());
  return filename;
}

function findColumns(rows: unknown[][]): { header: number; title: number; url: number } | null {
  const limit = Math.min(rows.length, 10);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    let title = -1;
    let url = -1;
    row.forEach((cell, index) => {
      const kind = headerKind(cellText(cell));
      if (kind === 'title' && title < 0) title = index;
      if (kind === 'url' && url < 0) url = index;
    });
    if (title >= 0 && url >= 0) return { header: rowIndex, title, url };
  }
  return null;
}

export function parseVideoSheet(rows: unknown[][]): VideoSheetParseResult {
  if (!rows.length) return { items: [], error: '表格是空的' };
  const columns = findColumns(rows);
  if (!columns) return { items: [], error: '没有找到「标题」和「链接」列' };
  const used = new Set<string>();
  const items: VideoSheetItem[] = [];
  for (let rowIndex = columns.header + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    const title = cellText(row[columns.title]);
    const url = cellText(row[columns.url]);
    if (!title && !url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    items.push({
      id: `video-${rowIndex + 1}`,
      title: title || '视频',
      url,
      filename: videoDownloadFilename(title, used),
    });
  }
  if (!items.length) return { items: [], error: '没有可下载的视频链接' };
  return { items };
}
