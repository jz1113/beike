import { jsonResponse } from '../../../core/http';

/**
 * 官方预置种子资产接口
 * 已按照用户要求彻底停用，严禁向资产库写入任何虚拟/垃圾预置数据。
 */
export async function POST(_req: Request) {
  return jsonResponse({
    success: true,
    message: '官方预置资产已禁用',
    seeded: {
      scenes: 0,
      outfits: 0,
      actions: 0,
      personas: 0,
    },
  });
}
