import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { confirmAction } from '@/lib/confirmAction';
import {
  DEFAULT_PRESET_MODELS,
  type WorkflowModel,
} from '../settingsShared';
import type { GatewayModelItem } from '../GatewayModelModal';

interface UseCustomModelsOptions {
  isOpen: boolean;
  baseUrl: string;
  apiKey: string;
  showToast: (msg: string) => void;
}

export function useCustomModels({
  isOpen,
  baseUrl,
  apiKey,
  showToast,
}: UseCustomModelsOptions) {
  const [customModels, setCustomModels] = useState<WorkflowModel[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [modelCapabilityFilter, setModelCapabilityFilter] = useState<'all' | 'multimodal' | 'image' | 'video'>('all');

  // 网关发现模态窗状态
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [isFetchingGateway, setIsFetchingGateway] = useState(false);
  const [allGatewayModels, setAllGatewayModels] = useState<GatewayModelItem[]>([]);

  // 安全触发模型更新事件通知
  const notifyModelsUpdated = () => {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new Event('models_updated'));
      }, 0);
    }
  };

  // 初始化加载模型
  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      const savedCustom = localStorage.getItem('custom_models');
      if (savedCustom !== null) {
        try {
          const parsed = JSON.parse(savedCustom);
          if (Array.isArray(parsed)) {
            setCustomModels(parsed as WorkflowModel[]);
          } else {
            setCustomModels([]);
            localStorage.setItem('custom_models', JSON.stringify([]));
          }
        } catch {
          setCustomModels([]);
          localStorage.setItem('custom_models', JSON.stringify([]));
        }
      } else {
        setCustomModels([]);
        localStorage.setItem('custom_models', JSON.stringify([]));
      }
    }
  }, [isOpen]);

  // 单个模型切换能力标签
  const handleToggleCapability = (
    modelId: string,
    field:
      | 'isMultimodal'
      | 'isImage'
      | 'isVideo'
      | 'isVision'
      | 'isAssistant'
      | 'isDistill'
      | 'isThinking'
  ) => {
    setCustomModels((prev) => {
      const updated = prev.map((m) => {
        if (m.id === modelId) {
          if (
            field === 'isMultimodal' ||
            field === 'isVision' ||
            field === 'isAssistant' ||
            field === 'isDistill' ||
            field === 'isThinking'
          ) {
            const currentMulti = m.isMultimodal ?? m.isVision ?? true;
            const nextVal = !currentMulti;
            return {
              ...m,
              isMultimodal: nextVal,
              isVision: nextVal,
              isAssistant: nextVal,
              isDistill: nextVal,
              isThinking: nextVal,
            };
          }
          return { ...m, [field]: !m[field] };
        }
        return m;
      });
      localStorage.setItem('custom_models', JSON.stringify(updated));
      return updated;
    });
    notifyModelsUpdated();
  };

  // 单个模型移出/删除
  const handleDeleteModel = (modelId: string) => {
    setCustomModels((prev) => {
      const updated = prev.filter((m) => m.id !== modelId);
      localStorage.setItem('custom_models', JSON.stringify(updated));
      return updated;
    });
    notifyModelsUpdated();
    showToast(`已移出模型 ${modelId}`);
  };

  // 单个模型调整顺序（置顶 / 上移 / 下移）
  const handleMoveModel = (modelId: string, direction: 'up' | 'down' | 'top') => {
    setCustomModels((prev) => {
      const idx = prev.findIndex((m) => m.id === modelId);
      if (idx === -1) return prev;
      const updated = [...prev];
      if (direction === 'top') {
        if (idx === 0) return prev;
        const [item] = updated.splice(idx, 1);
        updated.unshift(item);
      } else if (direction === 'up') {
        if (idx === 0) return prev;
        const temp = updated[idx];
        updated[idx] = updated[idx - 1];
        updated[idx - 1] = temp;
      } else if (direction === 'down') {
        if (idx === updated.length - 1) return prev;
        const temp = updated[idx];
        updated[idx] = updated[idx + 1];
        updated[idx + 1] = temp;
      }
      localStorage.setItem('custom_models', JSON.stringify(updated));
      return updated;
    });
    notifyModelsUpdated();
    showToast(`已调整模型 ${modelId} 的优先级顺序`);
  };

  // 拖拽全量重排序
  const handleReorderModels = (newOrder: WorkflowModel[]) => {
    setCustomModels(newOrder);
    localStorage.setItem('custom_models', JSON.stringify(newOrder));
    notifyModelsUpdated();
    showToast('已更新模型列表优先级排序');
  };

  // 恢复系统默认预设模型列表
  const handleResetDefaultModels = async () => {
    if (await confirmAction('确定恢复系统默认预设模型列表吗？这将覆盖当前的模型修改。')) {
      setCustomModels(DEFAULT_PRESET_MODELS);
      localStorage.setItem('custom_models', JSON.stringify(DEFAULT_PRESET_MODELS));
      notifyModelsUpdated();
      showToast('已恢复系统默认预设模型');
    }
  };

  // 手动添加模型
  const handleAddCustomModel = (modelObj: WorkflowModel) => {
    setCustomModels((prev) => {
      const updated = [modelObj, ...prev.filter((m) => m.id !== modelObj.id)];
      localStorage.setItem('custom_models', JSON.stringify(updated));
      return updated;
    });
    notifyModelsUpdated();
    showToast(`✨ 成功添加模型【${modelObj.name}】`);
  };

  // 获取网关模型列表
  const handleOpenGatewayDiscovery = async (forceRefresh = false) => {
    setIsGatewayModalOpen(true);
    if (!forceRefresh && allGatewayModels.length > 0) {
      return;
    }

    setIsFetchingGateway(true);
    try {
      const res = await apiFetch('/api/system/models/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
        }),
      });

      const data = await res.json();
      if (data.models && Array.isArray(data.models) && data.models.length > 0) {
        setAllGatewayModels(data.models);
      }
    } catch (err: any) {
      console.warn('获取网关模型列表提示:', err);
    } finally {
      setIsFetchingGateway(false);
    }
  };

  return {
    customModels,
    setCustomModels,
    modelSearch,
    setModelSearch,
    modelCapabilityFilter,
    setModelCapabilityFilter,
    handleToggleCapability,
    handleDeleteModel,
    handleMoveModel,
    handleReorderModels,
    handleResetDefaultModels,
    handleAddCustomModel,
    isGatewayModalOpen,
    setIsGatewayModalOpen,
    isFetchingGateway,
    allGatewayModels,
    handleOpenGatewayDiscovery,
    notifyModelsUpdated,
  };
}
