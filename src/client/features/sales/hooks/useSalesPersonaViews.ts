import type { SalesAssetDraftPersistence } from '../model/salesAssetDraft';
import type { SalesPersonaCandidate } from '@shared/domain/sales';
import { generateSalesAssetGrid } from '../api/salesAssetViews';
import { PERSONA_VIEWS, readPersonaViews, type SupplementView } from '../model/salesPersonaViews';
import { useSalesAssetViews, type SalesAssetBackground } from './useSalesAssetViews';

export function useSalesPersonaViews(persona?: SalesPersonaCandidate, draft?: SalesAssetDraftPersistence, background?: SalesAssetBackground<SupplementView>) {
  return useSalesAssetViews<SupplementView>({
    draft, background, initial: () => readPersonaViews(persona), definitions: PERSONA_VIEWS,
    referenceKeys: ['main', 'face'], prefix: 'persona-grid',
    generate: (request, signal, onStage, onProgress) => generateSalesAssetGrid('persona', request, signal, onStage, onProgress),
  });
}
