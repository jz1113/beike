export interface InspirationItem {
  id: string | number;
  category: string;
  tag: string;
  title: string;
  prompt: string;
  /** Prompt with reference slots mapped to the attached image order. */
  referencePrompt?: string;
  image: string;
  thumbnail?: string;
  video?: string;
  poster?: string;
  mediaType?: 'image' | 'video';
  referenceImages?: string[];
  referenceLabels?: string[];
  videoRefMode?: string;
  videoDuration?: number;
  actualVideoDuration?: number;
  author?: {
    name: string;
    avatar?: string;
    badge?: string;
  };
  date?: string;
  aspectRatio?: string;
  model?: string;
  quality?: string;
}

export interface InspirationUseOptions {
  referenceImages?: string[];
  videoRefMode?: string;
  videoDuration?: number;
  videoModel?: string;
  videoAspectId?: string;
  videoResolution?: '480P' | '540P' | '720P' | '1080P' | '2K' | '4K';
}
