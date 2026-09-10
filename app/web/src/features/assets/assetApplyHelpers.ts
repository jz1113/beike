import { parsePersonaLayers, formatPersonaPrompt } from './assetPromptConstants';

/**
 * 获取资产在详情预览、复制与卡片上的格式化预览文本
 */
export function getAssetPreviewText(
  item: any,
  activeSubTab: 'full_prompt' | 'persona' | 'outfit' | 'scene' | 'action'
): string {
  if (!item) return '';

  if (activeSubTab === 'full_prompt') {
    return item.reversePromptZh || item.reversePrompt || item.title || '';
  }
  if (activeSubTab === 'scene') {
    const desc = item.description || '';
    const spacePart = desc.includes(item.title)
      ? desc
      : `${item.title ? `${item.title}，` : ''}${desc}`;
    return `【场景空间】：${spacePart}；【采光系统与物理阴影】：${item.lighting || '自然采光与清晰接触阴影'}`;
  }
  if (activeSubTab === 'action') {
    const act = item.action || '';
    const actPart = act.includes(item.title)
      ? act
      : `${item.title ? `${item.title}，` : ''}${act}`;
    return `【动作姿态】：${actPart}；【镜头语言】：${item.camera || 'iPhone 50mm 生活镜头'}`;
  }
  if (activeSubTab === 'outfit') {
    return `【服装穿搭】：${[item.top, item.bottom, item.shoes].filter(Boolean).join('，')}${
      item.colorPalette ? `；【色彩搭配】：${item.colorPalette}` : ''
    }`;
  }
  if (activeSubTab === 'persona') {
    const layers = parsePersonaLayers(item.description || item.name);
    return `【模特博主】：${formatPersonaPrompt(layers)}`;
  }
  return item.reversePromptZh || item.reversePrompt || '';
}
