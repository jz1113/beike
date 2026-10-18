import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@client/store';
import {
  DEFAULT_ASSISTANT_MODELS,
  enrichAssistantModelDisplay,
  type AssistantModelDisplay,
} from '@client/features/assistant/model/assistantConstants';
import {
  hasWorkflowModelConfiguration,
  getEnabledMultimodalModelsFromSettings,
  repairWorkflowModelsInStorage,
  upstreamModelId,
} from '@shared/domain/models/workflowModels';
import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import { modalityPickerSelections } from '@shared/domain/models/modalityStorage';

interface UseAssistantModelsOptions {
  assistantModel: string;
  setAssistantModel: (model: string) => void;
}

export function useAssistantModels({
  assistantModel,
  setAssistantModel,
}: UseAssistantModelsOptions) {
  const [availableAssistantModels, setAvailableAssistantModels] = useState<AssistantModelDisplay[]>(DEFAULT_ASSISTANT_MODELS);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadCustomAssistantModels = () => {
      repairWorkflowModelsInStorage();

      const syncedChat = modalityPickerSelections('chat');
      let modelsList = DEFAULT_ASSISTANT_MODELS.map(enrichAssistantModelDisplay);
      const multimodalFromSettings = getEnabledMultimodalModelsFromSettings(undefined, 'assistant');
      if (syncedChat) {
        modelsList = syncedChat.map((model) => ({
          id: model.id,
          modelId: model.modelId,
          name: model.name,
          shortName: model.name,
          provider: model.provider,
        }));
      } else if (multimodalFromSettings.length > 0 || hasWorkflowModelConfiguration()) {
        modelsList = multimodalFromSettings.map((m) =>
          enrichAssistantModelDisplay({
            id: m.id,
            name: m.name || m.id,
            shortName: m.shortName || m.name || m.id,
            badge: m.badge,
            provider: m.provider,
          })
        );
      }

      setAvailableAssistantModels(modelsList);

      const savedAssistantModel = localStorage.getItem('beike_assistant_selected_model') || localStorage.getItem('ai_assistant_model') || '';
      let resolvedModel = '';
      if (savedAssistantModel) {
        const cleanSaved = upstreamModelId(savedAssistantModel).toLowerCase().trim();
        const canonicalSaved = canonicalModelId(cleanSaved).toLowerCase();
        const matched = modelsList.find((m) => {
          const identity = m.modelId || m.id;
          const raw = identity.toLowerCase().trim();
          const clean = upstreamModelId(identity).toLowerCase().trim();
          const canonical = canonicalModelId(clean).toLowerCase();
          return (
            m.id.toLowerCase().trim() === savedAssistantModel.toLowerCase().trim() ||
            raw === savedAssistantModel.toLowerCase().trim() ||
            clean === cleanSaved ||
            canonical === canonicalSaved
          );
        });
        if (matched) {
          resolvedModel = matched.id;
        }
      }
      if (!resolvedModel) {
        resolvedModel = modelsList[0]?.id || '';
      }
      if (resolvedModel && useAppStore.getState().assistantModel !== resolvedModel) {
        setAssistantModel(resolvedModel);
      }
    };

    loadCustomAssistantModels();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || ['custom_models', 'beike_assistant_selected_model', 'ai_assistant_model', 'ai_multimodal_model', 'ai_vision_model'].includes(event.key)) loadCustomAssistantModels();
    };
    window.addEventListener('models_updated', loadCustomAssistantModels);
    window.addEventListener('modality_models_updated', loadCustomAssistantModels);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('models_updated', loadCustomAssistantModels);
      window.removeEventListener('modality_models_updated', loadCustomAssistantModels);
      window.removeEventListener('storage', onStorage);
    };
  }, [setAssistantModel]);

  // 全局点击空白处关闭模型下拉菜单
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showModelMenu && modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [showModelMenu]);

  // 当前选中的模型对象
  const currentModelObj =
    availableAssistantModels.find((m) => m.id === assistantModel) ||
    { name: assistantModel, shortName: assistantModel };

  return {
    availableAssistantModels,
    currentModelObj,
    showModelMenu,
    setShowModelMenu,
    modelMenuRef,
  };
}
