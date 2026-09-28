import { appearanceAudience } from '@shared/domain/assets/appearanceAudience';
import { jsonResponse } from '../../../../core/http';
import { assetLibraryQueries } from '../../../../repositories/assetLibraryQueries';
import { resolveShotsForScene, type ActionLike } from '@shared/domain/assets/sceneBundle';
import { stableAssetCode } from '@shared/domain/assets/assetSampling';
import { readOrganization } from './organization';
import { buildLibraryListWhere } from '../../../../services/library/listWhere';
import { attachFullPromptSource, attachRegistryMeta } from '../../../../services/promptAsset/registry';

const buildPromptPreview = (reversePromptZh: unknown, maxLen = 80): string | undefined => {
  const text = typeof reversePromptZh === 'string' ? reversePromptZh.trim() : '';
  if (!text) return undefined;
  return text.slice(0, maxLen);
};

const slimAsset = <T extends Record<string, unknown>>(row: T, extra: string[] = []) => {
  const base: Record<string, unknown> = {
    id: row.id,
    title: row.title ?? row.name,
    name: row.name,
    tags: row.tags,
    dimensions: row.dimensions,
    appearanceAudience: row.appearanceAudience,
    category: row.category,
    isFavorite: row.isFavorite,
    usageCount: row.usageCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    code: row.code,
    coverUrl: row.coverUrl ?? row.avatarUrl,
    suitableAnatomy: row.suitableAnatomy,
    shotType: row.shotType,
    albumName: row.albumName,
    registry: row.registry,
    provenance: row.provenance,
    contentEligible: row.contentEligible,
    productionBlockReason: row.productionBlockReason,
  };
  for (const key of extra) {
    if (row[key] !== undefined) base[key] = row[key];
  }
  return base;
};

