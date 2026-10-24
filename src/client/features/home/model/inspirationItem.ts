export interface InspirationItem {
  id: string | number;
  isBanner?: boolean;
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
  /** 关联的分镜预设 ID */
  storyboardPresetId?: string;
}
