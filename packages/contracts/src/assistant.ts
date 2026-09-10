import { z } from 'zod';

export const clientContextSchema = z.object({
  currentView: z.string().optional(),
  workshopStep: z.number().optional(),
  productTitle: z.string().optional(),
  productItemId: z.string().optional(),
  selectedArchId: z.string().optional(),
  workshopMode: z.string().optional(),
  assetLibraryTab: z.string().optional(),
  assetLibraryKeyword: z.string().optional(),
});

export const mcpServerConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  enabled: z.boolean().optional(),
});

export const turnStartBodySchema = z
  .object({
    threadId: z.string().nullish(),
    turnId: z.string().nullish(),
    messages: z.array(z.unknown()).nullish(),
    model: z.string().max(200).nullish(),
    runMode: z.enum(['auto', 'plan', 'act']).optional().default('auto'),
    referenceScope: z.enum(['auto', 'sample', 'all', 'none']).optional().default('auto'),
    historyLimit: z.number().int().min(1).max(500).nullish(),
    customBaseUrl: z.string().max(2048).nullish(),
    customApiKey: z.string().max(4096).nullish(),
    systemPrompt: z.string().max(100_000).nullish(),
    skillId: z.string().max(128).nullish(),
    allowedTools: z.array(z.string().max(128)).max(50).nullish(),
    enableAgentTools: z.boolean().nullish(),
    fallbackModels: z.array(z.string().max(200)).max(20).nullish(),
    language: z.string().max(32).nullish(),
    clientContext: clientContextSchema.nullish(),
    mcpServers: z.array(mcpServerConfigSchema).max(10).nullish(),
    sessionApprovals: z.array(z.string()).max(50).nullish(),
    /** When true, emits only Codex-style item/* events (no legacy delta/tool_call/tool_result) */
    legacyEvents: z.boolean().optional().default(true),
    /** Enable LLM-based context compression when messages exceed threshold */
    enableCompression: z.boolean().optional().default(false),
    /** Threshold for triggering compression (number of messages) */
    compressThreshold: z.number().int().min(10).max(500).optional().default(40),
    /** Number of recent messages to keep verbatim (not summarized) */
    compressKeepRecent: z.number().int().min(2).max(50).optional().default(10),
  })
  .passthrough();

export const turnApproveBodySchema = z.object({
  turnId: z.string().min(1),
  approvalId: z.string().min(1),
  decision: z.enum(['accept', 'decline', 'acceptForSession', 'cancel']),
});

export const turnInterruptBodySchema = z.object({
  turnId: z.string().min(1),
});

/** @deprecated alias */
export const chatBodySchema = turnStartBodySchema;

export type TurnStartBody = z.infer<typeof turnStartBodySchema>;
export type TurnApproveBody = z.infer<typeof turnApproveBodySchema>;
export type ClientContext = z.infer<typeof clientContextSchema>;
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
