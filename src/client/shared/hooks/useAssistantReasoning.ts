import { useEffect, useState } from 'react';
import { normalizeReasoningEffort, type ReasoningEffort } from '@shared/domain/assistant/reasoning';
import { selectedTextModel } from '@shared/domain/models/workflowModelStorage';

const key = 'beike_assistant_reasoning_by_model';

function readStoredMap(fallbackModel: string): Record<string, ReasoningEffort> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    if (!Object.keys(value).length) {
      const savedModel =
        localStorage.getItem('beike_assistant_selected_model') ||
        localStorage.getItem('ai_assistant_model') ||
        fallbackModel;
      const legacy = localStorage.getItem('beike_assistant_reasoning_effort');
      if (legacy) value[savedModel] = normalizeReasoningEffort(savedModel, legacy);
    }
    return value;
  } catch {
    return {};
  }
}

export function readAssistantReasoningEffort(model: string): ReasoningEffort {
  if (!model) return 'auto';
  const map = readStoredMap(model);
  const upstream = selectedTextModel(model).modelId;
  return normalizeReasoningEffort(model, map[model] ?? map[upstream]);
}

export function useAssistantReasoning(model: string) {
  const [preferences, setPreferences] = useState<Record<string, ReasoningEffort>>(() => readStoredMap(model));

  useEffect(() => {
    const sync = () => setPreferences(readStoredMap(model));
    window.addEventListener('assistant_reasoning_updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('assistant_reasoning_updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, [model]);

  const upstream = selectedTextModel(model).modelId;
  const effort = normalizeReasoningEffort(model, preferences[model] ?? preferences[upstream]);

  const setEffort = (value: ReasoningEffort) => {
    const normalized = normalizeReasoningEffort(model, value);
    const next = { ...preferences, [model]: normalized, ...(upstream ? { [upstream]: normalized } : {}) };
    setPreferences(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event('assistant_reasoning_updated'));
    } catch {
      /* Storage is optional. */
    }
  };

  return [effort, setEffort] as const;
}
