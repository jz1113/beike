import { jsonResponse } from '../../core/http';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { readResponseBodyLimited } from '../../core/readBodyLimited';
import { safeErrorMessage } from '../../core/validate';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_CHARS = 80000;
const MAX_ZIP_ENTRIES = 200;
const MAX_DECOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PAGES = 200;
const MAX_SHEETS = 50;
const MAX_SHEET_CELLS = 200_000;
const MAX_WORKBOOK_CELLS = 1_000_000;
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
  // eslint-disable-next-line no-control-regex
  const cleaned = (text || '').replace(/\u0000/g, '').trim();
  if (cleaned.length <= MAX_CHARS) return { text: cleaned, truncated: false };
  return {
    text: `【已截断：原文约 ${cleaned.length} 字，仅保留前 ${MAX_CHARS} 字】\n\n` + cleaned.slice(0, MAX_CHARS),
    truncated: true,
  };
}

async function withParseTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('文档解析超时，请缩小文件后重试')), PARSE_TIMEOUT_MS);
    })]);
  } finally { if (timer) clearTimeout(timer); }
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
  // ZIP metadata is controlled by the file. Count real output in bounded chunks
  // before handing the archive to parsers which otherwise inflate it in memory.
  let decodedBytes = 0;
  for (const path of entries) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    await new Promise<void>((resolve, reject) => {
      const stream = (entry as JSZip.JSZipObject & {
        internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
      }).internalStream('uint8array');
      stream.on('data', (chunk) => {
        decodedBytes += chunk.byteLength;
        if (decodedBytes > MAX_DECOMPRESSED_BYTES) {
          stream.pause();
          reject(new Error('解压后体积过大'));
        }
      }).on('error', reject).on('end', resolve).resume();
    });
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
  try {
    const pageCount = (pdf as { numPages?: number }).numPages ?? 0;
    if (pageCount > MAX_PDF_PAGES) {
      throw new Error(`PDF 页数过多（>${MAX_PDF_PAGES}）`);
    }
    const extracted = await extractText(pdf, { mergePages: true });
    const rawText: unknown = (extracted as { text?: unknown })?.text ?? extracted;
    return typeof rawText === 'string' ? rawText : Array.isArray(rawText) ? rawText.join('\n') : String(rawText || '');
  } finally {
    await pdf.loadingTask.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  await inspectZipBuffer(buffer);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function extractSpreadsheetText(buffer: Buffer, ext: string): Promise<string> {
  try {
    if (ext === 'xlsx') await inspectZipBuffer(buffer);
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    if (workbook.SheetNames.length > MAX_SHEETS) throw new Error(`工作表过多（>${MAX_SHEETS}），请拆分文件后上传`);
    const parts: string[] = [];
    let totalCells = 0;
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      if (sheet['!ref']) {
        const range = XLSX.utils.decode_range(sheet['!ref']);
        const cells = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
        totalCells += cells;
        if (!Number.isSafeInteger(cells) || cells < 1 || cells > MAX_SHEET_CELLS || totalCells > MAX_WORKBOOK_CELLS) {
          throw new Error('工作表范围过大，请删除多余空白行列或拆分文件后上传');
        }
      }
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
    const read = await readResponseBodyLimited(new Response(req.body, { headers: req.headers }), MAX_BYTES + 1024 * 1024, req.signal);
    if (!read.ok) return jsonResponse({ success: false, error: '文件过大或内容为空，请控制在 15MB 以内' }, read.reason === 'too_large' ? 413 : 400);
    const form = await new Response(new Uint8Array(read.buffer), { headers: req.headers }).formData();
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
    req.signal.throwIfAborted();
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
      req.signal.throwIfAborted();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '文档解析失败';
      const status = /过大|过多|超时/.test(msg) ? 413 : 422;
      return jsonResponse({ success: false, error: safeErrorMessage(new Error(formatUserError(err)), '文档解析失败，请检查格式后重试') }, status);
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
      error: safeErrorMessage(new Error(formatUserError(error, '文档解析失败')), '文档解析失败，请检查格式后重试'),
    }, 500);
  }
}
