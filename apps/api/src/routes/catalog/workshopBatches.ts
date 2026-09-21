import { workshopBatchCreateSchema, workshopBatchIdSchema, workshopBatchRenameSchema, workshopBatchWriteSchema } from '@beike/contracts/workshopBatches';
import { jsonResponse } from '../../core/http';
import { prisma } from '../../repositories/db';
import { createWorkshopBatchRepository, WorkshopBatchConflict, WorkshopBatchNotFound } from '../../services/workshopBatches';

const repository = createWorkshopBatchRepository(prisma);

function errorResponse(error: unknown) {
  if (error instanceof WorkshopBatchNotFound) return jsonResponse({ error: '批次不存在或已删除' }, 404);
  if (error instanceof WorkshopBatchConflict) return jsonResponse({ error: error.message }, 409);
  return jsonResponse({ error: '批次操作失败，请检查本地服务后重试' }, 500);
}

export async function LIST() {
  try { return jsonResponse({ batches: await repository.list() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return errorResponse(error); }
}

export async function ACTIVE() {
  try { return jsonResponse({ batch: await repository.getActive() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return errorResponse(error); }
}

export async function CREATE(req: Request) {
  try {
    const body = workshopBatchCreateSchema.parse(await req.json().catch(() => ({})));
    return jsonResponse({ batch: await repository.create(body.name) }, { status: 201 });
  } catch (error) {
    if (error instanceof WorkshopBatchConflict || error instanceof WorkshopBatchNotFound) return errorResponse(error);
    return jsonResponse({ error: '新建批次参数不正确' }, 400);
  }
}

export async function GET(id: string) {
  const parsedId = workshopBatchIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: '批次标识不正确' }, 400);
  try { return jsonResponse({ batch: await repository.get(parsedId.data) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return errorResponse(error); }
}

export async function PUT(req: Request, id: string) {
  const parsedId = workshopBatchIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: '批次标识不正确' }, 400);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 8 * 1024 * 1024) return jsonResponse({ error: '当前批次超过 8 MB，请减少内嵌图片后保存' }, 413);
  try {
    const body = workshopBatchWriteSchema.parse(JSON.parse(raw));
    return jsonResponse(await repository.write(parsedId.data, body.revision, body.snapshot));
  } catch (error) {
    if (error instanceof WorkshopBatchConflict || error instanceof WorkshopBatchNotFound) return errorResponse(error);
    return jsonResponse({ error: '批次内容格式不正确' }, 400);
  }
}

export async function RENAME(req: Request, id: string) {
  const parsedId = workshopBatchIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: '批次标识不正确' }, 400);
  try {
    const body = workshopBatchRenameSchema.parse(await req.json());
    return jsonResponse({ batch: await repository.rename(parsedId.data, body.name) });
  } catch (error) {
    if (error instanceof WorkshopBatchConflict || error instanceof WorkshopBatchNotFound) return errorResponse(error);
    return jsonResponse({ error: '批次名称不能为空，且不能超过 120 个字符' }, 400);
  }
}

export async function DUPLICATE(id: string) {
  const parsedId = workshopBatchIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: '批次标识不正确' }, 400);
  try { return jsonResponse({ batch: await repository.duplicate(parsedId.data) }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}

export async function ARCHIVE_ACTIVE() {
  try { return jsonResponse({ batch: await repository.archiveActive() }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}

export async function CLEAR_HISTORY() {
  try { return jsonResponse(await repository.clearHistory()); }
  catch (error) { return errorResponse(error); }
}
