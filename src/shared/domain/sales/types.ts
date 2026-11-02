/** Product collection and reference script domain types for the ecommerce video workspace. */
export type VideoSalesCategory = 'beauty' | 'food' | 'home' | 'fashion' | 'tech' | 'other';

export type SalesProductImageView = 'front' | 'back' | 'detail' | 'worn' | 'flat';

export const SALES_PRODUCT_IMAGE_VIEWS: readonly SalesProductImageView[] = ['front', 'back', 'detail', 'worn', 'flat'];

export const SALES_IMAGE_VIEW_LABELS: Record<SalesProductImageView, string> = {
  front: '正面',
  back: '背面',
  detail: '细节',
  worn: '上身/场景',
  flat: '平铺/白底',
};

export interface SalesColorSelection {
  variantId?: string;
  colorLabel: string;
  confirmedImageUrls: string[];
  excludedImageUrls: string[];
}

/** Whether to prepare narration and separate subtitle drafts, or produce a clean visual showcase. */
export type SalesPresentationMode = 'subtitled_intro' | 'clean_visual';

export const SALES_PRESENTATION_MODE_LABELS: Record<SalesPresentationMode, { title: string; subtitle: string }> = {
  subtitled_intro: {
    title: '卖点介绍',
    subtitle: '用口播或旁白讲解商品，提供字幕草稿。',
  },
  clean_visual: {
    title: '纯画面展示',
    subtitle: '专注商品、人物与运镜，不生成口播和字幕。',
  },
};

/** Step 4 in product video workflow: whether motion is driven by storyboard text or depth video imitation. */
export type SalesImitationMode = 'script_only' | 'depth_imitation';

export const SALES_IMITATION_MODE_LABELS: Record<SalesImitationMode, { title: string; subtitle: string }> = {
  script_only: {
    title: '仅按脚本',
    subtitle: '按脚本的镜头切换与动作描述生成，使用所选商品、人物与场景图片。',
  },
  depth_imitation: {
    title: '脚本＋深度视频',
    subtitle: '结合脚本关联的深度视频参考动作与运镜，人物、商品与场景以所选图片为准。',
  },
};
