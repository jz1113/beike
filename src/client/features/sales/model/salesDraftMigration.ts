import type { VideoSalesScript } from '@shared/domain/sales';

/** Preserve retired inputs as historical metadata, outside the active generation contract. */
export function archiveSalesFields<T extends { historicalData?: Record<string, unknown> }>(value: T, fields: readonly string[]): T {
  const next = { ...value } as T & Record<string, unknown>;
  const historicalData = { ...value.historicalData };
  for (const field of fields) {
    const raw = next[field];
    if (raw !== undefined && raw !== null && raw !== ''
      && !(field === 'fashionRefs' && typeof raw === 'object' && Object.values(raw).every((item) => !item))) historicalData[field] = raw;
    delete next[field];
  }
  if (Object.keys(historicalData).length) next.historicalData = historicalData;
  return next;
}

export function migrateSalesScript(script: VideoSalesScript): VideoSalesScript {
  const next = archiveSalesFields(script, ['personImagePrompt', 'sceneImagePrompt', 'personFrameUrl', 'sceneFrameUrl']);
  return { ...next, shots: script.shots.map((shot) => {
    const migrated = archiveSalesFields(shot, ['imagePrompt', 'referenceFrameUrl', 'motion', 'textOverlay', 'characterId', 'avatarVoiceId', 'audioUrl']);
    if (String(shot.status) === 'redrawing') {
      migrated.historicalData = { ...migrated.historicalData, status: shot.status, taskId: shot.taskId };
      migrated.status = 'pending';
      migrated.taskId = undefined;
    }
    if (shot.transition !== 'direct_concat' || !['product_image', 'ai_generate'].includes(shot.visualSource)) {
      migrated.historicalData = { ...migrated.historicalData, transition: shot.transition, visualSource: shot.visualSource };
      migrated.transition = 'direct_concat';
      migrated.visualSource = shot.visualSource === 'product_image' ? 'product_image' : 'ai_generate';
    }
    return migrated;
  }) };
}
