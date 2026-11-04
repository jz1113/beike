import { useEffect, useState } from 'react';
import { eligibleSalesImages } from '@shared/domain/sales';
import type { SalesCollectionState } from '../model/salesCollectionDraft';
import { autoMaskProductImage } from '../api/salesProductFaceImage';

const productKey = (state: SalesCollectionState) => JSON.stringify([state.activeProductId, state.collectedProductUrl]);
const selected = (state: SalesCollectionState) => eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);

export function useSalesAutoProductFaces(state: SalesCollectionState, commit: (recipe: (state: SalesCollectionState) => SalesCollectionState) => void) {
  const scope = productKey(state);
  const [failures, setFailures] = useState<{ scope: string; urls: string[] }>({ scope: '', urls: [] });
  const pending = selected(state).filter((image) => !Object.hasOwn(state.productionPlan.productFaceEdits, image.url));
  const failedUrls = new Set(scope === failures.scope ? failures.urls : []);
  const failed = pending.filter((image) => failedUrls.has(image.url)).length;
  const nextUrl = state.productionPlan.pendingVideoTask ? undefined : pending.find((image) => !failedUrls.has(image.url))?.url;

  useEffect(() => {
    if (!nextUrl) return;
    const controller = new AbortController();
    void autoMaskProductImage(nextUrl, controller.signal).then((edit) => {
      if (controller.signal.aborted) return;
      commit((current) => {
        const plan = current.productionPlan;
        if (scope !== productKey(current) || plan.pendingVideoTask || Object.hasOwn(plan.productFaceEdits, nextUrl)
          || !selected(current).some((image) => image.url === nextUrl)) return current;
        return { ...current, productionPlan: { ...plan, productFaceEdits: { ...plan.productFaceEdits, [nextUrl]: edit } } };
      });
    }).catch(() => {
      if (!controller.signal.aborted) setFailures((previous) => ({
        scope, urls: [...(previous.scope === scope ? previous.urls : []), nextUrl],
      }));
    });
    return () => controller.abort();
  }, [commit, scope, nextUrl]);

  return { pending: pending.length, failed, retry: () => setFailures({ scope, urls: [] }) };
}
