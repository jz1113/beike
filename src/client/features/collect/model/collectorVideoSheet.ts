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

const TITLE_HEADERS = new Set(['新标题', '标题', 'title', '视频标题', '名称', '商品标题', '文件名', '视频文件名']);
const URL_HEADERS = new Set(['链接', '视频链接', 'url', '视频地址', 'oss链接', '视频url', '下载链接', '商品链接']);
const RESERVED_WINDOWS_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const FILENAME_CHAR_LIMIT = 80;
const FILENAME_BYTE_LIMIT = 240;

function utf8Size(value: string) {
  return new TextEncoder().encode(value).length;
}

function trimVideoStem(stem: string, extra = '') {
  let next = Array.from(stem).slice(0, FILENAME_CHAR_LIMIT).join('');
  while (next && utf8Size(`${next}${extra}.mp4`) > FILENAME_BYTE_LIMIT) {
    next = Array.from(next).slice(0, -1).join('');
  }
  return next;
}

function normalizeSheetUrl(raw: string) {
  const url = raw.trim().replace(/ /g, '%20');
  return /^https?:\/\//i.test(url) ? url : '';
}

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
  stem = trimVideoStem(stem.replace(/[. ]+$/g, ''));
  if (!stem) stem = '视频';
  if (RESERVED_WINDOWS_NAME.test(stem)) stem = `_${stem}`;
  let filename = `${stem}.mp4`;
  let index = 2;
  while (used.has(filename.toLowerCase())) {
    const marker = ` (${index})`;
    const candidate = trimVideoStem(stem, marker) || '视频';
    filename = `${candidate}${marker}.mp4`;
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
    const url = normalizeSheetUrl(cellText(row[columns.url]));
    if (!title && !url) continue;
    if (!url) continue;
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
