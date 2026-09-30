import { Prisma } from '@prisma/client';
import type { DeconstructJobItemInput, DeconstructJobItemResult, DeconstructJobItemSnapshot, DeconstructJobSnapshot, DeconstructJobStatus, DeconstructJobSubmit } from '@shared/contracts/deconstructJobs';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { AppError } from '@server/core/errors';
import { readDeconstructJobResult } from '@server/infrastructure/storage/deconstructJobMedia';
import { db } from './access';
import { unscopedPrisma } from './db';

const activeStates = ['queued', 'running', 'stopping'];
type JobRow = Prisma.DeconstructJobGetPayload<Record<string, never>>;
type ItemRow = Prisma.DeconstructJobItemGetPayload<Record<string, never>>;
const iso = (date: Date | null) => date?.toISOString();

async function itemSnapshot(row: ItemRow, includeData: boolean): Promise<DeconstructJobItemSnapshot> {
  const result = row.resultJson ? JSON.parse(row.resultJson) as DeconstructJobItemResult : undefined;
  if (includeData && result?.ok && 'dataRef' in result && typeof result.dataRef === 'string') {
    result.data = await readDeconstructJobResult(result.dataRef);
  }
  if (!includeData && result?.ok) result.data = null;
  const input = JSON.parse(row.inputJson) as DeconstructJobItemInput;
  if (!includeData) delete input.customSubCategories;
  return {
    ...input, status: row.status as DeconstructJobItemSnapshot['status'],
    ...(row.progressJson ? { progress: JSON.parse(row.progressJson) } : {}),
    ...(result ? { result } : {}), ...(row.error ? { error: row.error } : {}),
    startedAt: iso(row.startedAt), finishedAt: iso(row.finishedAt),
  };
}

async function snapshot(row: JobRow, includeData = true, initialItems?: ItemRow[]): Promise<DeconstructJobSnapshot> {
  const items = initialItems || await db.deconstructJobItem.findMany({ where: { jobId: row.jobId }, orderBy: { position: 'asc' } });
  const config = JSON.parse(row.configJson) as { model?: string };
  return {
    jobId: row.jobId, status: row.status as DeconstructJobStatus,
    items: await Promise.all(items.map(item => itemSnapshot(item, includeData))),
    concurrency: row.concurrency, reviewBeforeSave: row.reviewBeforeSave, model: config.model,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    finishedAt: iso(row.finishedAt), ...(row.error ? { error: row.error } : {}),
  };
}

export async function getDeconstructJob(jobId: string) {
  const job = await db.deconstructJob.findFirst({ where: { jobId } });
  return job ? snapshot(job) : null;
}

