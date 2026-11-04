import type { SalesAssetDraftPersistence } from '../model/salesAssetDraft';
import type { SalesPersonaCandidate } from '@shared/domain/sales';
import { generateSalesAssetGrid } from '../api/salesAssetViews';
import { PERSONA_SHEET_VIEWS, readPersonaViews, type SupplementView } from '../model/salesPersonaViews';
import { useSalesAssetViews, type SalesAssetBackground } from './useSalesAssetViews';
import { readSalesAssetCreation, readSalesAssetJobId } from '../model/salesAssetCreation';

export function useSalesPersonaViews(persona?: SalesPersonaCandidate, draft?: SalesAssetDraftPersistence, background?: SalesAssetBackground<SupplementView>) {
  return useSalesAssetViews<SupplementView>({
    draft, background, creationMode: !persona || Boolean(readSalesAssetCreation(persona.dimensions)),
    creation: readSalesAssetCreation(persona?.dimensions), jobId: readSalesAssetJobId(persona?.dimensions),
    initial: () => readPersonaViews(persona), definitions: PERSONA_SHEET_VIEWS,
    referenceKeys: ['main', 'face'], prefix: 'persona-grid',
    generate: (request, signal, onStage, onProgress) => generateSalesAssetGrid('persona', request, signal, onStage, onProgress),
  });
}
