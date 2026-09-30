import { z } from 'zod';

const assistantIdSchema = z.string().trim().min(1).max(255);

export const assistantAttachmentSchema = z.object({
  type: z.enum(['image', 'video', 'document']),
  url: z.string().max(12_000_000).optional(),
  name: z.string().max(1024).optional(),
  extractedText: z.string().max(100_000).optional(),
}).passthrough();

export const assistantMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(100_000),
  attachments: z.array(assistantAttachmentSchema).max(50).optional(),
}).passthrough();

export const workspaceSnapshotSchema = z.object({
  /** 仅用于理解当前可见工作区；不传原始媒体、完整提示词或画布坐标。 */
  workspaceType: z.enum(['canvas', 'workshop', 'generate', 'assets', 'home', 'other']).optional(),
  title: z.string().max(160).optional(),
  summary: z.string().max(1_200).optional(),
  nodeCount: z.number().int().min(0).max(10_000).optional(),
  nodeTypes: z.record(z.string(), z.number().int().min(0).max(10_000)).optional(),
  nodes: z.array(z.object({
    type: z.string().max(40),
    title: z.string().max(160).optional(),
    role: z.string().max(40).optional(),
    status: z.string().max(40).optional(),
  })).max(12).optional(),
  /** 当前用户在画布中主动选中的节点摘要；媒体本体由消息附件单独传递。 */
  selectedNode: z.object({
    type: z.string().max(40),
    title: z.string().max(160).optional(),
    role: z.string().max(40).optional(),
    status: z.string().max(40).optional(),
  }).optional(),
  production: z.object({
    aspect: z.string().max(16).optional(),
    shotCount: z.number().int().min(0).max(1_000).optional(),
  }).optional(),
}).optional();

export const clientContextSchema = z.object({
  currentView: z.string().optional(),
  workshopStep: z.number().optional(),
  productTitle: z.string().optional(),
  productItemId: z.string().optional(),
  selectedArchId: z.string().optional(),
  workshopMode: z.string().optional(),
  assetLibraryTab: z.string().optional(),
  assetLibraryKeyword: z.string().optional(),
  workspaceSnapshot: workspaceSnapshotSchema,
});

export const mcpServerConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  enabled: z.boolean().optional(),
});

export const turnStartBodySchema = z
  .object({
    threadId: assistantIdSchema.nullish(),
    turnId: assistantIdSchema.nullish(),
    messages: z.array(assistantMessageSchema).min(1).max(500).refine(
      (messages) => messages.some((message) => message.role === 'user' && (message.content.trim() || message.attachments?.length)),
      '缺少用户消息或附件',
    ),
    model: z.string().max(200).nullish(),
    reasoningEffort: z.enum(['auto', 'low', 'medium', 'high', 'xhigh']).optional().default('medium'),
    runMode: z.enum(['auto', 'plan', 'act']).optional().default('auto'),
    referenceScope: z.enum(['auto', 'sample', 'all', 'none']).optional().default('auto'),
    historyLimit: z.number().int().min(1).max(500).nullish(),
    customBaseUrl: z.string().max(2048).nullish(),
    customApiKey: z.string().max(4096).nullish(),
    systemPrompt: z.string().max(100_000).nullish(),
    skillId: z.string().max(128).nullish(),
    allowedTools: z.array(z.string().max(128)).max(50).nullish(),
    enableAgentTools: z.boolean().nullish(),
    fallbackOrder: z.array(z.string().max(200)).max(256).optional(),
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
  turnId: assistantIdSchema,
  approvalId: assistantIdSchema,
  decision: z.enum(['accept', 'decline', 'acceptForSession', 'cancel']),
});

export const turnInterruptBodySchema = z.object({
  turnId: assistantIdSchema,
});

export type TurnStartBody = z.infer<typeof turnStartBodySchema>;
export type TurnApproveBody = z.infer<typeof turnApproveBodySchema>;
export type ClientContext = z.infer<typeof clientContextSchema>;
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
