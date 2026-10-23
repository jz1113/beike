import type { TextProtocol } from '@shared/domain/models/textProtocol';

export interface SalesRouteHeaders {
  model?: string;
  textProtocol?: TextProtocol;
  customBaseUrl?: string;
  customApiKey?: string;
  signal?: AbortSignal;
}
