import { useEffect, useState } from 'react';
import { DEFAULT_KEYWORD_REVIEW_MODEL, KEYWORD_REVIEW_MODEL_STORAGE_KEY, loadKeywordReviewModels } from '@client/shared/models/keywordReviewModels';
import { loadKeywordReviewSettings, normalizeKeywordReviewSettings, persistKeywordReviewSettings, type KeywordReviewSettings } from '../model/keywordReviewSettings';

export function useKeywordReviewConfig(busy: () => boolean, onNotice: (message: string) => void) {
  const [settings, setSettings] = useState<KeywordReviewSettings>(loadKeywordReviewSettings);
  const [modelOptions, setModelOptions] = useState(loadKeywordReviewModels);
  const [modelValue, setModelValue] = useState(() => {
    try { return localStorage.getItem(KEYWORD_REVIEW_MODEL_STORAGE_KEY) || DEFAULT_KEYWORD_REVIEW_MODEL; }
    catch { return DEFAULT_KEYWORD_REVIEW_MODEL; }
  });
  const selectedModel = modelOptions.find((option) => option.value === modelValue) || modelOptions[0];
  useEffect(() => {
    const reload = () => setModelOptions(loadKeywordReviewModels());
    window.addEventListener('models_updated', reload);
    return () => window.removeEventListener('models_updated', reload);
  }, []);

  const selectModel = (value: string) => {
    if (busy() || !modelOptions.some((option) => option.value === value)) return;
    setModelValue(value);
    try { localStorage.setItem(KEYWORD_REVIEW_MODEL_STORAGE_KEY, value); } catch { /* storage unavailable */ }
  };

  const saveSettings = (next: KeywordReviewSettings) => {
    if (busy()) {
      onNotice('审核任务正在启动或运行，当前设置暂不可修改。');
      return false;
    }
    const normalized = normalizeKeywordReviewSettings(next);
    const persisted = persistKeywordReviewSettings(normalized);
    setSettings(normalized);
    onNotice(persisted ? '关键词分类设置已保存。' : '设置已应用到当前页面，但浏览器无法保存本地配置。');
    return true;
  };

  return { settings, modelOptions, selectedModel, selectModel, saveSettings };
}
