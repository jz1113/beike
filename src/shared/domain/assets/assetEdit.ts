import { audienceOptions } from './appearanceAudience';
/** Explicit scalar update contract. Presentation fields and nested Prisma writes are excluded. */
const fields: Record<string, Record<string, [string, boolean]>> = {
  "scene": {
    "title": [
      "string",
      false
    ],
    "description": [
      "string",
      false
    ],
    "lighting": [
      "string",
      false
    ],
    "category": [
      "string",
      false
    ],
    "spatialType": [
      "string",
      false
    ],
    "suitableCategories": [
      "string",
      false
    ],
    "tags": [
      "string",
      false
    ],
    "coverUrl": [
      "string",
      true
    ],
    "sourceImages": [
      "string",
      true
    ],
    "reversePrompt": [
      "string",
      true
    ],
    "dimensions": [
      "string",
      true
    ],
    "sourceImageIndex": [
      "number",
      true
    ],
    "imageType": [
      "string",
      true
    ],
    "provenance": [
      "string",
      false
    ],
    "usageCount": [
      "number",
      false
    ],
    "isFavorite": [
      "boolean",
      false
    ]
  },
  "outfit": {
    "dimensions": ["string", true],
    "title": [
      "string",
      false
    ],
    "top": [
      "string",
      false
    ],
    "bottom": [
      "string",
      false
    ],
    "shoes": [
      "string",
      true
    ],
    "colorPalette": [
      "string",
      true
    ],
    "category": [
      "string",
      false
    ],
    "suitableCategories": [
      "string",
      false
    ],
    "tags": [
      "string",
      false
    ],
    "sourceImages": [
      "string",
      true
    ],
    "provenance": [
      "string",
      false
    ],
    "usageCount": [
      "number",
      false
    ],
    "isFavorite": [
      "boolean",
      false
    ]
  },
  "action": {
    "title": [
      "string",
      false
    ],
    "action": [
      "string",
      false
    ],
    "shotType": [
      "string",
      false
    ],
    "spatialType": [
      "string",
      false
    ],
    "camera": [
      "string",
      true
    ],
    "suitableAnatomy": [
      "string",
      false
    ],
    "tags": [
      "string",
      false
    ],
    "sourceImages": [
      "string",
      true
    ],
    "provenance": [
      "string",
      false
    ],
    "sceneId": [
      "string",
      true
    ],
    "shotOrder": [
      "number",
      false
    ],
    "usageCount": [
      "number",
      false
    ],
    "isFavorite": [
      "boolean",
      false
    ]
  },
  "persona": {
    "dimensions": ["string", true],
    "name": [
      "string",
      false
    ],
    "description": [
      "string",
      false
    ],
    "tags": [
      "string",
      false
    ],
    "sourceImages": [
      "string",
      true
    ],
    "provenance": [
      "string",
      false
    ],
    "usageCount": [
      "number",
      false
    ],
    "isFavorite": [
      "boolean",
      false
    ],
    "albumId": [
      "string",
      true
    ],
    "productCategoryIds": [
      "string",
      false
    ],
    "isUniversal": [
      "boolean",
      false
    ]
  },
  "full_prompt": {
    "title": [
      "string",
      false
    ],
    "albumName": [
      "string",
      true
    ],
    "reversePromptZh": [
      "string",
      false
    ],
    "reversePromptEn": [
      "string",
      true
    ],
    "dimensions": [
      "string",
      true
    ],
    "imageType": [
      "string",
      true
    ],
    "sourceImageIndex": [
      "number",
      true
    ],
    "coverUrl": [
      "string",
      true
    ],
    "sourceImages": [
      "string",
      true
    ],
    "hasHuman": [
      "boolean",
      false
    ],
    "shotFraming": [
      "string",
      true
    ],
    "productFrameRatio": [
      "number",
      true
    ],
    "sceneSummary": [
      "string",
      true
    ],
    "outfitSummary": [
      "string",
      true
    ],
    "actionSummary": [
      "string",
      true
    ],
    "personaSummary": [
      "string",
      true
    ],
    "tags": [
      "string",
      false
    ],
    "category": [
      "string",
      false
    ],
    "provenance": [
      "string",
      false
    ],
    "usageCount": [
      "number",
      false
    ],
    "isFavorite": [
      "boolean",
      false
    ],
    "albumId": [
      "string",
      true
    ],
    "productCategoryIds": [
      "string",
      false
    ],
    "isUniversal": [
      "boolean",
      false
    ]
  }
};
export function pickAssetEditFields(type: string, input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => fields[type]?.[key] && value !== undefined));
}
export function validateAssetEdit(type: string, input: unknown): string | null {
  if (!fields[type]) return '不支持的资产类型';
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '资产数据必须为对象';
  if (!Object.keys(input).length) return '没有可更新字段';
  if ((type === 'persona' || type === 'outfit') && 'dimensions' in input && input.dimensions != null) {
    try {
      const dimensions = JSON.parse(String(input.dimensions));
      if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) return '资产维度必须为对象';
      if ('audience' in dimensions && !audienceOptions(type === 'outfit').some(option => option.id === dimensions.audience)) return '人群二级分类无效';
    } catch { return '资产维度格式无效'; }
  }
  for (const [key, value] of Object.entries(input)) {
    const spec = fields[type][key];
    if (!spec) return `不允许更新字段: ${key}`;
    if (value === null && spec[1]) continue;
    if (typeof value !== spec[0]) return `字段类型不正确: ${key}`;
    if (spec[0] === 'number' && (!Number.isSafeInteger(value) || Number(value) < 0)) return `字段数值不正确: ${key}`;
  }
  return null;
}
