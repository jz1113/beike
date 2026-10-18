import { readSseEvents } from '@client/shared/api/sseStream';

export const readAssistantEvents = readSseEvents as (
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
) => AsyncGenerator<{ type: string; [key: string]: any }>;

