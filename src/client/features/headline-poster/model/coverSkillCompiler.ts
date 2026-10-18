import type { CoverDeconstruction, CoverStyleSkill } from './coverSkillTypes';
import { getAllCoverStyles, getStyleCorrections, saveCustomCoverStyle } from './coverMemoryStorage';

/** 计算单项文本特征重合度 */
function textMatchScore(a?: string, b?: string): number {
  if (!a || !b) return 0.5;
  const sA = a.trim().toLowerCase();
  const sB = b.trim().toLowerCase();
  if (sA === sB) return 1.0;
  if (sA.includes(sB) || sB.includes(sA)) return 0.8;
  return 0.2;
}

/** 计算反推特征与已有风格的相似度 (0 ~ 100) */
export function calculateStyleSimilarity(features: CoverDeconstruction, style: CoverStyleSkill): number {
  const sf = style.features;
  if (!sf) return 50;

  // 1. 布局权重 30%
  const layoutScore = (
    textMatchScore(features.layout?.gridType, sf.layout?.gridType) * 0.6 +
    textMatchScore(features.layout?.depthLayering, sf.layout?.depthLayering) * 0.4
  ) * 30;

  // 2. 字体艺术字权重 25%
  const typoScore = (
    textMatchScore(features.typography?.titleFontFamily, sf.typography?.titleFontFamily) * 0.5 +
    textMatchScore(features.typography?.artTreatment, sf.typography?.artTreatment) * 0.5
  ) * 25;

  // 3. 配色体系权重 25%
  const colorScore = (
    textMatchScore(features.colorPalette?.backgroundTone, sf.colorPalette?.backgroundTone) * 0.6 +
    textMatchScore(features.colorPalette?.contrastLevel, sf.colorPalette?.contrastLevel) * 0.4
  ) * 25;

  // 4. 材质与光影权重 20%
  const textureScore = textMatchScore(features.textureAndLight?.backgroundTexture, sf.textureAndLight?.backgroundTexture) * 20;

  return Math.round(layoutScore + typoScore + colorScore + textureScore);
}

/** 动态编译出可注入模型的强约束 Prompt */
export function compileStyleDirectorPrompt(style: CoverStyleSkill, corrections?: string[]): string {
  const f = style.features;
  const parts: string[] = [];

  parts.push(`【主视觉族群】${style.name}。${style.description}`);

  if (f?.layout) {
    parts.push(`构图体系采用「${f.layout.gridType}」，主体比例${f.layout.subjectAreaRatio}，主体锚定于${f.layout.subjectAnchor}，留白率${f.layout.whiteSpaceRatio}，图文关系锁定为「${f.layout.depthLayering}」`);
  }

  if (f?.typography) {
    parts.push(`标题字体指定为「${f.typography.titleFontFamily}」，字组排布「${f.typography.titleArrangement}」，字距「${f.typography.letterSpacing}」，艺术字修饰「${f.typography.artTreatment}」`);
  }

  if (f?.colorPalette) {
    parts.push(`背景基调选用「${f.colorPalette.backgroundTone}」，主色「${f.colorPalette.dominantColor}」，点睛色「${f.colorPalette.accentColor}」，色彩提取遵从「${f.colorPalette.colorSourceRule}」`);
  }

  if (f?.textureAndLight) {
    parts.push(`背景质感渲染「${f.textureAndLight.backgroundTexture}」，光影方向「${f.textureAndLight.lightDirection}」，投影质感「${f.textureAndLight.shadowStyle}」`);
  }

  const allNegatives = [...(style.negativeRules || []), ...(corrections || [])];
  if (allNegatives.length > 0) {
    parts.push(`【负向避坑硬性规避】${allNegatives.join('；')}`);
  }

  return parts.join('。');
}

/** 自动将反推特征归纳到最高匹配风格，或沉淀为新风格草稿 */
export function assimilateOrDraftStyle(deconstructed: CoverDeconstruction): {
  action: 'assimilated' | 'created';
  style: CoverStyleSkill;
  similarity: number;
} {
  const currentStyles = getAllCoverStyles();
  let bestMatch: CoverStyleSkill | null = null;
  let highestSimilarity = 0;

  for (const style of currentStyles) {
    const sim = calculateStyleSimilarity(deconstructed, style);
    if (sim > highestSimilarity) {
      highestSimilarity = sim;
      bestMatch = style;
    }
  }

  // 相似度阈值 >= 70% 则并入现有风格并丰富变体
  if (bestMatch && highestSimilarity >= 70) {
    const updated: CoverStyleSkill = {
      ...bestMatch,
      sampleCount: (bestMatch.sampleCount || 1) + 1,
      updatedAt: Date.now(),
      directorPrompt: compileStyleDirectorPrompt(bestMatch),
    };
    saveCustomCoverStyle(updated);
    return { action: 'assimilated', style: updated, similarity: highestSimilarity };
  }

  // 否则沉淀为全新的风格草稿
  const newStyle: CoverStyleSkill = {
    id: 'draft-style-' + Date.now(),
    name: deconstructed.summary.slice(0, 10) || '新反推风格',
    badge: '草稿',
    description: deconstructed.summary,
    isBuiltin: false,
    directorPrompt: '',
    negativeRules: [],
    features: deconstructed,
    sampleCount: 1,
    updatedAt: Date.now(),
  };
  newStyle.directorPrompt = compileStyleDirectorPrompt(newStyle);
  saveCustomCoverStyle(newStyle);

  return { action: 'created', style: newStyle, similarity: highestSimilarity };
}

/** 获取指定风格实时编译后的终极 Prompt（合并该风格的全部避坑负向规则） */
export function getCompiledPromptForStyle(styleId: string): { prompt: string; negativeRules: string[] } {
  const styles = getAllCoverStyles();
  const style = styles.find((s) => s.id === styleId) || styles[0];
  const corrections = getStyleCorrections(style.id).map((c) => c.negativeRule);
  const negativeRules = [...(style.negativeRules || []), ...corrections];
  const prompt = compileStyleDirectorPrompt(style, corrections);
  return { prompt, negativeRules };
}
