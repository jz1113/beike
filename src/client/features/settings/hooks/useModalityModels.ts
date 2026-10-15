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
  saveStoredModalityModels,
} from '../model/modalityModelStorage';
import { apiFetch } from '@client/shared/api/apiClient';
import { inferVendorFromModelId } from '../model/modalityMeta';
import {
  modalityHasWorkflowPool,
  notifyWorkflowModels,
  registerWorkflowDefault,
  withLinkedCustomName,
  writeModalityDefaultKey,
} from '../model/modalityDefaultSync';

const MODALITY_LABEL: Record<ModalityKind, string> = {
  chat: '对话',
  image: '绘画',
  video: '视频',
  three_d: '3D',
  music: '音乐',
  voice: '语音',
};

export function useModalityModels(kind: ModalityKind, showToast: (msg: string) => void) {
  // 1. 全局配置
  const [globalConfig, setGlobalConfig] = useState<ModalityGlobalConfig>(() => loadStoredModalityGlobalConfig());

  // 2. 当前模态模型列表
  const [models, setModels] = useState<ModalityModelItem[]>(() => loadStoredModalityModels(kind));

  // 3. 远端拉取到的模型列表（用于下拉补全与导入）
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [isSyncingRemote, setIsSyncingRemote] = useState(false);

  // 4. 当前聚焦的模型 ID（用于单卡片聚焦控制台）
  const [focusedModelId, setFocusedModelId] = useState<string>('');
  const registerTimer = useRef<number | null>(null);

  const publishDefault = useCallback((model: Pick<ModalityModelItem, 'modelId' | 'name'>, registerNow: boolean) => {
    const storedId = writeModalityDefaultKey(kind, model.modelId);
    if (!storedId || !modalityHasWorkflowPool(kind)) return;
    const run = () => {
      registerWorkflowDefault(kind, { modelId: storedId, name: model.name });
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

  // 删除自定义模型
  const removeModel = useCallback((modelId: string) => {
    setModels(prev => {
      const target = prev.find(m => m.id === modelId);
      if (!target?.isCustom) return prev;
      const next = prev.filter(m => m.id !== modelId);
      saveStoredModalityModels(kind, next);
      return next;
    });
    showToast('已移除该自定义模型');
  }, [kind, showToast]);

  // 🔄 同步模型（从远端拉取）
  const syncRemoteModels = useCallback(async () => {
    const targetUrl = globalConfig.baseUrl.trim();
    const targetKey = globalConfig.apiKey.trim();
    if (!targetUrl) {
      showToast('请先配置全局地址');
      return;
    }
    setIsSyncingRemote(true);
    try {
      const response = await apiFetch('/api/system/models/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: targetUrl,
          apiKey: targetKey,
          strict: false,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.models && Array.isArray(data.models)) {
        const extractedIds: string[] = [];
        for (const m of data.models) {
          if (typeof m === 'string') extractedIds.push(m);
          else if (m && typeof m.id === 'string') extractedIds.push(m.id);
        }
        const unique = Array.from(new Set(extractedIds));
        setRemoteModels(unique);
        showToast(`成功同步远端模型目录，发现 ${unique.length} 个模型`);
      } else {
        const errorMsg = data?.error || data?.warning || '同步失败，请检查地址与密钥';
        showToast(`模型同步提示：${errorMsg}`);
      }
    } catch {
      showToast('同步网络连接失败，请检查网络或跨域设置');
    } finally {
      setIsSyncingRemote(false);
    }
  }, [globalConfig.baseUrl, globalConfig.apiKey, showToast]);

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
      return planned.models;
    });
    if (!createdId) return;
    setFocusedModelId(createdId);
    showToast(`已添加模型「${customName?.trim() || trimmedId}」`);
  }, [kind, showToast]);

  const batchAddModels = useCallback((entries: Array<{ modelId: string; vendor?: string }>) => {
    let added = 0;
    let skipped = 0;
    let firstId = '';
    setModels(prev => {
      const planned = appendImportedModalityModels(prev, kind, entries);
      added = planned.added;
      skipped = planned.skipped;
      firstId = planned.firstId;
      if (!planned.added) return prev;
      saveStoredModalityModels(kind, planned.models);
      return planned.models;
    });
    if (firstId) setFocusedModelId(firstId);
    if (added) showToast(skipped ? `已同步 ${added} 个模型，${skipped} 个未能识别厂商` : `已同步 ${added} 个模型到对应厂商`);
    else showToast(skipped ? `${skipped} 个模型未能识别厂商，未导入` : '所选模型已在列表中');
  }, [kind, showToast]);

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
    remoteModels,
    isSyncingRemote,
    syncRemoteModels,
    countSummary,
  };
}
