export interface SalesColorSelection {
  variantId?: string;
  colorLabel: string;
  confirmedImageUrls: string[];
  excludedImageUrls: string[];
}

export interface SalesCreativeAsset {
  id: string;
  kind: 'person' | 'face' | 'scene' | 'keyframe';
  label: string;
  prompt: string;
  required: boolean;
  referenceAssetIds?: string[];
  usesProduct?: boolean;
  /** 商品目录原始编号，按本张静帧的目标视角选择；不等同于分镜选图。 */
  productImageIndexes?: number[];
  url?: string;
  status?: 'pending' | 'generating' | 'done' | 'failed' | 'uncertain';
  validation?: 'pending' | 'passed' | 'conflict' | 'uncertain';
  validationReason?: string;
  error?: string;
  sourceRevision?: string;
  taskId?: string;
  submissionKey?: string;
  modelId?: string;
  attempts?: number;
}

export interface SalesActualReference {
  id: string;
  kind: SalesCreativeAsset['kind'] | 'product';
  label: string;
  url: string;
}

export interface SalesVideoSnapshot {
  model: string;
  prompt: string;
  images: string[];
  duration: number;
  aspectRatio: string;
  resolution: string;
  refMode: string;
}
