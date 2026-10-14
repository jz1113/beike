export interface ImageSetQueueItem {
  id: string;
  name: string;
  images: string[];
  excludedImageIndices?: number[];
  reviewId?: string;
  productCategoryId?: string;
  sourceUrl?: string;
  apiUsed?: string;
  author?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  result?: Record<string, unknown>;
  deconstructStats?: {
    imageCount?: number;
    skippedIncompleteImages?: number;
    fullPromptsCount?: number;
    pass1Succeeded?: number;
    pass1Failed?: number;
    pass1FailedIndices?: number[];
    perImageCount?: number;
    pass2Skipped?: boolean;
    pipelineMode?: string;
    shardCount?: number;
    visionCallCount?: number;
    visionModelsUsed?: string[];
    scenesCount?: number;
    actionsCount?: number;
    scenesBeforeDedup?: number;
    scenesAfterDedup?: number;
    actionsBeforeDedup?: number;
    actionsAfterDedup?: number;
  };
  error?: string;
}
