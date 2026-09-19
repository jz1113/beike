import { workspaceIdSchema, workspaceWriteSchema } from '@beike/contracts/workshopWorkspace';
import { createWorkspaceRepository, WorkspaceConflict } from '../../services/workshopWorkspace';
import { prisma } from '../../repositories/db';
import { jsonResponse } from '../../core/http';
const repository = createWorkspaceRepository(prisma);
export async function GET(req: Request) {
  const id = workspaceIdSchema.safeParse(new URL(req.url).searchParams.get('mode'));
  if (!id.success) return jsonResponse({ error: '无效的工坊模式' }, 400);
  try { return jsonResponse(await repository.read(id.data), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return jsonResponse({ error: '工作区读取失败，已保留原记录，请检查本地服务' }, 500); }
}
export async function PUT(req: Request) {
  const id = workspaceIdSchema.safeParse(new URL(req.url).searchParams.get('mode'));
  if (!id.success) return jsonResponse({ error: '无效的工坊模式' }, 400);
  const body = await req.text();
  if (Buffer.byteLength(body) > 8 * 1024 * 1024) return jsonResponse({ error: '工作区超过 8 MB，请减少内嵌图片后保存' }, 413);
  let data;
  try { data = workspaceWriteSchema.parse(JSON.parse(body)); }
  catch { return jsonResponse({ error: '工作区格式不正确' }, 400); }
  if (data.snapshot.mode !== id.data) return jsonResponse({ error: '工作区模式不一致' }, 400);
  try { return jsonResponse(await repository.write(id.data, data.revision, data.snapshot)); }
  catch (error) { return jsonResponse({ error: error instanceof WorkspaceConflict ? error.message : '工作区保存失败，请重试' }, error instanceof WorkspaceConflict ? 409 : 500); }
}
