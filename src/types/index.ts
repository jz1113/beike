export type PlatformType = 'jd' | 'taobao';

export type ImageCategoryType = 'main' | 'sku' | 'detail';

export interface ProductImage {
  url: string;
  type: ImageCategoryType;
  selected: boolean;
}

export interface ImageGroups {
  main: string[];
  skus: string[];
  details: string[];
}

export interface ProductData {
  id?: string;
  itemId?: string;
  title: string;
  platform?: string;
  price?: string;
  picUrl?: string;
  createdAt?: string | Date;
}

export interface ProductRecord {
  id: string;
  platform: string;
  itemId: string;
  title: string;
  picUrl?: string;
  detailUrls?: string;
  createdAt: string | Date;
  imageCount?: number;
}

export interface ImageTaskRecord {
  id: string;
  productId?: string;
  prompt: string;
  taskId?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
  resultUrl?: string;
  failReason?: string;
  createdAt: string | Date;
}

export type {
  GenerationTask,
  ChatSession,
  MediaAttachment,
  ProductWidgetData,
  AssistantMessage,
  AssistantSession,
} from './app-store';


