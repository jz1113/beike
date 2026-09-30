import { jsonResponse } from '../../../core/http';
import { getMotherReplacementState } from '../../../services/promptAsset/motherReplacementState';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('motherId')?.trim() || '';
  if (!id || id.length > 160) return jsonResponse({ error: '缺少有效母组 ID' }, 400);
  const state = await getMotherReplacementState(id);
  if (!state) return jsonResponse({ error: '母组不存在或不属于当前工作区' }, 404);
  return jsonResponse({ success: true, ...state });
}