export async function executeLibraryGet(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('view') === 'organization') return readOrganization();
  const assetType = searchParams.get('type') || 'scene'; // scene | scene_bundle | outfit | action | persona | all
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50));
  const slim = searchParams.get('slim') === '1';
  const detailId = searchParams.get('id');

  if (detailId && assetType !== 'all') {
    if (assetType === 'scene' || assetType === 'scene_bundle') {
      const item = await assetLibraryQueries.sceneDetail(detailId);
      if (!item) return jsonResponse({ success: false, error: '资产不存在' }, 404);
      const linkedActions = (item as typeof item & { actions?: ActionLike[] }).actions || [];
      return jsonResponse({
        success: true,
        assetType,
        item: {
          ...(await attachRegistryMeta('scene', [item]))[0],
          shots: resolveShotsForScene(item, linkedActions),
          shotCount: resolveShotsForScene(item, linkedActions).length,
        },
      });
    }
    if (assetType === 'outfit') {
      const item = await assetLibraryQueries.outfitDetail(detailId);
      if (!item) return jsonResponse({ success: false, error: '资产不存在' }, 404);
      return jsonResponse({ success: true, assetType, item: (await attachRegistryMeta(assetType, [item]))[0] });
    }
    if (assetType === 'action') {
      const item = await assetLibraryQueries.actionDetail(detailId);
      if (!item) return jsonResponse({ success: false, error: '资产不存在' }, 404);
      return jsonResponse({ success: true, assetType, item: (await attachRegistryMeta(assetType, [item]))[0] });
    }
    if (assetType === 'persona') {
      const item = await assetLibraryQueries.personaDetail(detailId);
      if (!item) return jsonResponse({ success: false, error: '资产不存在' }, 404);
      return jsonResponse({ success: true, assetType, item: (await attachRegistryMeta(assetType, [item]))[0] });
    }
    if (assetType === 'full_prompt') {
      const item = await assetLibraryQueries.groupDetail(detailId);
      if (!item) return jsonResponse({ success: false, error: '资产不存在' }, 404);
      return jsonResponse({ success: true, assetType, item: (await attachFullPromptSource([item]))[0] });
    }
  }

  if (assetType === 'all' && searchParams.get('export') === '1') {
    const result = await assetLibraryQueries.exportAll();
    return jsonResponse({ success: true, complete: true, mediaIncluded: false, ...result,
      counts: Object.fromEntries(Object.entries(result).map(([key, rows]) => [key, rows.length])) });
  }

  if (assetType === 'all') {
    const rawLists = await assetLibraryQueries.listAll(page);

    const [scenes, outfits, actions, personas, fullPrompts] = await Promise.all([
      attachRegistryMeta('scene', rawLists[0]), attachRegistryMeta('outfit', rawLists[1]),
      attachRegistryMeta('action', rawLists[2]), attachRegistryMeta('persona', rawLists[3]),
      attachFullPromptSource(rawLists[4]),
    ]);

    return jsonResponse({
      success: true,
      slim,
      page,
      hasMore: [scenes, outfits, actions, personas, fullPrompts].some(rows => rows.length === 1000),
      scenes: scenes.map((s) => {
        const linkedActions = (s as typeof s & { actions?: ActionLike[] }).actions || [];
        const shots = resolveShotsForScene(s, linkedActions);
        const mapped = {
          ...s,
          code: stableAssetCode('S', String(s.id)),
          shots,
          shotCount: shots.length,
        };
        return slim
          ? slimAsset(mapped as Record<string, unknown>, ['shotCount', 'spatialType', 'lighting'])
          : mapped;
      }),
      outfits: outfits.map((o) => {
        const mapped = { ...o, appearanceAudience: appearanceAudience(o, true), code: stableAssetCode('O', String(o.id)) };
        return slim ? slimAsset(mapped as Record<string, unknown>) : mapped;
      }),
      actions: actions.map((a) => {
        const mapped = { ...a, code: stableAssetCode('A', String(a.id)) };
        return slim ? slimAsset(mapped as Record<string, unknown>, ['action', 'camera']) : mapped;
      }),
      personas: personas.map((p) => {
        const mapped = { ...p, appearanceAudience: appearanceAudience(p), code: stableAssetCode('P', String(p.id)) };
        return slim ? slimAsset(mapped as Record<string, unknown>, ['description']) : mapped;
      }),
      fullPrompts: fullPrompts.map((f) => {
        const mapped = { ...f, code: stableAssetCode('R', String(f.id)) };
        if (!slim) return mapped;
        const slimmed = slimAsset(mapped as Record<string, unknown>, [
          'albumName',
          'productCategoryIds',
          'isUniversal',
          'sceneSummary',
          'outfitSummary',
          'actionSummary',
          'personaSummary',
          'sourceImageIndex',
          'sourceImageIndices',
          'groupIndex',
          'contentSummary',
          'architectureSummary',
          'replaceableSlots',
          'shotPromptsJson',
          'hasHuman',
          'provenance',
          'sourceMother',
        ]);
        const preview = buildPromptPreview(f.reversePromptZh);
        if (preview) slimmed.promptPreview = preview;
        return slimmed;
      }),
    });
  }

  if (assetType === 'scene' || assetType === 'scene_bundle') {
    const where: any = await buildLibraryListWhere('scene', searchParams, ['title', 'description', 'reversePrompt', 'tags']);

    const { total, items } = await assetLibraryQueries.scenes(where, page, pageSize);

    const mappedItems = items.map((item) => {
      const code = stableAssetCode('S', String(item.id));
      if (assetType !== 'scene_bundle') {
        return { ...item, code };
      }
      const linkedActions = (item as typeof item & { actions?: ActionLike[] }).actions || [];
      const shots = resolveShotsForScene(item, linkedActions);
      return {
        ...item,
        code,
        shots,
        shotCount: shots.length,
      };
    });

    return jsonResponse({
      success: true,
      assetType,
      total,
      page,
      pageSize,
      items: await attachRegistryMeta('scene', mappedItems),
    });
  }

  if (assetType === 'outfit') {
    const where: any = await buildLibraryListWhere('outfit', searchParams, ['title', 'top', 'bottom', 'reversePrompt', 'tags']);
    const { total, items } = await assetLibraryQueries.outfits(where, page, pageSize);
    const mappedItems = items.map((item) => ({ ...item, code: stableAssetCode('O', String(item.id)) }));
    return jsonResponse({ success: true, assetType, total, page, pageSize, items: await attachRegistryMeta('outfit', mappedItems) });
  }

  if (assetType === 'action') {
    const where: any = await buildLibraryListWhere('action', searchParams, ['title', 'action', 'reversePrompt', 'tags']);
    const { total, items } = await assetLibraryQueries.actions(where, page, pageSize);
    const mappedItems = items.map((item) => ({ ...item, code: stableAssetCode('A', String(item.id)) }));
    return jsonResponse({ success: true, assetType, total, page, pageSize, items: await attachRegistryMeta('action', mappedItems) });
  }

  if (assetType === 'persona') {
    const where: any = await buildLibraryListWhere('persona', searchParams, ['name', 'description', 'reversePrompt', 'tags']);
    const { total, items } = await assetLibraryQueries.personas(where, page, pageSize);
    const mappedItems = items.map((item) => ({ ...item, code: stableAssetCode('P', String(item.id)) }));
    return jsonResponse({ success: true, assetType, total, page, pageSize, items: await attachRegistryMeta('persona', mappedItems) });
  }

  if (assetType === 'full_prompt') {
    const baseWhere: any = await buildLibraryListWhere('full_prompt', searchParams, ['title', 'albumName', 'reversePromptZh', 'reversePromptEn', 'tags', 'sceneSummary', 'outfitSummary', 'actionSummary']);
    const where: any = {
      AND: [
        baseWhere,
        { OR: [{ groupIndex: { not: null } }, { provenance: { not: 'legacy_single' } }] },
      ],
    };

    const { total, items } = await assetLibraryQueries.groups(where, page, pageSize);
    const mappedItems = items.map((item) => ({
      ...item,
      code: stableAssetCode('R', String(item.id)),
    }));
    return jsonResponse({ success: true, assetType, total, page, pageSize, items: await attachFullPromptSource(mappedItems) });
  }

  return jsonResponse({ error: `不支持的资产类型: ${assetType}` }, 400);
}
