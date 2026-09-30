import { jsonResponse } from '../../core/http';
import { readResponseBodyLimited } from '../../core/readBodyLimited';
import { EXPORT_ZIP_LIMITS } from '@shared/domain/media/exportZipLimits';
import { parseExportZipBody } from '@shared/contracts/exportZip';
import { generateExportZip } from '../../services/generate/exportZip';
import { createExportWorkspace, openExportZipBody, type ExportWorkspace } from '../../services/generate/exportZipWorkspace';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

export { sanitizeFileSystemName, buildProductFolderName } from '../../services/generate/exportZip';

export async function POST(req: Request) {
  let workspace: ExportWorkspace | null = null;
  let handedOff = false;
  try {
    workspace = await createExportWorkspace(req.signal);
    if (!workspace) return jsonResponse({ success: false, error: '已有导出正在进行，请稍后重试' }, { status: 429, headers: { 'Retry-After': '5' } });
    const requestBody = await readResponseBodyLimited(new Response(req.body, { headers: req.headers }), EXPORT_ZIP_LIMITS.requestBytes, workspace.signal);
    if (!requestBody.ok) return jsonResponse({ success: false, error: requestBody.reason === 'too_large' ? '导出请求超过 36 MB，请将内嵌媒体保存为链接后重试' : '导出请求为空' }, requestBody.reason === 'too_large' ? 413 : 400);
    let body: unknown;
    try { body = JSON.parse(requestBody.buffer.toString('utf8')); }
    catch { return jsonResponse({ success: false, error: '请求格式不正确' }, 400); }
    const parsed = parseExportZipBody(body);
    if (!parsed.success) return jsonResponse({ success: false, error: parsed.error }, 400);
    const result = await generateExportZip(parsed.data, workspace);
    if (result.kind === 'error') return jsonResponse(result.body, result.status);
    const encodedFilename = encodeURIComponent(`${result.zipFileName}.zip`);
    const stream = openExportZipBody(result.file, workspace);
    try {
      const response = new Response(stream, { headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(result.zipFileName)}.zip"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': String(result.bytes),
        'X-Export-Completed': String(result.counts.completed),
        'X-Export-Downloaded': String(result.counts.completed),
        'X-Export-Total': String(result.counts.total),
        'X-Export-Succeeded': String(result.counts.succeeded),
        'X-Export-Failed': String(result.counts.failed),
        'X-Export-Partial': String(result.counts.failed > 0),
        'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, X-Export-Completed, X-Export-Downloaded, X-Export-Total, X-Export-Succeeded, X-Export-Failed, X-Export-Partial',
      } });
      handedOff = true;
      return response;
    } catch (error) {
      await stream.cancel().catch(() => {});
      throw error;
    }
  } catch (error) {
    return jsonResponse({ success: false, error: formatUserError(error, '导出 ZIP 压缩包失败') }, workspace?.signal.aborted ? 499 : 500);
  } finally {
    if (workspace && !handedOff) await workspace.cleanup();
  }
}
