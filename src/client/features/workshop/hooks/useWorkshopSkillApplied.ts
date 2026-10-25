import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { applyInvalidationToItems } from '../model/workspace/applyInvalidation';
import type { BatchProductItem } from '../model/batchTypes';

export function useWorkshopSkillApplied(
  setItems: Dispatch<SetStateAction<BatchProductItem[]>>,
  setStoryboardRevision: Dispatch<SetStateAction<number>>,
  analyzeConfigRevisionRef: MutableRefObject<number>,
) {
  useEffect(() => {
    const applied = () => {
      analyzeConfigRevisionRef.current += 1;
      setItems(previous => applyInvalidationToItems(previous, { type: 'architecture' }));
      setStoryboardRevision(revision => revision + 1);
    };
    window.addEventListener('workshop-skill-applied', applied);
    return () => window.removeEventListener('workshop-skill-applied', applied);
  }, [setItems, setStoryboardRevision, analyzeConfigRevisionRef]);
}
