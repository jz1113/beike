import { readJsonBody } from '../../core/validate';
import { jsonResponse } from '../../core/http';
import { parseExportZipBody } from '@shared/contracts/exportZip';
import { generateExportZip } from '../../services/generate/exportZip';

export { sanitizeFileSystemName, buildProductFolderName } from '../../services/generate/exportZip';

export async function POST(req: Request) {
  let body: unknown;
  try { body = await readJsonBody(req); } catch { return jsonResponse({ success: false, error: '请求格式不正确' }, 400); }
  const parsed = parseExportZipBody(body);
  if (!parsed.success) {
    console.error('[export-zip] 请求体验证失败:', parsed.error);
    return jsonResponse({ success: false, error: parsed.error }, 400);
  }
  const result = await generateExportZip(parsed.data);
  if (result.kind === 'error') return jsonResponse(result.body, result.status);
  const encodedFilename = encodeURIComponent(`${result.zipFileName}.zip`);
  return new Response(result.zipBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(result.zipFileName)}.zip"; filename*=UTF-8''${encodedFilename}`,
      'Content-Length': result.zipBuffer.length.toString(),
      ...(result.counts ? { 'X-Export-Completed': String(result.counts.completed), 'X-Export-Total': String(result.counts.total) } : {}),
    },
  });
}
