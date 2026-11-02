import { beforeEach, expect, it, vi } from 'vitest';
import { addSalesImageImportFiles, salesImageImportData } from '../model/salesImageImport';
import { importSalesImageAsset } from './salesImageImport';
import { createSalesMaterial } from './salesMaterials';
import { submitSalesAssetJob } from './salesAssetJobs';

vi.mock('./salesMaterials', () => ({ createSalesMaterial: vi.fn() }));
vi.mock('./salesAssetJobs', () => ({ submitSalesAssetJob: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it.each(['persona', 'scene'] as const)('creates the main-image %s asset directly when background generation is off', async (kind) => {
  const data = { name: '只导入' }; const signal = new AbortController().signal;
  await importSalesImageAsset(kind, data, undefined, signal);
  expect(createSalesMaterial).toHaveBeenCalledWith(kind, data, signal);
  expect(submitSalesAssetJob).not.toHaveBeenCalled();
});

it.each(['persona', 'scene'] as const)('queues the selected model and stable upload key for %s without creating a duplicate base asset', async (kind) => {
  const item = addSalesImageImportFiles(kind, [], [new File(['image'], 'ref.jpg', { type: 'image/jpeg' })], []).items[0];
  const data = salesImageImportData(kind, item, '/ref.jpg', { personaGroup: 'female', sceneSpace: 'indoor' });
  const signal = new AbortController().signal;
  await importSalesImageAsset(kind, data, { model: 'selected-reference-model' }, signal);
  expect(submitSalesAssetJob).toHaveBeenCalledWith(kind, { key: item.key, model: 'selected-reference-model', references: ['/ref.jpg'] }, data, undefined, signal);
  expect(createSalesMaterial).not.toHaveBeenCalled();
  await importSalesImageAsset(kind, data, { model: 'selected-reference-model' }, signal);
  expect(vi.mocked(submitSalesAssetJob).mock.calls[1][1].key).toBe(item.key);
});

it('rejects incomplete background requests without silently saving a plain asset', async () => {
  const signal = new AbortController().signal;
  await expect(importSalesImageAsset('persona', {}, { model: '' }, signal)).rejects.toThrow('请选择生图模型');
  expect(createSalesMaterial).not.toHaveBeenCalled(); expect(submitSalesAssetJob).not.toHaveBeenCalled();
});
