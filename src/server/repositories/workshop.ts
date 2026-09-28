import { db } from './access';
import { createWorkshopBatchRepository } from './workshopBatches';
import { createWorkspaceRepository } from './workshopWorkspace';

export { WorkshopBatchConflict, WorkshopBatchNotFound } from './workshopBatches';
export { WorkspaceConflict } from './workshopWorkspace';

export const workshopBatchRepository = createWorkshopBatchRepository(db);
export const workshopWorkspaceRepository = createWorkspaceRepository(db);
