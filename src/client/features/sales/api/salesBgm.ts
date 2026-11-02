import { apiFetch } from '@client/shared/api/apiClient';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import {
  salesBgmImportBodySchema, salesBgmImportResponseSchema, salesBuiltinBgmsResponseSchema,
} from '@shared/contracts/salesBgm';
import type { SalesBgmCandidate } from '@shared/domain/sales';

export interface SalesBgmImportInput {
  title?: string;
  audioUrl?: string;
  videoUrl?: string;
  builtinId?: string;
  startSec?: number;
  durationSec?: number;
}

async function readResponse(response: Response, fallback: string): Promise<unknown> {
  const result: unknown = await response.json().catch(() => null);
  const data = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  if (!response.ok || data.success !== true) {
    if (response.status === 404 && (!data.error || data.error === '接口不存在')) {
      throw new Error('配乐导入接口尚未启用，请重启贝壳服务后重试');
    }
    throw new Error(typeof data.error === 'string' ? data.error : fallback);
  }
  return result;
}

export async function fetchSalesBuiltinBgms(signal?: AbortSignal): Promise<SalesBgmCandidate[]> {
  const response = await apiFetch('/api/sales/studio-bgms/builtin', { signal });
  const parsed = salesBuiltinBgmsResponseSchema.safeParse(await readResponse(response, '读取内置短配乐失败'));
  if (!parsed.success) throw new Error('内置短配乐数据格式不完整');
  return parsed.data.bgms;
}

export async function importSalesBgm(input: SalesBgmImportInput, signal?: AbortSignal): Promise<SalesBgmCandidate> {
  const body = salesBgmImportBodySchema.parse(input);
  const response = await apiFetch('/api/sales/studio-bgms/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  const parsed = salesBgmImportResponseSchema.safeParse(await readResponse(response, '保存背景音乐失败'));
  if (!parsed.success) throw new Error('保存配乐返回的数据不完整，请重试');
  invalidateGlobalAssetCache();
  return parsed.data.bgm;
}
