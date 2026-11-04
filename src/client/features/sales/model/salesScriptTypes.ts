import type { SalesScriptDomain, SalesScriptStatus } from '@shared/domain/sales';

export interface StoredSalesScript {
  id: string;
  title: string;
  videoUrl: string;
  videoHash: string;
  depthVideoUrl?: string;
  depthTaskId?: string;
  depthOperationId?: string;
  status: SalesScriptStatus;
  script: SalesScriptDomain;
  model: string;
  promptVersion: string;
  version: number;
  useCount: number;
  updatedAt: string;
  /** Local eligibility from the raw response, before legacy normalization can discard malformed fields. */
  analysisCacheEligible?: boolean;
}

export interface SalesScriptDraftResult {
  saveWarning?: string;
  depthWarning?: string;
  script: SalesScriptDomain;
  model: string;
  promptVersion: string;
  videoHash: string;
  existingId?: string;
  version?: number;
  status?: SalesScriptStatus;
  cached?: boolean;
}
