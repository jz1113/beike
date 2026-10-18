import { useState } from 'react';
import { normalizeReasoningEffort, type ReasoningEffort } from '@shared/domain/assistant/reasoning';

const key = 'beike_assistant_reasoning_by_model';

export function useAssistantReasoning(model: string) {
  const [preferences, setPreferences] = useState<Record<string, ReasoningEffort>>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      if (!Object.keys(value).length) {
        const savedModel =
          localStorage.getItem('beike_assistant_selected_model') ||
          localStorage.getItem('ai_assistant_model') ||
          model;
        const legacy = localStorage.getItem('beike_assistant_reasoning_effort');
        if (legacy) value[savedModel] = normalizeReasoningEffort(savedModel, legacy);
      }
      return value;
    } catch {
      return {};
    }
  });

  const effort = normalizeReasoningEffort(model, preferences[model]);

  const setEffort = (value: ReasoningEffort) => {
    const next = { ...preferences, [model]: normalizeReasoningEffort(model, value) };
    setPreferences(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* Storage is optional. */
    }
  };

  return [effort, setEffort] as const;
}
