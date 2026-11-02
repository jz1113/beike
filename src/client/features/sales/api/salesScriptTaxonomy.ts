import { apiRequest } from '@client/shared/api/apiRequest';
import { salesScriptTaxonomyListSchema, salesScriptTaxonomyResultSchema, type ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';

async function responseJSON(response: Response): Promise<unknown> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') throw new Error(data.error);
    throw new Error(response.status === 404 ? '当前服务尚未启用自定义分类与风格，请重启贝壳服务后重试。' : '分类与风格保存失败，请重试');
  }
  return data;
}

export async function listScriptTaxonomy(signal?: AbortSignal) {
  const response = await apiRequest('GET', '/api/sales/script-taxonomy', { signal });
  return salesScriptTaxonomyListSchema.parse(await responseJSON(response)).items;
}

export async function createScriptTaxonomy(kind: ScriptTaxonomyKind, name: string) {
  const response = await apiRequest('POST', '/api/sales/script-taxonomy', {
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name }),
  });
  return salesScriptTaxonomyResultSchema.parse(await responseJSON(response)).item;
}

export async function renameScriptTaxonomy(id: string, name: string) {
  const response = await apiRequest('PATCH', '/api/sales/script-taxonomy/{id}', {
    pathParams: { id }, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  return salesScriptTaxonomyResultSchema.parse(await responseJSON(response)).item;
}

export async function deleteScriptTaxonomy(id: string) {
  const response = await apiRequest('DELETE', '/api/sales/script-taxonomy/{id}', { pathParams: { id } });
  await responseJSON(response);
}
