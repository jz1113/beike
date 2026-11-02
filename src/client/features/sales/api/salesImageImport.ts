import { audienceDimensions } from '@shared/domain/assets/appearanceAudience';
import type { SalesImageImportKind } from '../model/salesImageImport';
import { createSalesMaterial } from './salesMaterials';
import { submitSalesAssetJob } from './salesAssetJobs';

export async function importSalesImageAsset(kind: SalesImageImportKind, data: Record<string, unknown>, background: { model: string } | undefined, signal: AbortSignal): Promise<void> {
  if (!background) { await createSalesMaterial(kind, data, signal); return; }
  const dimensions = audienceDimensions(data.dimensions);
  const views = audienceDimensions(dimensions[kind === 'persona' ? 'personaViews' : 'sceneViews']);
  const key = dimensions.salesImageImportKey;
  if (!background.model.trim() || typeof key !== 'string' || !key || typeof views.main !== 'string' || !views.main) throw new Error('请选择生图模型并检查导入图片后重试');
  await submitSalesAssetJob(kind, { key, model: background.model, references: [views.main] }, data, undefined, signal);
}
