import { parseOutputDimensions } from '@shared/domain/media/outputDimensions';
import { GPT_IMAGE_GATEWAY_SAFE_SIZES } from '@shared/domain/models/model-adapters/image/gptImageSafeSizes';

/** Pick the supported canvas closest to an arbitrary delivered aspect to minimize cropping. */
export function closestWorkshopOutputAspect(size: string): string {
  const dimensions = parseOutputDimensions(size);
  if (!dimensions) return '3:4';
  const target = dimensions.width / dimensions.height;
  return Object.keys(GPT_IMAGE_GATEWAY_SAFE_SIZES).filter(aspect => aspect !== 'smart').reduce((best, aspect) => {
    const distance = (value: string) => { const [width, height] = value.split(':').map(Number); return Math.abs(Math.log(target / (width / height))); };
    return distance(aspect) < distance(best) ? aspect : best;
  }, '3:4');
}

/** A single-shot redraw must not double the dimensions of a grid-derived shot. */
export function savedWorkshopOutputSize(task?: { outputSize?: string; gridSize?: string }): string | undefined {
  if (task?.outputSize) return task.outputSize;
  const match = /^(\d+)x(\d+)$/.exec(task?.gridSize || '');
  if (!match || Number(match[1]) < 2 || Number(match[2]) < 2) return undefined;
  return `${Math.floor(Number(match[1]) / 2)}x${Math.floor(Number(match[2]) / 2)}`;
}
