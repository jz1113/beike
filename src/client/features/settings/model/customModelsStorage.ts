import type { WorkflowModel } from './workflowModel';
import { repairWorkflowModelsForSettings } from '@shared/domain/models/workflowModels';
import { isValidWorkflowModelList } from '@shared/domain/models/workflowModelStorage';
import { reconcileStoredWorkflowDefaults } from '@shared/domain/models/workflowModelDefaults';

export const CUSTOM_MODELS_KEY = 'custom_models';
export const CUSTOM_MODELS_BACKUP_KEY = 'custom_models.bak';

/** Model collection and its business defaults must either both save or retain the previous values. */
export function persistCustomModels(models: WorkflowModel[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  let previous: string | null = null;
  let hasWritten = false;
  try {
    previous = localStorage.getItem(CUSTOM_MODELS_KEY);
    const repaired = repairWorkflowModelsForSettings(models);
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(repaired));
    hasWritten = true;
    reconcileStoredWorkflowDefaults(repaired, localStorage);
    return true;
  } catch {
    if (hasWritten) {
      try { if (previous === null) localStorage.removeItem(CUSTOM_MODELS_KEY); else localStorage.setItem(CUSTOM_MODELS_KEY, previous); } catch { /* Storage may be unavailable. */ }
    }
    return false;
  }
}

function backupCorruptValue(raw: string) {
  try { localStorage.setItem(CUSTOM_MODELS_BACKUP_KEY, raw); } catch { /* Keep original source on quota failure. */ }
}

export function loadCustomModels(previous: WorkflowModel[] = []): {
  models: WorkflowModel[]; recoveredFromBackup: boolean; invalid: boolean;
} {
  if (typeof localStorage === 'undefined') return { models: previous, recoveredFromBackup: false, invalid: false };
  try {
    const saved = localStorage.getItem(CUSTOM_MODELS_KEY);
    if (saved === null) return { models: previous, recoveredFromBackup: false, invalid: false };
    try {
      const parsed: unknown = JSON.parse(saved);
      if (isValidWorkflowModelList(parsed)) return { models: repairWorkflowModelsForSettings(parsed), recoveredFromBackup: false, invalid: false };
      if (Array.isArray(parsed)) {
        const models = repairWorkflowModelsForSettings(parsed);
        backupCorruptValue(saved);
        return { models: models.length ? models : previous, recoveredFromBackup: false, invalid: true };
      }
    } catch { /* Try a previously saved backup before backing up the corrupt source. */ }
    const backup = localStorage.getItem(CUSTOM_MODELS_BACKUP_KEY);
    if (backup && backup !== saved) {
      try {
        const parsedBackup: unknown = JSON.parse(backup);
        if (isValidWorkflowModelList(parsedBackup)) return { models: repairWorkflowModelsForSettings(parsedBackup), recoveredFromBackup: true, invalid: true };
      } catch { /* Preserve current in-memory list. */ }
    }
    backupCorruptValue(saved);
    return { models: previous, recoveredFromBackup: false, invalid: true };
  } catch {
    return { models: previous, recoveredFromBackup: false, invalid: true };
  }
}
