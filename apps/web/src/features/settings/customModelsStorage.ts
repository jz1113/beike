import type { WorkflowModel } from './settingsShared';
import { sortModelsByMultimodalPriority } from '@beike/domain/workflowModels';

export const CUSTOM_MODELS_KEY = 'custom_models';
export const CUSTOM_MODELS_BACKUP_KEY = 'custom_models.bak';

export function persistCustomModels(models: WorkflowModel[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(sortModelsByMultimodalPriority(models)));
    return true;
  } catch {
    return false;
  }
}

function backupCorruptValue(raw: string) {
  try {
    localStorage.setItem(CUSTOM_MODELS_BACKUP_KEY, raw);
  } catch {
    /* ignore quota */
  }
}

export function loadCustomModels(previous: WorkflowModel[] = []): {
  models: WorkflowModel[];
  recoveredFromBackup: boolean;
  invalid: boolean;
} {
  if (typeof localStorage === 'undefined') {
    return { models: previous, recoveredFromBackup: false, invalid: false };
  }
  const saved = localStorage.getItem(CUSTOM_MODELS_KEY);
  if (saved === null) {
    return { models: previous, recoveredFromBackup: false, invalid: false };
  }
  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      return { models: sortModelsByMultimodalPriority(parsed as WorkflowModel[]), recoveredFromBackup: false, invalid: false };
    }
    backupCorruptValue(saved);
    return { models: previous, recoveredFromBackup: false, invalid: true };
  } catch {
    const backup = typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOM_MODELS_BACKUP_KEY) : null;
    let recovered = previous;
    let recoveredFromBackup = false;
    if (backup && backup !== saved) {
      try {
        const parsedBackup = JSON.parse(backup);
        if (Array.isArray(parsedBackup)) {
          recovered = sortModelsByMultimodalPriority(parsedBackup as WorkflowModel[]);
          recoveredFromBackup = true;
        }
      } catch {
        /* ignore */
      }
    }
    if (!recoveredFromBackup) backupCorruptValue(saved);
    return { models: recovered, recoveredFromBackup, invalid: true };
  }
}
