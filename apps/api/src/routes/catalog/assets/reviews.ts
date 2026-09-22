import { deconstructReviews, fullPromptAssets, promptImportSources } from '../../../repositories/catalog';
import { readJsonBody } from '../../../core/validate';
import { jsonResponse } from '../../../core/http';
import { persistDeconstructedAssets } from '../../../services/deconstruct/saveAssets';
import { errorEnvelope } from '../../../core/errors';

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status') === 'rejected' ? 'rejected' : 'pending';
  const rows = await deconstructReviews.listByStatus(status);
  return jsonResponse({ success: true, data: rows.map(row => ({ ...row, payload: JSON.parse(row.payload) })) });
}
export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req) as { id?: unknown; action?: unknown };
    const { id, action } = body;
    if (typeof id !== 'string' || typeof action !== 'string' || !['approve', 'reject', 'restore'].includes(action)) return jsonResponse({ error: '无效审核操作' }, 400);
    if (action !== 'approve') {
      const from = action === 'restore' ? 'rejected' : 'pending';
      const to = action === 'restore' ? 'pending' : 'rejected';
      await deconstructReviews.updateStatus(id, from, to);
      return jsonResponse({ success: true });
    }
    const rows = await deconstructReviews.getById(id);
    if (!rows[0]) return jsonResponse({ error: '审核图集不存在' }, 404);
    if (rows[0].status === 'approved') return jsonResponse({ success: true });
    if (rows[0].status !== 'pending') return jsonResponse({ error: '请先恢复此图集再审核' }, 409);
    const payload = JSON.parse(rows[0].payload);
    await persistDeconstructedAssets({ ...payload, reviewId: id, sourceKey: payload.sourceKey });
    await deconstructReviews.updateStatus(id, 'pending', 'approved');
    if (payload.sourceKey) {
      const album = await fullPromptAssets.findAlbumIdByName(payload.albumName);
      await promptImportSources.markApproved(payload.sourceKey, album?.albumId || null);
    }
    return jsonResponse({ success: true });
  } catch (error) {
    const { body, status } = errorEnvelope(error, '审核失败');
    return jsonResponse(body, status);
  }
}
