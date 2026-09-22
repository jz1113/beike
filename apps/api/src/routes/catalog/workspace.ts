import { workspaceIdSchema, workspaceWriteSchema } from '@beike/contracts/workshopWorkspace';
import { jsonFail, jsonOk } from '../../core/handler';
import { safeErrorMessage } from '../../core/validate';
import { workshopWorkspaceRepository as repository, WorkspaceConflict } from '../../repositories/workshop';

export async function GET(req: Request) {
  const id = workspaceIdSchema.safeParse(new URL(req.url).searchParams.get('mode'));
  if (!id.success) return jsonFail('无效的工坊模式', 400);
  try {
    return jsonOk(await repository.read(id.data), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return jsonFail('工作区读取失败，已保留原记录，请检查本地服务', 500);
  }
}

export async function PUT(req: Request) {
  const id = workspaceIdSchema.safeParse(new URL(req.url).searchParams.get('mode'));
  if (!id.success) return jsonFail('无效的工坊模式', 400);
  const body = await req.text();
  if (Buffer.byteLength(body) > 8 * 1024 * 1024) return jsonFail('工作区超过 8 MB，请减少内嵌图片后保存', 413, 'payload_too_large');
  let data;
  try { data = workspaceWriteSchema.parse(JSON.parse(body)); }
  catch { return jsonFail('工作区格式不正确', 400); }
  if (data.snapshot.mode !== id.data) return jsonFail('工作区模式不一致', 400);
  try {
    return jsonOk(await repository.write(id.data, data.revision, data.snapshot));
  } catch (error) {
    if (error instanceof WorkspaceConflict) {
      return jsonFail(safeErrorMessage(error, '工作区已被其他窗口更新'), 409, 'conflict');
    }
    return jsonFail('工作区保存失败，请重试', 500);
  }
}
