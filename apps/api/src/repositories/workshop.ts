import { db } from './access';
import { createWorkshopBatchRepository } from '../services/workshopBatches';
import { createWorkspaceRepository } from '../services/workshopWorkspace';

export { WorkshopBatchConflict, WorkshopBatchNotFound } from '../services/workshopBatches';
export { WorkspaceConflict } from '../services/workshopWorkspace';

export const workshopBatchRepository = createWorkshopBatchRepository(db);
export const workshopWorkspaceRepository = createWorkspaceRepository(db);
