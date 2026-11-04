import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';

/** Reference-video duration constraints, separate from the generated video's duration. */
export function salesDepthVideoLimits(selection: string, outputDurationSec: number) {
  const model = canonicalModelId(upstreamModalityModelId('video', selection)).toLowerCase();
  if (/^wan3/.test(model)) return { min: 1, max: Math.min(15, 30 - outputDurationSec) };
  if (/seedance-2[.-](?:0|5)(?:\D|$)/.test(model)) return { min: 2, max: /seedance-2[.-]5/.test(model) ? 30 : 15 };
  return { min: 0, max: Infinity };
}
