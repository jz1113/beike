import { describe, expect, it } from 'vitest';
import { reconcileStoredWorkflowDefaults, resolveEnabledModelId } from './workflowModelDefaults';
import type { WorkflowCapability } from './workflowModelTypes';

describe('workflowModelDefaults', () => {
  describe('resolveEnabledModelId bidirectional prefix compatibility', () => {
    it('matches bare model ID to openai-responses prefixed route model without falling back', () => {
      const models = [
        { id: 'openai-responses:gpt-5.4-mini' },
        { id: 'openai-responses:gpt-6-luna' },
      ];
      const resolved = resolveEnabledModelId('gpt-6-luna', models);
      expect(resolved).toBe('openai-responses:gpt-6-luna');
    });

    it('matches prefixed route model to bare model ID', () => {
      const models = [
        { id: 'gpt-5.4-mini' },
        { id: 'gpt-6-luna' },
      ];
      const resolved = resolveEnabledModelId('openai-responses:gpt-6-luna', models);
      expect(resolved).toBe('gpt-6-luna');
    });
  });

  it('preserves openai channel models in assistant defaults without falling back', () => {
    const memoryStore: Record<string, string> = {
      ai_assistant_model: 'gpt-6-luna',
      beike_assistant_selected_model: 'gpt-6-luna',
    };

    const mockStorage = {
      getItem: (key: string) => memoryStore[key] ?? null,
      setItem: (key: string, value: string) => { memoryStore[key] = value; },
      removeItem: (key: string) => { delete memoryStore[key]; },
      clear: () => { Object.keys(memoryStore).forEach((k) => delete memoryStore[k]); },
    };

    const models: WorkflowCapability[] = [
      {
        id: 'gpt-5.4-mini',
        channel: 'openai',
        enabled: true,
        isMultimodal: true,
        isAssistant: true,
      },
      {
        id: 'gpt-6-luna',
        channel: 'openai',
        enabled: true,
        isMultimodal: true,
        isAssistant: true,
      },
      {
        id: 'deepseek-v4-flash',
        channel: 'deepseek',
        enabled: true,
        isMultimodal: true,
        isAssistant: true,
      },
    ];

    const result = reconcileStoredWorkflowDefaults(models, mockStorage);
    expect(result.assistant).toBe('openai-responses:gpt-6-luna');
    expect(mockStorage.getItem('beike_assistant_selected_model')).toBe('openai-responses:gpt-6-luna');
  });
});
