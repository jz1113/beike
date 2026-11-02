export interface AssetViewDefinition<V extends string> {
  id: V | 'main';
  label: string;
  hint: string;
}

export interface AssetViewSet<V extends string> {
  views: Record<V | 'main', string>;
  extraImages: string[];
}

export interface AssetViewRequest {
  key: string;
  jobId?: string;
  assetId?: string;
  taskId?: string;
  resultUrl?: string;
  images?: Record<string, string>;
  model: string;
  references: string[];
  prompt?: string;
  promptVersion?: string;
}
