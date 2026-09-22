import { workshopBatchCreateSchema, workshopBatchIdSchema, workshopBatchRenameSchema, workshopBatchWriteSchema } from '@beike/contracts/workshopBatches';
import { workshopBatchEventRequestSchema } from '@beike/contracts/workshopPipeline';
import { applyWorkshopBatchEvent, WorkshopBatchGateError } from '../../services/workshopPipeline/batchEvents';
import { AppError } from '../../core/errors';
import { jsonFail, jsonOk } from '../../core/handler';
import { readJsonBody, safeErrorMessage } from '../../core/validate';
import {
  workshopBatchRepository as repository,
  WorkshopBatchConflict,
  WorkshopBatchNotFound,
} from '../../repositories/workshop';

function mapBatchError(error: unknown): Response {
  if (error instanceof WorkshopBatchNotFound) return jsonFail('批次不存在或已删除', 404, 'not_found');
  if (error instanceof WorkshopBatchConflict) {
    return jsonFail(safeErrorMessage(error, '批次冲突'), 409, 'conflict');
  }
  if (error instanceof WorkshopBatchGateError) return jsonFail(error.message, error.status, error.code);
  if (error instanceof AppError) return jsonFail(error.message, error.status, error.code);
  return jsonFail('批次操作失败，请检查本地服务后重试', 500, 'internal_error');
}

const noStore = { headers: { 'Cache-Control': 'no-store' } };

export async function LIST() {
  try { return jsonOk({ batches: await repository.list() }, noStore); }
  catch (error) { return mapBatchError(error); }
}

export async function ACTIVE() {
  try { return jsonOk({ batch: await repository.getActive() }, noStore); }
  catch (error) { return mapBatchError(error); }
}

export async function CREATE(req: Request) {
  try {
    const body = workshopBatchCreateSchema.parse(await readJsonBody(req, {}));
    return jsonOk({ batch: await repository.create(body.name) }, 201);
  } catch (error) {
    if (error instanceof WorkshopBatchConflict || error instanceof WorkshopBatchNotFound) return mapBatchError(error);
    return jsonFail('新建批次参数不正确', 400);
  }
}

export async function GET(id: string) {
  const parsedId = workshopBatchIdSchema.safeParse(id);
  if (!parsedId.success) return jsonFail('批次标识不正确', 400);
  try { return jsonOk({ batch: await repository.get(parsedId.data) }, noStore); }
  catch (error) { return mapBatchError(error); }
}

export async function PUT(req: Request, id: string) {
  const parsedId = workshopBatchIdSchema.safeParse(id);
  if (!parsedId.success) return jsonFail('批次标识不正确', 400);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 8 * 1024 * 1024) return jsonFail('当前批次超过 8 MB，请减少内嵌图片后保存', 413, 'payload_too_large');
  try {
    const body = workshopBatchWriteSchema.parse(JSON.parse(raw));
    return jsonOk(await repository.write(parsedId.data, body.revision, body.snapshot));
  } catch (error) {
    if (error instanceof WorkshopBatchConflict || error instanceof WorkshopBatchNotFound) return mapBatchError(error);
    return jsonFail('批次内容格式不正确', 400);
  }
}

export async function RENAME(req: Request, id: string) {
  const parsedId = workshopBatchIdSchema.safeParse(id);
  if (!parsedId.success) return jsonFail('批次标识不正确', 400);
  try {
    const body = workshopBatchRenameSchema.parse(await readJsonBody(req));
    return jsonOk({ batch: await repository.rename(parsedId.data, body.name) });
  } catch (error) {
    if (error instanceof WorkshopBatchConflict || error instanceof WorkshopBatchNotFound) return mapBatchError(error);
    return jsonFail('批次名称不能为空，且不能超过 120 个字符', 400);
  }
}

export async function DUPLICATE(id: string) {
  const parsedId = workshopBatchIdSchema.safeParse(id);
  if (!parsedId.success) return jsonFail('批次标识不正确', 400);
  try { return jsonOk({ batch: await repository.duplicate(parsedId.data) }, 201); }
  catch (error) { return mapBatchError(error); }
}

export async function EVENTS(req: Request, id: string) {
  const parsedId = workshopBatchIdSchema.safeParse(id);
  if (!parsedId.success) return jsonFail('批次标识不正确', 400);
  try {
    const body = workshopBatchEventRequestSchema.parse(await readJsonBody(req));
    return jsonOk(await applyWorkshopBatchEvent(parsedId.data, body.revision, body.event));
  } catch (error) {
    if (error instanceof WorkshopBatchConflict || error instanceof WorkshopBatchNotFound || error instanceof AppError) {
      return mapBatchError(error);
    }
    return jsonFail('批次事件格式不正确', 400);
  }
}

export async function ARCHIVE_ACTIVE(req?: Request) {
  try {
    const body = req ? await readJsonBody(req, {}) : {};
    const force = Boolean((body as { force?: boolean }).force);
    return jsonOk({ batch: await repository.archiveActive({ force }) }, 201);
  }
  catch (error) { return mapBatchError(error); }
}

export async function CLEAR_HISTORY() {
  try { return jsonOk(await repository.clearHistory()); }
  catch (error) { return mapBatchError(error); }
}
