import { AppError } from '../../core/errors';
import {
  canTransition,
  type PromptAssetStatus,
  type PromptAssetType,
} from '@beike/domain/promptAsset';
import { getRegistry, updateRegistryStatus, upsertRegistry } from '../../repositories/promptAsset';
import { ensureRegistryForAsset } from './registry';

const NEXT: Record<string, PromptAssetStatus> = {
  'submit-review': 'pending_review',
  publish: 'published',
  disable: 'disabled',
};

export async function applyLifecycleAction(
  assetType: PromptAssetType,
  sourceAssetId: string,
  action: 'submit-review' | 'publish' | 'disable' | 'create-version',
  extra: { reason?: string } = {},
) {
  const current = await ensureRegistryForAsset(assetType, sourceAssetId);
  if (action === 'create-version') {
    const nextVersion = current.version + 1;
    return upsertRegistry({
      assetType,
      sourceAssetId,
      status: 'pending_review',
      provenance: current.provenance,
      sourceRef: current.id,
      version: nextVersion,
    });
  }
  const next = NEXT[action];
  if (!next) throw new AppError('不支持的资产生命周期操作', 400, 'invalid_action');
  if (!canTransition(current.status, next)) {
    throw new AppError(`当前状态 ${current.status} 不能执行 ${action}`, 409, 'illegal_transition');
  }
  await updateRegistryStatus(current.id, {
    status: next,
    disabledReason: action === 'disable' ? extra.reason || '人工停用' : null,
  });
  return getRegistry(assetType, sourceAssetId);
}
