import { apiRequest } from '@client/shared/api/apiRequest';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import { isDeepSeekRoute } from '@shared/domain/models/deepseek';
import { categorySkillRunSchema, categorySkillStateSchema } from '@shared/contracts/categorySkills';

const endpoint = '/api/catalog/category-skills' as const;
async function read(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) throw new Error(body?.error || '细分技能服务暂不可用，请刷新核对状态');
  return body;
}
export async function readCategorySkill(folderId: string, signal?: AbortSignal) {
  return categorySkillStateSchema.parse(await read(await apiRequest('GET', endpoint, { search: `folderId=${encodeURIComponent(folderId)}`, signal })));
}
export async function changeCategorySkill(folderId: string, action: string, payload: Record<string, unknown>, signal?: AbortSignal) {
  return read(await apiRequest('POST', endpoint, { search: `action=${encodeURIComponent(action)}`, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, folderId }), signal }));
}
export async function learnCategorySkill(folderId: string, modelId: string, force: boolean, maxNewSamples: number, action: 'learn' | 'observe', signal?: AbortSignal) {
  return categorySkillRunSchema.parse(await changeCategorySkill(folderId, action, { force, maxNewSamples, model: isDeepSeekRoute(modelId) ? modelId : selectedTextModel(modelId).modelId, ...getMultimodalClientOverrides(modelId) }, signal));
}
