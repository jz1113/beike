import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store';
import {
  DEFAULT_ASSISTANT_MODELS,
  enrichAssistantModelDisplay,
} from '@/features/assistant/utils/assistantConstants';
import {
  getEnabledMultimodalModelsFromSettings,
  repairWorkflowModelsInStorage,
  resolveStoredMultimodalModelId,
} from '@beike/domain/workflowModels';

interface UseAssistantModelsOptions {
  assistantModel: string;
  setAssistantModel: (model: string) => void;
}

export function useAssistantModels({
  assistantModel,
  setAssistantModel,
}: UseAssistantModelsOptions) {
  const [availableAssistantModels, setAvailableAssistantModels] = useState<any[]>(DEFAULT_ASSISTANT_MODELS);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadCustomAssistantModels = () => {
      repairWorkflowModelsInStorage();

      let modelsList = DEFAULT_ASSISTANT_MODELS.map(enrichAssistantModelDisplay);
      const multimodalFromSettings = getEnabledMultimodalModelsFromSettings();
      if (multimodalFromSettings.length > 0) {
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

      const resolvedModel = resolveStoredMultimodalModelId(multimodalFromSettings);
      if (useAppStore.getState().assistantModel !== resolvedModel) {
        setAssistantModel(resolvedModel);
      }
    };

    loadCustomAssistantModels();
    window.addEventListener('models_updated', loadCustomAssistantModels);
    return () => window.removeEventListener('models_updated', loadCustomAssistantModels);
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
    availableAssistantModels[0] || { name: assistantModel, shortName: assistantModel };

  return {
    availableAssistantModels,
    currentModelObj,
    showModelMenu,
    setShowModelMenu,
    modelMenuRef,
  };
}
