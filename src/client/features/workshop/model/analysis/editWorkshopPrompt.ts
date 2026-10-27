import { buildBoundGroupGridPrompt } from '@shared/domain/workshop/workshop-pipeline';
import type { BatchProductItem } from '../batchTypes';

/** A shot edit and its grid projection must change in one state update. */
export function editWorkshopPrompt(item: BatchProductItem, index: number, value: string): BatchProductItem {
  const shot = item.prompts[index];
  if (!shot || shot.prompt === value || item.isAnalyzing
    || item.tasks.some(task => task.status === 'IN_PROGRESS' || task.recoveryRequired)) return item;
  const prompts = item.prompts.map((entry, position) => position === index
    ? { ...entry, prompt: value, revision: ((entry as { revision?: number }).revision || 0) + 1, resultStatus: 'current' as const } : entry);
  const selected = prompts.filter(entry => entry.selected !== false);
  const gridPrompt = selected.length === 4 && selected.every(entry => entry.prompt.trim())
    ? buildBoundGroupGridPrompt([...selected].sort((a, b) => a.shot_no - b.shot_no)) : undefined;
  return {
    ...item, prompts, gridPrompt, copywriting: undefined, masterGridUrl: undefined,
    // The grid contains all four shots; a single edit invalidates the entire grid.
    tasks: item.tasks.map(task => task.shot_no === shot.shot_no || task.gridTaskKey || task.gridSourceUrl
      ? { ...task, resultStatus: 'superseded' as const } : task),
  };
}
