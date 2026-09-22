import { jsonFail, jsonOk } from '../../../core/handler';
import { readJsonBody } from '../../../core/validate';
import { promptAssetTypeSchema, lifecycleActionSchema, disableAssetRequestSchema } from '@beike/contracts/promptAsset';
import { applyLifecycleAction } from '../../../services/promptAsset/lifecycle';
import { refreshAssetQuality } from '../../../services/promptAsset/scoring';
import { listUsageEvents } from '../../../repositories/promptAsset';
import { countsFromEvents } from '../../../services/promptAsset/scoring';
import { firstPassAcceptRate, retryRate } from '@beike/domain/promptAsset';
import { AppError } from '../../../core/errors';

const TYPES = promptAssetTypeSchema;

export async function LIFECYCLE(req: Request, type: string, id: string, action: string) {
  const parsedType = TYPES.safeParse(type);
  const parsedAction = lifecycleActionSchema.safeParse(action);
  if (!parsedType.success || !parsedAction.success) return jsonFail('资产类型或操作不正确', 400);
  try {
    const body = parsedAction.data === 'disable' ? disableAssetRequestSchema.parse(await readJsonBody(req, {})) : {};
    const registry = await applyLifecycleAction(parsedType.data, id, parsedAction.data, body);
    return jsonOk({ registry });
  } catch (error) {
    if (error instanceof AppError) return jsonFail(error.message, error.status, error.code);
    return jsonFail('资产生命周期操作失败', 400);
  }
}

export async function PERFORMANCE(type: string, id: string) {
  const parsedType = TYPES.safeParse(type);
  if (!parsedType.success) return jsonFail('资产类型不正确', 400);
  const events = await listUsageEvents(id);
  const counts = countsFromEvents(events);
  const quality = await refreshAssetQuality(id);
  return jsonOk({
    assetType: parsedType.data,
    assetId: id,
    counts,
    firstPassAcceptRate: firstPassAcceptRate(counts),
    retryRate: retryRate(counts),
    quality,
  });
}
