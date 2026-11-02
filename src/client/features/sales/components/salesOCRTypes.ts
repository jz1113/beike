import type { SalesCollectionState } from '../model/salesCollectionDraft';
import type { SalesOCRProgress, SalesOCRReport } from '../model/salesWorkflow';

export interface SalesSummaryActions {
  pending: boolean;
  error: string | null;
  onRun: (model: string) => void;
  onCancel: () => void;
  onScrollToProduction?: () => void;
}

export interface SalesOCRProps {
  state: SalesCollectionState;
  disabled: boolean;
  onChange: (patch: Partial<SalesCollectionState>) => void;
  onRecognize: (url?: string, force?: boolean) => void;
  onCancel: () => void;
  progress: SalesOCRProgress | null;
  report: SalesOCRReport | null;
  onRetryFailed: () => void;
  summaryActions?: SalesSummaryActions;
}
