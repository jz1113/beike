import { jsonResponse } from '../../core/http';
import { listMediaReviews } from '../../services/mediaReviewQueue';

/** GET /api/system/media-review — 只读运维查询待核媒体引用 */
export async function GET() {
  const items = await listMediaReviews();
  return jsonResponse({ success: true, count: items.length, items });
}
