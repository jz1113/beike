import type { AssetSubTab } from './assetPromptConstants';

const labels: Record<AssetSubTab, string> = {
  full_prompt: '图组母本', persona: '人物', outfit: '穿搭', scene: '场景', action: '动作',
};
export const ASSET_TAB_HINT: Record<AssetSubTab, string> = {
  full_prompt: '保存整组镜头的顺序与机位，供创作时选用',
  persona: '替换图组中的人物，未选择时沿用母本',
  outfit: '替换图组中的穿搭，未选择时沿用母本',
  scene: '替换图组中的场景，未选择时沿用母本',
  action: '替换图组中的动作，未选择时沿用母本',
};
export function promptLibraryEmptyCopy(tab: AssetSubTab, filtered: boolean): { title: string; body: string } {
  const label = labels[tab];
  if (filtered) return { title: `没有符合条件的${label}`, body: '试试其他关键词，或清空筛选查看当前分类的全部资产。' };
  if (tab === 'full_prompt') return { title: '还没有图组母本', body: '导入参考图集，提取整组镜头的顺序与机位。审核发布后，即可在创作中使用。' };
  return { title: `还没有${label}资产`, body: `从参考图集提取${label}，供创作时替换使用。未选择时，将沿用图组母本的${label}。` };
}
