import { listAssetOrganization, applyAssetOrganizationMutation } from '@server/repositories/assetOrganizationActions';
import { jsonResponse } from '../../../../core/http';

export async function readOrganization() {
  return jsonResponse({ success: true, ...(await listAssetOrganization()) });
}

export async function mutateOrganization(body: Record<string, any>) {
  try {
    const result = await applyAssetOrganizationMutation(body);
    return jsonResponse({ success: true, ...(await listAssetOrganization()), ...(result || {}) });
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : '分类操作失败' }, 400);
  }
}
