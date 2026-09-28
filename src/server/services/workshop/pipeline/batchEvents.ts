import {
  workshopBatchEventSchema,
  type WorkshopBatchEvent,
} from '@shared/contracts/workshopPipeline';
import { statusToViewStage, reduceBatch, normalizeBatchStatus, evaluateStage4Gate } from '@shared/domain/workshop/workshopPipeline';
import { AppError } from '../../../core/errors';
import {
  workshopBatchRepository,
  WorkshopBatchConflict,
} from '../../../repositories/workshop';
import type { WorkshopSnapshot } from '@shared/contracts/workshopWorkspace';

export class WorkshopBatchGateError extends AppError {
  constructor(message: string, readonly blockers: Array<{ code: string; message: string }> = []) {
    super(message, 409, 'gate_blocked');
  }
}

function applyEventToSnapshot(snapshot: WorkshopSnapshot, event: WorkshopBatchEvent): WorkshopSnapshot {
  if (event.type === 'COMPLETE_BATCH') {
    const gate = evaluateStage4Gate({
      tasks: snapshot.items.flatMap((item) => (item.tasks || [])
        .filter((task) => task.resultStatus !== 'superseded')
        .map((task) => ({
          id: task.id,
          terminal: task.status === 'SUCCESS' || task.status === 'FAILURE',
          recoveryRequired: Boolean(task.recoveryRequired),
        }))),
      products: snapshot.items.map((item) => ({
        id: item.id,
        selected: item.selected !== false,
        skipped: Boolean(item.skipped),
        acceptedCount: (item.tasks || []).filter((task) => task.outputReview === 'accepted').length,
        reviewDecisions: (item.tasks || []).map((task) => task.outputReview || 'unreviewed'),
      })),
      copywritingReady: true,
      userCompleted: true,
    });
    if (!gate.passed) {
      throw new WorkshopBatchGateError(gate.blockers[0]?.message || '还不能完成本批次', gate.blockers);
    }
  }
  const current = normalizeBatchStatus(snapshot.pipeline?.status);
  const reduced = reduceBatch(current, event, { pausedFrom: snapshot.pipeline?.pausedFrom });
  if (!reduced.ok) {
    throw new AppError(reduced.reason, 409, 'illegal_transition');
  }

  const pipeline = { ...snapshot.pipeline, status: reduced.next };
  if (reduced.next === 'paused') {
    pipeline.pausedFrom = reduced.pausedFrom ?? current;
  } else if (event.type === 'RESUME_RUN') {
    delete pipeline.pausedFrom;
  }
  if (event.type === 'CONFIRM_PLAN') pipeline.planRevision = event.planRevision;
  if (event.type === 'APPROVE_STORYBOARD') pipeline.storyboardRevision = event.storyboardRevision;

  return {
    ...snapshot,
    currentStage: statusToViewStage(reduced.next),
    pipeline,
  };
}

export async function applyWorkshopBatchEvent(id: string, revision: number, event: WorkshopBatchEvent) {
  const parsed = workshopBatchEventSchema.parse(event);
  const current = await workshopBatchRepository.get(id);
  if (current.revision !== revision) {
    throw new WorkshopBatchConflict('当前批次已在其他窗口更新，请重新加载后继续');
  }
  if (current.status === 'archived') {
    throw new WorkshopBatchConflict('历史批次为只读内容，请复制为新批次后再编辑');
  }
  const snapshot = applyEventToSnapshot(current.snapshot, parsed);
  const written = await workshopBatchRepository.write(id, revision, snapshot);
  return {
    ...written,
    status: snapshot.pipeline.status,
    snapshot,
  };
}
