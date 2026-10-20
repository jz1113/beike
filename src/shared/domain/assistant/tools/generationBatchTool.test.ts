import { describe, expect, it } from 'vitest';
import { clientContextSchema } from '../../../contracts/assistant';
import { toolGetViewCapabilities, toolGetWorkshopState } from './clientTools';
import { getOpenAITools, getToolDefinition } from './defs';
import { parseToolAction, summarizeToolResult, toolDisplayName } from './resultPresentation';

const generationBatches = [{
  sourceId: 'draft:a',
  entries: [{ id: 'image:1', title: '首图', mediaType: 'image' as const }],
}];

describe('batch generation tool contract', () => {
  it('requires only manifest source and entry IDs with bounded entries', () => {
    const tool = getToolDefinition('trigger_generate_batch');
    expect(tool).toMatchObject({ scope: 'client', approval: 'per_turn' });
    expect(tool?.openaiTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        sourceId: expect.objectContaining({ type: 'string', minLength: 1, maxLength: 255 }),
        entryIds: expect.objectContaining({ type: 'array', minItems: 1, maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 255 } }),
      },
      required: ['sourceId', 'entryIds'],
      additionalProperties: false,
    });
    expect(tool?.openaiTool.function.description).toContain('写提示词、整理方案不代表生成授权');
    expect(getOpenAITools([], ['trigger_generate']).some((item) => item.function.name === 'trigger_generate_batch')).toBe(false);
    expect(getOpenAITools([], ['trigger_generate_batch'])).toHaveLength(1);
  });

  it('validates manifest limits, required fields and duplicate identities', () => {
    expect(clientContextSchema.safeParse({ generationBatches }).success).toBe(true);
    expect(clientContextSchema.safeParse({}).success).toBe(true);
    expect(clientContextSchema.safeParse({ generationBatches: [] }).success).toBe(true);
    const groups = Array.from({ length: 8 }, (_, index) => ({ ...generationBatches[0], sourceId: String(index) }));
    const entries = Array.from({ length: 30 }, (_, index) => ({ ...generationBatches[0].entries[0], id: String(index) }));
    expect(clientContextSchema.safeParse({ generationBatches: groups }).success).toBe(true);
    expect(clientContextSchema.safeParse({ generationBatches: [{ sourceId: 'a', entries }] }).success).toBe(true);
    for (const invalid of [
      null,
      [...groups, { ...groups[0], sourceId: 'extra' }],
      [{ sourceId: 'a', entries: [...entries, { ...entries[0], id: 'extra' }] }],
      [generationBatches[0], generationBatches[0]],
      [{ sourceId: 'a', entries: [entries[0], entries[0]] }],
      [{ entries }],
      [{ sourceId: 'a', entries: [{ id: 'x', mediaType: 'image' }] }],
      [{ sourceId: 'a', entries: [{ id: 'x', title: '', mediaType: 'document' }] }],
    ]) {
      expect(clientContextSchema.safeParse({ generationBatches: invalid }).success).toBe(false);
    }
  });

  it('shows a request receipt rather than claiming submission or generation success', () => {
    const raw = JSON.stringify({ success: true, action: 'generate_batch', sourceId: 'draft:a', entryIds: ['image:1'], operationId: 'batch_1' });
    expect(toolDisplayName('trigger_generate_batch')).toBe('请求批量生成');
    expect(summarizeToolResult(raw)).toBe('已请求批量提交，客户端将校验后执行');
    expect(parseToolAction(raw)).toMatchObject({ action: 'generate_batch', sourceId: 'draft:a', operationId: 'batch_1' });
    expect(summarizeToolResult('{"success":false,"error":"清单无效"}')).toBe('清单无效');
  });

  it('advertises batch capability only with a current client manifest', () => {
    const ctx = { origin: 'http://localhost', documents: [], clientContext: { currentView: 'canvas', generationBatches } };
    expect(JSON.parse(toolGetWorkshopState(ctx)).workshopState.generationBatches).toEqual(generationBatches);
    expect(JSON.parse(toolGetViewCapabilities({}, ctx))).toMatchObject({
      actions: ['planning_from_workspace_summary', 'request_generate_batch'],
      availableTools: ['trigger_generate_batch'],
    });
    expect(JSON.parse(toolGetViewCapabilities({}, { ...ctx, clientContext: { currentView: 'canvas' } })).availableTools).toEqual([]);
  });
});