export async function listDeconstructJobs() {
  const [active, recent] = await Promise.all([
    db.deconstructJob.findMany({ where: { status: { in: activeStates } }, orderBy: { createdAt: 'desc' } }),
    db.deconstructJob.findMany({ where: { status: { notIn: activeStates } }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);
  const rows = [...active, ...recent];
  return Promise.all(rows.map(row => snapshot(row, false)));
}

export async function createDeconstructJob(input: {
  job: DeconstructJobSubmit; items: DeconstructJobItemInput[]; inputHash: string; configJson: string;
}) {
  const workspaceId = requireWorkspaceId();
  try {
    const created = await db.$transaction(async tx => {
      const existing = await tx.deconstructJob.findFirst({ where: { jobId: input.job.jobId } });
      if (existing) {
        if (existing.inputHash !== input.inputHash) throw new AppError('任务 ID 已对应另一批图集，请核对原任务', 409, 'job_input_conflict');
        throw new AppError('复用已有后台任务', 409, 'existing_deconstruct_job');
      }
      if (await tx.deconstructJob.count({ where: { status: { in: activeStates } } }) >= 5) {
        throw new AppError('当前已有 5 个后台反推任务，请等待完成或停止后继续', 409, 'job_capacity_reached');
      }
      const job = await tx.deconstructJob.create({ data: {
        workspaceId, jobId: input.job.jobId, inputHash: input.inputHash, configJson: input.configJson,
        concurrency: input.job.concurrency, reviewBeforeSave: input.job.reviewBeforeSave,
      } });
      const items: ItemRow[] = [];
      for (const [position, item] of input.items.entries()) items.push(await tx.deconstructJobItem.create({
        data: { workspaceId, jobId: input.job.jobId, itemId: item.id, position, inputJson: JSON.stringify(item) },
      }));
      return { job, items };
    }, { timeout: 20_000 });
    return { reused: false, job: await snapshot(created.job, true, created.items) };
  } catch (error) {
    if (!(error instanceof AppError && error.code === 'existing_deconstruct_job')
      && !(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    const existing = await db.deconstructJob.findFirst({ where: { jobId: input.job.jobId } });
    if (!existing) throw error;
    if (existing.inputHash !== input.inputHash) throw new AppError('任务 ID 已对应另一批图集，请核对原任务', 409, 'job_input_conflict');
    return { reused: true, job: await snapshot(existing) };
  }
}

/** Claim and stop serialize in a transaction; no queued item can be claimed after stop commits. */
export async function claimDeconstructJobItem(jobId: string) {
  return db.$transaction(async tx => {
    const job = await tx.deconstructJob.findFirst({ where: { jobId, status: { in: activeStates }, stopRequested: false } });
    if (!job) return null;
    const item = await tx.deconstructJobItem.findFirst({ where: { jobId, status: 'queued' }, orderBy: { position: 'asc' } });
    if (!item) return null;
    const updated = await tx.deconstructJobItem.updateMany({ where: { id: item.id, status: 'queued' }, data: { status: 'running', startedAt: new Date() } });
    if (!updated.count) return null;
    await tx.deconstructJob.update({ where: { id: job.id }, data: { status: 'running', updatedAt: nextUpdate(job) } });
    return { itemId: item.itemId, input: JSON.parse(item.inputJson) as DeconstructJobItemInput };
  }, { maxWait: 10_000, timeout: 10_000 });
}

export async function commitDeconstructJobDispatch(jobId: string, itemId: string) {
  return db.$transaction(async tx => {
    const job = await tx.deconstructJob.findFirst({ where: { jobId, stopRequested: false, status: { in: activeStates } } });
    if (!job) return false;
    const result = await tx.deconstructJobItem.updateMany({ where: { jobId, itemId, status: 'running' }, data: { dispatchedAt: new Date() } });
    return result.count === 1;
  });
}

export async function updateDeconstructJobProgress(jobId: string, itemId: string, progress: NonNullable<DeconstructJobItemSnapshot['progress']>) {
  await db.$transaction(async tx => {
    const updated = await tx.deconstructJobItem.updateMany({ where: { jobId, itemId, status: 'running' }, data: { progressJson: JSON.stringify(progress) } });
    if (updated.count) await touchJob(tx, jobId);
  });
}

export async function finishDeconstructJobItem(jobId: string, itemId: string, result: DeconstructJobItemResult, status?: 'stopped' | 'interrupted') {
  await db.$transaction(async tx => {
    const updated = await tx.deconstructJobItem.updateMany({
      where: { jobId, itemId, status: 'running' },
      data: { status: status || (result.ok ? 'done' : 'error'), resultJson: JSON.stringify(result), error: result.ok ? null : result.error, finishedAt: new Date() },
    });
    if (updated.count) await touchJob(tx, jobId);
  });
}

const nextUpdate = (job: { updatedAt: Date }) => new Date(Math.max(Date.now(), job.updatedAt.getTime() + 1));
async function touchJob(tx: Prisma.TransactionClient, jobId: string) {
  const job = await tx.deconstructJob.findFirst({ where: { jobId, status: { in: activeStates } } });
  if (job) await tx.deconstructJob.update({ where: { id: job.id }, data: { updatedAt: nextUpdate(job) } });
}

export async function finalizeDeconstructJob(jobId: string) {
  await db.$transaction(async tx => {
    const job = await tx.deconstructJob.findFirst({ where: { jobId, status: { in: activeStates } } });
    if (!job) return;
    const items = await tx.deconstructJobItem.findMany({ where: { jobId }, select: { status: true } });
    if (items.some(item => item.status === 'running' || item.status === 'queued')) return;
    const status = items.some(item => item.status === 'interrupted') ? 'interrupted'
      : job.stopRequested ? 'stopped' : items.some(item => item.status === 'error') ? 'failed' : 'completed';
    await tx.deconstructJob.update({ where: { id: job.id }, data: { status, finishedAt: new Date(), updatedAt: nextUpdate(job) } });
  });
}

export async function stopDeconstructJob(jobId: string) {
  await db.$transaction(async tx => {
    const job = await tx.deconstructJob.findFirst({ where: { jobId } });
    if (!job) throw new AppError('后台反推任务不存在', 404, 'job_not_found');
    if (!activeStates.includes(job.status)) return;
    await tx.deconstructJob.update({ where: { id: job.id }, data: { stopRequested: true, status: 'stopping', updatedAt: nextUpdate(job) } });
    await tx.deconstructJobItem.updateMany({ where: { jobId, status: 'queued' }, data: { status: 'stopped', error: '已停止，未派发模型请求', finishedAt: new Date() } });
  });
  await finalizeDeconstructJob(jobId);
  return (await getDeconstructJob(jobId))!;
}

export async function interruptDeconstructJob(jobId: string, error: string) {
  await db.deconstructJob.updateMany({ where: { jobId, status: { in: activeStates } }, data: { stopRequested: true, error } });
  await db.deconstructJobItem.updateMany({ where: { jobId, status: { in: ['queued', 'running'] } }, data: { status: 'interrupted', error: '调度已中断，请核对资产库及审核候选后手动重试，勿直接重复付费', finishedAt: new Date() } });
}

/** Boot-only recovery, before HTTP listen; never replay requests whose upstream outcome is unknown. */
export async function recoverDeconstructJobsOnBoot() {
  return unscopedPrisma.$transaction(async tx => {
    const jobs = await tx.deconstructJob.findMany({ where: { status: { in: activeStates } }, select: { jobId: true, workspaceId: true } });
    for (const job of jobs) {
      await tx.deconstructJobItem.updateMany({
        where: { ...job, status: { in: ['queued', 'running'] }, dispatchedAt: null },
        data: { status: 'interrupted', error: '服务已重启，尚未派发的任务已暂停，请手动重试', finishedAt: new Date() },
      });
      await tx.deconstructJobItem.updateMany({
        where: { ...job, status: 'running', dispatchedAt: { not: null } },
        data: { status: 'interrupted', error: '服务已重启，模型请求结果未知；请核对资产库和审核候选，勿直接重复付费', finishedAt: new Date() },
      });
      await tx.deconstructJob.updateMany({ where: job, data: { status: 'interrupted', stopRequested: true, finishedAt: new Date(), error: '服务重启后任务已暂停，请核对结果再手动重试；不会自动重放模型请求' } });
    }
    return jobs.length;
  }, { timeout: 20_000 });
}
