/**
 * 封面多模态深度反推特征与风格 Skill 类型定义
 */

export interface DeconstructionLayout {
  gridType: string;
  subjectAreaRatio: string;
  subjectAnchor: string;
  whiteSpaceRatio: string;
  depthLayering: string;
}

export interface DeconstructionTypography {
  titleFontFamily: string;
  titleArrangement: string;
  letterSpacing: string;
  artTreatment: string;
}

export interface DeconstructionColorPalette {
  backgroundTone: string;
  dominantColor: string;
  accentColor: string;
  contrastLevel: string;
  colorSourceRule: string;
}

export interface DeconstructionTextureAndLight {
  backgroundTexture: string;
  lightDirection: string;
  shadowStyle: string;
}

export interface DeconstructionDecorations {
  elements: string[];
  subTextLayout: string;
}

export interface DeconstructionCopywriting {
  grammar: string;
  wordCountRange: string;
}

export interface CoverDeconstruction {
  layout: DeconstructionLayout;
  typography: DeconstructionTypography;
  colorPalette: DeconstructionColorPalette;
  textureAndLight: DeconstructionTextureAndLight;
  decorations: DeconstructionDecorations;
  copywritingStyle: DeconstructionCopywriting;
  summary: string;
}

export interface CoverMemoryCase {
  id: string;
  imageUrl: string;
  thumbnailUrl?: string;
  title?: string;
  tags: string[];
  features: CoverDeconstruction;
  createdAt: number;
  matchedStyleId?: string;
}

export interface CoverCorrection {
  id: string;
  styleId: string;
  negativeRule: string;
  reason: string;
  createdAt: number;
}

export interface CoverStyleSkill {
  id: string;
  name: string;
  badge: string;
  description: string;
  isBuiltin: boolean;
  directorPrompt: string;
  negativeRules: string[];
  features?: Partial<CoverDeconstruction>;
  sampleCount: number;
  updatedAt: number;
}
