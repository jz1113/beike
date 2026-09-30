import type { WorkshopSnapshot } from '@shared/contracts/workshopWorkspace';
import { serializeWorkspaceSnapshot } from './workspaceSave';

export function downloadWorkspaceDraft(snapshot: WorkshopSnapshot, batchId?: string): void {
  const url = URL.createObjectURL(new Blob([serializeWorkspaceSnapshot(snapshot)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `workshop-draft-${batchId || 'unsaved'}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
