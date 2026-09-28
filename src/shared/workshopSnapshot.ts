import type { WorkshopPipelineState } from './contracts/workshopPipeline';
import {
  workshopSnapshotSchema as transportSnapshotSchema,
  workspaceWriteSchema as transportWorkspaceWriteSchema,
  type WorkshopSnapshot,
  type WorkshopSnapshotV1,
  type WorkshopSnapshotV2,
} from './contracts/workshopWorkspace';
import {
  workshopBatchSchema as transportBatchSchema,
  workshopBatchWriteSchema as transportBatchWriteSchema,
} from './contracts/workshopBatches';
import { legacyStageToStatus } from './domain/workshop/workshopPipeline/viewStage';

export function emptyPipelineState(status: WorkshopPipelineState['status'] = 'draft'): WorkshopPipelineState {
  return {
    status,
    planRevision: 0,
    storyboardRevision: 0,
    diversityContext: { groupSignatures: [], actionIds: [], sceneIds: [] },
    runs: [],
  };
}

export function upgradeSnapshot(snapshot: WorkshopSnapshotV1 | WorkshopSnapshotV2): WorkshopSnapshotV2 {
  if (snapshot.version === 2) return snapshot;
  const tasks = snapshot.items.flatMap((item) => item.tasks);
  return {
    ...snapshot,
    version: 2,
    pipeline: emptyPipelineState(legacyStageToStatus({
      currentStage: snapshot.currentStage,
      itemCount: snapshot.items.length,
      hasStoryboard: snapshot.items.some((item) => item.prompts.length > 0),
      generating: tasks.some((task) => task.status === 'PENDING' || task.status === 'IN_PROGRESS'),
      hasFailedTasks: tasks.some((task) => task.status === 'FAILURE'),
      allTasksSucceeded: tasks.length > 0 && tasks.every((task) => task.status === 'SUCCESS'),
    })),
  };
}

export const workshopSnapshotSchema = transportSnapshotSchema.transform(upgradeSnapshot);
export const workspaceWriteSchema = transportWorkspaceWriteSchema.extend({ snapshot: workshopSnapshotSchema });
export const workshopBatchSchema = transportBatchSchema.extend({ snapshot: workshopSnapshotSchema });
export const workshopBatchWriteSchema = transportBatchWriteSchema.extend({ snapshot: workshopSnapshotSchema });
export type WorkshopBatch = ReturnType<typeof workshopBatchSchema.parse>;
export type { WorkshopSnapshot };
