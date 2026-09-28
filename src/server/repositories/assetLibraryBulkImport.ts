import { db } from './access';
import { validateAssetEdit, pickAssetEditFields } from '@shared/domain/assets/assetEdit';
import { importLibraryBackup, remapItemData, withOrganization } from './assetLibraryImport';

export async function bulkImportAssets(body: Record<string, any>, items: Array<{ assetType: string; data: Record<string, unknown>; sourceId?: string }>) {
    const created: unknown[] = [];
    const sceneIds = new Map<string, string>();
    await db.$transaction(async (tx) => {
      const maps = await importLibraryBackup(body, created, tx);
      for (const item of [...items].sort((a, b) => Number(b.assetType === 'scene') - Number(a.assetType === 'scene'))) {
        const { assetType } = item;
        const data = await withOrganization(assetType, remapItemData(pickAssetEditFields(assetType, item.data || {}), maps), tx);
        const error = validateAssetEdit(assetType, pickAssetEditFields(assetType, data));
        if (error) throw new Error(error);
        if (assetType === 'action') {
          const actionData = data as { sceneId?: string | null };
          if (actionData.sceneId) actionData.sceneId = sceneIds.get(String(actionData.sceneId)) || null;
        }
        if (!assetType || !data) continue;
        if (assetType === 'scene') {
          const scene = await tx.sceneAsset.create({ data: data as any });
          if (item.sourceId) sceneIds.set(item.sourceId, scene.id);
          created.push(scene);
        } else if (assetType === 'outfit') {
          created.push(await tx.outfitAsset.create({ data: data as any }));
        } else if (assetType === 'action') {
          created.push(await tx.actionAsset.create({ data: data as any }));
        } else if (assetType === 'persona') {
          created.push(await tx.personaAsset.create({ data: data as any }));
        } else if (assetType === 'full_prompt') {
          created.push(await tx.fullPromptAsset.create({ data: data as any }));
        }
      }
    }, { timeout: 60_000 });
  return created;
}
