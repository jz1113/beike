import type { AssetSubTab } from './assetPromptConstants';

const labels: Record<AssetSubTab, string> = {
  full_prompt: '图组母本', persona: '人物', outfit: '穿搭', scene: '场景', action: '动作',
};
export const ASSET_TAB_HINT: Record<AssetSubTab, string> = {
  full_prompt: '归档整组镜头与原图，积累技能学习参考',
  persona: '管理参考人物，查看形象与人物描述',
  outfit: '管理参考穿搭，查看服饰与搭配描述',
  scene: '管理参考场景，查看环境与布景描述',
  action: '管理参考动作，查看姿态与接触描述',
};
export function promptLibraryEmptyCopy(tab: AssetSubTab, filtered: boolean, folderName?: string): { title: string; body: string } {
  const label = labels[tab];
  if (filtered) return { title: `没有符合条件的${label}`, body: '试试其他标签或状态，或清除筛选查看当前分类的全部素材。' };
  if (tab === 'full_prompt' && folderName) return { title: `${folderName}还没有图组母本`, body: '投喂一组同类商品的参考图，归档镜头与原图，逐步积累可复用的创作方法。' };
  if (tab === 'full_prompt') return { title: '还没有图组母本', body: '投喂参考图，归档镜头与原图，为当前类目积累学习资料。' };
  return { title: `还没有${label}资产`, body: `投喂参考图后，可在这里归档和查看${label}素材。` };
}
