import { jsonResponse } from '../../../core/http';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { executeLibraryGet } from '../../../services/library/queries';
import {
  executeLibraryPost,
  executeLibraryPut,
  executeLibraryDeleteByIds,
} from './library/libraryMutations';
import { purgeSeedAssets, clearAllAssets } from './library/libraryMaintenance';
import { executeLibraryDeduplication } from './library/libraryDeduplicate';
import { mutateOrganization } from '../../../services/library/organization';

// 获取原子资产列表与统计（支持按类型、分类、收藏、关键词过滤，分页，以及全量 slim 预热）
export async function GET(req: Request) {
  try {
    return await executeLibraryGet(req);
  } catch (error: any) {
    console.error('[AssetLibrary] GET 异常:', error);
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}

// 创建单项原子资产或批量导入
const ORGANIZATION_ACTIONS = new Set([
  'save-product-category',
  'reorder-product-categories',
  'classify-albums',
  'classify-assets',
]);

export async function POST(req: Request) {
  try {
    const cloned = req.clone();
    const body = await cloned.json().catch(() => null);
    if (body && typeof body.action === 'string' && ORGANIZATION_ACTIONS.has(body.action)) {
      return mutateOrganization(body);
    }
    return await executeLibraryPost(req);
  } catch (error: any) {
    console.error('[AssetLibrary] POST 异常:', error);
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}

// 修改原子资产（编辑、修改收藏状态、增加调用计数）
export async function PUT(req: Request) {
  try {
    return await executeLibraryPut(req);
  } catch (error: any) {
    console.error('[AssetLibrary] PUT 异常:', error);
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}

// 删除原子资产（支持单项与多项批量删除、清理种子资产、一键清空及一键智能去重提纯）
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const assetType = searchParams.get('type');
    const id = searchParams.get('id');
    const idsParam = searchParams.get('ids');
    const action = searchParams.get('action');

    // 清理官方预置种子资产
    if (action === 'purge-seed') {
      return await purgeSeedAssets();
    }

    // 🌟 一键智能提纯、分类归位与去重
    if (action === 'deduplicate' || action === 'reclassify') {
      return await executeLibraryDeduplication();
    }

    // 🌟 一键清空指定类型资产
    if (action === 'clear-all') {
      const targetType = searchParams.get('type') || 'all';
      return await clearAllAssets(targetType);
    }

    const idsToDelete = idsParam ? idsParam.split(',').filter(Boolean) : id ? [id] : [];
    if (!assetType || idsToDelete.length === 0) {
      return jsonResponse({ error: '缺少 assetType 或 id/ids' }, 400);
    }

    return await executeLibraryDeleteByIds(assetType, idsToDelete);
  } catch (error: any) {
    console.error('[AssetLibrary] DELETE 异常:', error);
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}
