import type { PetPose } from './atlas';

const feedPoses: Record<string, PetPose> = {
  dragging: 'working',
  uploading: 'working',
  analyzing: 'working',
  success: 'success',
  partial: 'failed',
  error: 'failed',
};

export function resolvePetPose(input: {
  preview?: PetPose | null;
  feedPhase?: string | null;
  flash?: PetPose | null;
  busy?: boolean;
}): PetPose {
  if (input.preview) return input.preview;
  const fed = input.feedPhase ? feedPoses[input.feedPhase] : undefined;
  if (fed) return fed;
  if (input.flash) return input.flash;
  if (input.busy) return 'working';
  return 'idle';
}
