import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  type ModalityKind,
  type ModalityModelItem,
  type ModalityGlobalConfig,
} from '../model/modalityModelTypes';
import {
  loadStoredModalityGlobalConfig,
  saveStoredModalityGlobalConfig,
  appendImportedModalityModels,
  loadStoredModalityModels,
  planModalityChannelSync,
  saveStoredModalityModels,
  resetStoredModalityModels,
} from '../model/modalityModelStorage';
import { inferVendorFromModelId } from '../model/modalityMeta';
import {
  modalityHasWorkflowPool,
  notifyWorkflowModels,
  registerWorkflowDefault,
  withLinkedCustomName,
  writeModalityDefaultKey,
} from '../model/modalityDefaultSync';

const MODALITY_LABEL: Record<ModalityKind, string> = {
  chat: '多模态',
  image: '绘画',
  video: '视频',
  three_d: '3D',
  music: '音乐',
  voice: '语音',
  avatar: '数字人',
};

export function useModalityModels(kind: ModalityKind, showToast: (msg: string) => void) {
  // 1. 全局配置
  const [globalConfig, setGlobalConfig] = useState<ModalityGlobalConfig>(() => loadStoredModalityGlobalConfig());

  // 2. 当前模态模型列表
  const [models, setModels] = useState<ModalityModelItem[]>(() => loadStoredModalityModels(kind));

  // 3. 当前聚焦的模型 ID（用于单卡片聚焦控制台）
  const [focusedModelId, setFocusedModelId] = useState<string>('');
  const registerTimer = useRef<number | null>(null);

  const publishDefault = useCallback((model: Pick<ModalityModelItem, 'modelId' | 'name' | 'channelId'>, registerNow: boolean) => {
    const storedId = writeModalityDefaultKey(kind, model.modelId);
    if (!storedId || !modalityHasWorkflowPool(kind)) return;
    const run = () => {
      registerWorkflowDefault(kind, { modelId: storedId, name: model.name, channelId: model.channelId });
      notifyWorkflowModels(kind);
    };
    if (registerTimer.current !== null) window.clearTimeout(registerTimer.current);
    registerTimer.current = null;
    if (registerNow) {
      run();
      return;
    }
    registerTimer.current = window.setTimeout(() => {
      registerTimer.current = null;
      run();
    }, 400);
  }, [kind]);

  useEffect(() => () => {
    if (registerTimer.current !== null) window.clearTimeout(registerTimer.current);
  }, []);

  // 切换模态时重新载入模型，并默认聚焦该模态的默认模型
  useEffect(() => {
    const loaded = loadStoredModalityModels(kind);
    setModels(loaded);
    const defaultItem = loaded.find(m => m.isDefault) || loaded[0];
    if (defaultItem) {
      setFocusedModelId(defaultItem.id);
    }
  }, [kind]);

  // 全局配置持久化
  const updateGlobalConfig = useCallback((updates: Partial<ModalityGlobalConfig>) => {
    setGlobalConfig(prev => {
      const next = { ...prev, ...updates };
      saveStoredModalityGlobalConfig(next);
      return next;
    });
  }, []);

  // 保存全局配置并写入历史记录
  const saveGlobalConfig = useCallback(() => {
    setGlobalConfig(prev => {
      const cleanUrl = prev.baseUrl.trim();
      const cleanKey = prev.apiKey.trim();
      const nextUrls = cleanUrl
        ? Array.from(new Set([cleanUrl, ...prev.baseUrlHistory]))
        : prev.baseUrlHistory;
      const nextKeys = cleanKey
        ? Array.from(new Set([cleanKey, ...prev.apiKeyHistory]))
        : prev.apiKeyHistory;

      const next: ModalityGlobalConfig = {
        ...prev,
        baseUrl: cleanUrl,
        apiKey: cleanKey,
        baseUrlHistory: nextUrls,
        apiKeyHistory: nextKeys,
      };
      saveStoredModalityGlobalConfig(next);
      return next;
    });
    showToast('全局地址与 Key 已保存');
  }, [showToast]);

  // 从下拉中选择 Base URL
  const selectBaseUrl = useCallback((url: string) => {
    setGlobalConfig(prev => {
      const next: ModalityGlobalConfig = {
        ...prev,
        baseUrl: url,
        baseUrlHistory: Array.from(new Set([url, ...prev.baseUrlHistory])),
      };
      saveStoredModalityGlobalConfig(next);
      return next;
    });
    showToast(`全局地址已切换至：${url}`);
  }, [showToast]);

  // 从历史记录中删除 Base URL
  const removeBaseUrlFromHistory = useCallback((urlToDelete: string) => {
    setGlobalConfig(prev => {
      const next: ModalityGlobalConfig = {
        ...prev,
        baseUrlHistory: prev.baseUrlHistory.filter(u => u !== urlToDelete),
      };
      saveStoredModalityGlobalConfig(next);
      return next;
    });
  }, []);

  // 从下拉中选择 API Key
  const selectApiKey = useCallback((key: string) => {
    setGlobalConfig(prev => {
      const next: ModalityGlobalConfig = {
        ...prev,
        apiKey: key,
        apiKeyHistory: Array.from(new Set([key, ...prev.apiKeyHistory])),
      };
      saveStoredModalityGlobalConfig(next);
      return next;
    });
    showToast('全局默认 Key 已切换');
  }, [showToast]);

  // 从历史记录中删除 API Key
  const removeApiKeyFromHistory = useCallback((keyToDelete: string) => {
    setGlobalConfig(prev => {
      const next: ModalityGlobalConfig = {
        ...prev,
        apiKeyHistory: prev.apiKeyHistory.filter(k => k !== keyToDelete),
      };
      saveStoredModalityGlobalConfig(next);
      return next;
    });
  }, []);

  // 模型更新与持久化
  const updateModel = useCallback((modelId: string, updates: Partial<ModalityModelItem>) => {
    const changedDefaults: ModalityModelItem[] = [];
    setModels(prev => {
      const current = prev.find(m => m.id === modelId);
      if (!current) return prev;
      const linked = withLinkedCustomName(current, updates);
      const nextModel = { ...current, ...linked };
      if (nextModel.isDefault && linked.modelId !== undefined && linked.modelId !== current.modelId) {
        changedDefaults.push(nextModel);
      }
      const next = prev.map(m => m.id === modelId ? nextModel : m);
      saveStoredModalityModels(kind, next);
      notifyWorkflowModels(kind);
      return next;
    });
    const changedDefault = changedDefaults[0];
    if (changedDefault) publishDefault(changedDefault, false);
  }, [kind, publishDefault]);

  // 设为当前默认
  const setModelAsDefault = useCallback((targetModel: ModalityModelItem) => {
    const modelId = targetModel.modelId.trim();
    if (!modelId) {
      showToast('请先填写模型 ID');
      return;
    }
    setModels(prev => {
      const next = prev.map(m => ({ ...m, isDefault: m.id === targetModel.id }));
      saveStoredModalityModels(kind, next);
      return next;
    });
    publishDefault(targetModel, true);
    showToast(`已将「${targetModel.name}」(${modelId}) 设为当前${MODALITY_LABEL[kind]}默认模型`);
  }, [kind, publishDefault, showToast]);

  // 解除该模型的同步。官方种子和自定义模型都可移除。
  const removeModel = useCallback((modelId: string) => {
    let fallbackDefault: ModalityModelItem | undefined;
    setModels(prev => {
      const target = prev.find(m => m.id === modelId);
      if (!target) return prev;
      let next = prev.filter(m => m.id !== modelId);
      // 如果删除的是默认模型，平滑指定下一个有效模型为默认
      if (target.isDefault && next.length > 0) {
        fallbackDefault = next.find(m => !m.isCustom) || next[0];
        next = next.map(m => ({ ...m, isDefault: m.id === fallbackDefault?.id }));
      }
      saveStoredModalityModels(kind, next);
      notifyWorkflowModels(kind);
      return next;
    });
    if (fallbackDefault) {
      publishDefault(fallbackDefault, true);
    }
    showToast('已解除该模型的同步');
  }, [kind, publishDefault, showToast]);

  const addCustomModel = useCallback((remoteModelId: string, customName?: string, vendor?: string) => {
    const trimmedId = remoteModelId.trim();
    if (!trimmedId) return;
    let createdId = '';
    setModels(prev => {
      const planned = appendImportedModalityModels(prev, kind, [{
        modelId: trimmedId,
        name: customName,
        vendor: vendor || inferVendorFromModelId(trimmedId, kind) || 'custom',
      }]);
      createdId = planned.firstId;
      if (!planned.added) return prev;
      saveStoredModalityModels(kind, planned.models);
      notifyWorkflowModels(kind);
      return planned.models;
    });
    if (!createdId) return;
    setFocusedModelId(createdId);
    showToast(`已添加模型「${customName?.trim() || trimmedId}」`);
  }, [kind, showToast]);

  const batchAddModels = useCallback((
    entries: Array<{ modelId: string; vendor?: string }>,
    channelId = '',
    channelName = '',
  ) => {
    let added = 0;
    let skipped = 0;
    let firstId = '';
    setModels(prev => {
      const planned = appendImportedModalityModels(prev, kind, entries, channelId, channelName);
      added = planned.added;
      skipped = planned.skipped;
      firstId = planned.firstId;
      if (!planned.added) return prev;
      saveStoredModalityModels(kind, planned.models);
      notifyWorkflowModels(kind);
      return planned.models;
    });
    if (firstId) setFocusedModelId(firstId);
    if (added) showToast(skipped ? `已同步 ${added} 个模型，${skipped} 个未能识别厂商` : `已同步 ${added} 个模型到对应厂商`);
    else showToast(skipped ? `${skipped} 个模型未能识别厂商，未导入` : '所选模型已在列表中');
  }, [kind, showToast]);

  // 只改当前渠道：勾选的导入，取消勾选的自定义模型解除同步。计数在纯函数里算完，避免重复执行时翻倍。
  const batchSyncModels = useCallback((
    selectedModelIds: string[],
    candidateEntries: Array<{ modelId: string; vendor?: string }>,
    channelId = '',
    channelName = '',
  ) => {
    let planned: ReturnType<typeof planModalityChannelSync> | undefined;
    setModels(prev => {
      const next = planModalityChannelSync(prev, kind, channelId, selectedModelIds, candidateEntries, channelName);
      planned = next;
      if (!next.added && !next.removed && !next.fallbackDefault) return prev;
      saveStoredModalityModels(kind, next.models);
      notifyWorkflowModels(kind);
      return next.models;
    });
    if (!planned) return;
    if (planned.fallbackDefault) publishDefault(planned.fallbackDefault, true);
    const where = channelName ? `到「${channelName}」` : '';
    const from = channelName ? `从「${channelName}」` : '';
    if (planned.added > 0 && planned.removed > 0) {
      showToast(`已同步接入 ${planned.added} 个模型${where}，并解除 ${planned.removed} 个模型的同步`);
    } else if (planned.added > 0) {
      showToast(from ? `已${from}同步接入 ${planned.added} 个模型` : `已同步接入 ${planned.added} 个模型`);
    } else if (planned.removed > 0) {
      showToast(`已解除 ${planned.removed} 个已同步模型的接入`);
    } else {
      showToast('模型接入列表未发生变动');
    }
  }, [kind, publishDefault, showToast]);

  // 一键恢复官方默认（解除全部已同步自定义模型）
  const resetToDefaultModels = useCallback(() => {
    const defaults = resetStoredModalityModels(kind);
    setModels(defaults);
    const defaultItem = defaults.find(m => m.isDefault) || defaults[0];
    if (defaultItem) {
      setFocusedModelId(defaultItem.id);
      publishDefault(defaultItem, true);
    }
    notifyWorkflowModels(kind);
    showToast(`已恢复${MODALITY_LABEL[kind]}官方默认模型，已解除全部渠道同步的模型`);
  }, [kind, publishDefault, showToast]);

  // 统计模型数量
  const countSummary = useMemo(() => {
    return {
      total: models.length,
      frequent: models.filter(m => !m.isInfrequent).length,
      custom: models.filter(m => m.isCustom).length,
    };
  }, [models]);

  return {
    globalConfig,
    updateGlobalConfig,
    saveGlobalConfig,
    selectBaseUrl,
    removeBaseUrlFromHistory,
    selectApiKey,
    removeApiKeyFromHistory,
    models,
    focusedModelId,
    setFocusedModelId,
    updateModel,
    setModelAsDefault,
    removeModel,
    addCustomModel,
    batchAddModels,
    batchSyncModels,
    resetToDefaultModels,
    countSummary,
  };
}
