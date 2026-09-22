import type { AssetSubTab } from './assetPromptConstants';

export function promptLibraryEmptyCopy(
  tab: AssetSubTab,
  filtered: boolean,
): { title: string; body: string } {
  if (filtered) {
    return { title: '暂无相关提示词资产', body: '未找到匹配的资产，请尝试清空筛选条件' };
  }
  if (tab === 'full_prompt') {
    return {
      title: '暂无图组母本',
      body: '这里只保存整组镜头骨架。锁定后决定顺序与机位，分析不会把整组提示词当作生成词。',
    };
  }
  return {
    title: '暂无相关提示词资产',
    body: '分析会召回已发布的人物、穿搭、场景和镜头动作；此处为空时会退回拍摄架构兜底。',
  };
}

export const ASSET_TAB_HINT: Record<AssetSubTab, string> = {
  full_prompt: '镜头骨架，锁定后决定顺序与机位',
  persona: '分析会召回',
  outfit: '分析会召回',
  scene: '分析会召回',
  action: '分析会召回',
};
