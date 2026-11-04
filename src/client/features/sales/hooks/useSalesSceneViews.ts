import type { SalesAssetDraftPersistence } from '../model/salesAssetDraft';
import type { SalesSceneCandidate } from '@shared/domain/sales';
import { generateSalesAssetGrid } from '../api/salesAssetViews';
import { SCENE_VIEWS, readSceneViews, type SceneSupplementView } from '../model/salesSceneViews';
import { useSalesAssetViews, type SalesAssetBackground } from './useSalesAssetViews';
import { readSalesAssetCreation, readSalesAssetJobId } from '../model/salesAssetCreation';

export function useSalesSceneViews(scene?: SalesSceneCandidate, draft?: SalesAssetDraftPersistence, background?: SalesAssetBackground<SceneSupplementView>) {
  return useSalesAssetViews<SceneSupplementView>({
    draft, background, creationMode: !scene || Boolean(readSalesAssetCreation(scene.dimensions)),
    creation: readSalesAssetCreation(scene?.dimensions), jobId: readSalesAssetJobId(scene?.dimensions),
    initial: () => readSceneViews(scene), definitions: SCENE_VIEWS,
    referenceKeys: ['main', 'left', 'right', 'reverse'], prefix: 'scene-grid',
    generate: (request, signal, onStage, onProgress) => generateSalesAssetGrid('scene', request, signal, onStage, onProgress),
  });
}
