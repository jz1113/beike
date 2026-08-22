import { jsonResponse } from '../../adapters/http';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { formatUserError } from '../../lib/formatApiError';

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_CHARS = 80000;
const MAX_ZIP_ENTRIES = 200;
const MAX_DECOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PAGES = 200;
const MAX_SHEETS = 50;
const PARSE_TIMEOUT_MS = 30_000;

const ALLOWED_EXT = new Set([
  'pdf', 'docx', 'pptx', 'txt', 'md', 'csv', 'json', 'doc', 'ppt', 'xlsx', 'xls',
]);
const SUPPORTED_FORMATS_HINT = 'pdf / docx / pptx / xlsx / txt / md / csv / json';

function getExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function truncateText(text: string): { text: string; truncated: boolean } {
  const cleaned = (text || '').replace(/\u0000/g, '').trim();
  if (cleaned.length <= MAX_CHARS) return { text: cleaned, truncated: false };
  return {
    text: `【已截断：原文约 ${cleaned.length} 字，仅保留前 ${MAX_CHARS} 字】\n\n` + cleaned.slice(0, MAX_CHARS),
    truncated: true,
  };
}

async function withParseTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('文档解析超时，请缩小文件后重试')), PARSE_TIMEOUT_MS);
    }),
  ]);
}

async function inspectZipBuffer(buffer: Buffer): Promise<JSZip> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.keys(zip.files);
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`压缩包条目过多（>${MAX_ZIP_ENTRIES}）`);
  }
  let uncompressed = 0;
  for (const path of entries) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    const meta = entry as unknown as { _data?: { uncompressedSize?: number } };
    const size = meta._data?.uncompressedSize;
    if (typeof size === 'number') {
      uncompressed += size;
      if (uncompressed > MAX_DECOMPRESSED_BYTES) {
        throw new Error('解压后体积过大');
      }
    }
  }
  return zip;
}

function stripXmlTags(xml: string): string {
  return xml
    .replace(/<a:t[^>]*>/gi, '')
    .replace(/<\/a:t>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await inspectZipBuffer(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] || 0);
      const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0);
      return na - nb;
    })
    .slice(0, MAX_PDF_PAGES);

  const parts: string[] = [];
  for (const path of slideFiles) {
    const xml = await zip.files[path].async('string');
    const text = stripXmlTags(xml);
    if (text) {
      const idx = path.match(/slide(\d+)/i)?.[1] || String(parts.length + 1);
      parts.push(`--- 幻灯片 ${idx} ---\n${text}`);
    }
  }
  return parts.join('\n\n');
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const pageCount = (pdf as { numPages?: number }).numPages ?? 0;
  if (pageCount > MAX_PDF_PAGES) {
    throw new Error(`PDF 页数过多（>${MAX_PDF_PAGES}）`);
  }
  const extracted = await extractText(pdf, { mergePages: true });
  const rawText: unknown = (extracted as { text?: unknown })?.text ?? extracted;
  return typeof rawText === 'string' ? rawText : Array.isArray(rawText) ? rawText.join('\n') : String(rawText || '');
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function extractSpreadsheetText(buffer: Buffer, ext: string): Promise<string> {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames.slice(0, MAX_SHEETS)) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      const trimmed = (csv || '').trim();
      if (trimmed) {
        parts.push(`--- 工作表: ${sheetName} ---\n${trimmed}`);
      }
    }
    return parts.join('\n\n');
  } catch (err: unknown) {
    if (ext === 'xls') {
      throw new Error('旧版 .xls 解析失败，请另存为 .xlsx 后再上传');
    }
    throw new Error(err instanceof Error ? err.message : '表格解析失败');
  }
}

/**
 * POST /api/assistant/extract-document
 * multipart field: file
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return jsonResponse({ success: false, error: '缺少文件 file' }, 400);
    }

    if (file.size > MAX_BYTES) {
      return jsonResponse({ success: false, error: '文件过大，请控制在 15MB 以内' }, 400);
    }

    const name = file.name || 'document';
    const ext = getExt(name);
    if (!ALLOWED_EXT.has(ext)) {
      return jsonResponse({
        success: false,
        error: `不支持的格式 .${ext || '?'}，请上传 ${SUPPORTED_FORMATS_HINT}`,
      }, 400);
    }

    if (ext === 'doc' || ext === 'ppt') {
      return jsonResponse({
        success: false,
        error: `暂不支持旧版 .${ext}，请另存为 .${ext}x 后上传`,
      }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let raw = '';

    const parse = async () => {
      if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json') {
        return buffer.toString('utf-8');
      }
      if (ext === 'docx') return extractDocxText(buffer);
      if (ext === 'pdf') return extractPdfText(buffer);
      if (ext === 'pptx') return extractPptxText(buffer);
      if (ext === 'xlsx' || ext === 'xls') return extractSpreadsheetText(buffer, ext);
      return '';
    };

    try {
      raw = await withParseTimeout(parse());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '文档解析失败';
      const status = /过大|过多|超时/.test(msg) ? 413 : 422;
      return jsonResponse({ success: false, error: msg }, status);
    }

    const { text, truncated } = truncateText(raw);
    if (!text) {
      return jsonResponse({ success: false, error: '未能从文件中提取到可读文本' }, 422);
    }

    return jsonResponse({
      success: true,
      text,
      name,
      mime: file.type || `application/${ext}`,
      size: file.size,
      truncated,
    });
  } catch (error: unknown) {
    console.error('[extract-document]', error);
    return jsonResponse({
      success: false,
      error: formatUserError(error, '文档解析失败'),
    }, 500);
  }
}
