/** A single-shot redraw must not double the dimensions of a grid-derived shot. */
export function savedWorkshopOutputSize(task?: { outputSize?: string; gridSize?: string }): string | undefined {
  if (task?.outputSize) return task.outputSize;
  const match = /^(\d+)x(\d+)$/.exec(task?.gridSize || '');
  if (!match || Number(match[1]) < 2 || Number(match[2]) < 2) return undefined;
  return `${Math.floor(Number(match[1]) / 2)}x${Math.floor(Number(match[2]) / 2)}`;
}
