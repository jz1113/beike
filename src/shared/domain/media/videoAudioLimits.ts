import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import { referenceAudioAllowed } from './videoCapabilities';

export interface ReferenceAudioDurationLimits {
  minSeconds: number;
  maxSeconds: number;
  totalMaxSeconds?: number;
}

/** Limits apply to the submission copy; the voice-library original stays intact. */
export function referenceAudioDurationLimits(model: string): ReferenceAudioDurationLimits | null {
  if (!referenceAudioAllowed(model)) return null;
  const id = canonicalModelId(model).toLowerCase();
  if (id === 'viduq4-preview') return { minSeconds: 3, maxSeconds: 12 };
  if (id === 'minimax-h3') return { minSeconds: 2, maxSeconds: 15, totalMaxSeconds: 15 };
  if (/seedance-2[.-]5(?:\D|$)/.test(id)) return { minSeconds: 2, maxSeconds: 30, totalMaxSeconds: 30 };
  if (/seedance-2[.-]0(?:\D|$)/.test(id)) return { minSeconds: 2, maxSeconds: 15, totalMaxSeconds: 15 };
  if (/^wan3\.0-video(?:-prime)?$/.test(id)) return { minSeconds: 1, maxSeconds: 15, totalMaxSeconds: 15 };
  return null;
}
