export interface ImageTaskKeyInput {
  batchId: string;
  productId: string;
  storyboardRevision: number;
  shotNo: number;
  prompt: string;
  selectedImageUrls: string[];
  model: string;
  aspectRatio: string;
  quality: string;
  outputSize?: string;
  attempt?: number;
}

/** FNV-1a 32-bit, stable across Node and browsers. */
export function stableHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizePromptForKey(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim();
}

export function buildImageTaskKey(input: ImageTaskKeyInput): string {
  const promptHash = stableHash(normalizePromptForKey(input.prompt));
  const selectedImageHash = stableHash([...input.selectedImageUrls].sort().join('\n'));
  const base = [
    input.batchId,
    input.productId,
    String(input.storyboardRevision),
    String(input.shotNo),
    promptHash,
    selectedImageHash,
    input.model,
    input.aspectRatio,
    input.quality,
    ...(input.outputSize ? [`output=${input.outputSize}`] : []),
  ].join(':');
  return input.attempt && input.attempt > 0 ? `${base}:a${input.attempt}` : base;
}

export type MergedTaskAction = 'reuse_success' | 'attach_running' | 'create';

export interface ExistingImageTask {
  key: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
}

export function resolveTaskMergeAction(existing: ExistingImageTask | undefined): MergedTaskAction {
  if (!existing) return 'create';
  if (existing.status === 'SUCCESS') return 'reuse_success';
  if (existing.status === 'PENDING' || existing.status === 'IN_PROGRESS') return 'attach_running';
  return 'create';
}
