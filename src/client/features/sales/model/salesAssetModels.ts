import { IMAGE_GEN_MODELS } from '@shared/domain/media/drawing';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';

export function supportsSalesAssetReferences(selection: string): boolean {
  const id = upstreamModalityModelId('image', selection);
  return IMAGE_GEN_MODELS.find((model) => model.id === id)?.supportEdits !== false;
}
