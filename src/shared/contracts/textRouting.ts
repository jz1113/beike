import { z } from 'zod';

/** Independent of apiFormat: Responses remains a separate transport selection. */
export const TextProtocolSchema = z.enum(['auto', 'openai', 'gemini', 'anthropic']);
export const TextRequestRoutingFields = { textProtocol: TextProtocolSchema.optional() };
export type TextProtocol = z.infer<typeof TextProtocolSchema>;
