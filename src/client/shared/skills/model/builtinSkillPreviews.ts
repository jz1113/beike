import extraction from '@client/assets/skill-examples/prompt-extraction.jpg';
import storyboard from '@client/assets/skill-examples/cinematic-storyboard.mp4';
import storyboardReference from '@client/assets/skill-examples/cinematic-storyboard.jpg';
import threeView from '@client/assets/skill-examples/character-three-view.jpg';
import sales from '@client/assets/skill-examples/ugc-product-sales.mp4';
import salesPoster from '@client/assets/skill-examples/ugc-product-sales.jpg';
import productReference from '@client/assets/creative-tools/product-angles.jpg';

export interface SkillExampleInput {
  prompt: string;
  referenceImages: string[];
}

/** Bundled examples remain usable after local generation history or signed URLs expire. */
export const BUILTIN_SKILL_PREVIEWS: Record<string, {
  cover: string; poster?: string; fit?: 'contain'; example: SkillExampleInput;
}> = {
  'beike-prompt-extraction': {
    cover: extraction,
    example: { referenceImages: [productReference], prompt: '分析附图，提取主体外观、构图、光线、材质，分别列出可见事实与推测。请给一条横向16:9的完整图片提示词，保留耳机蓝白配色。' },
  },
  'beike-cinematic-storyboard': {
    cover: storyboard, poster: storyboardReference,
    example: { referenceImages: [storyboardReference], prompt: '参考图中的人物与雨后车站，一位成年摄影师拾起旧照片，抬头看向空站台。10秒、16:9，只需一个连续镜头。先给分镜表，再给一条可独立生成的完整视频提示词。' },
  },
  'beike-character-three-view': {
    cover: threeView, fit: 'contain',
    example: { referenceImages: [threeView], prompt: '保留参考图中的同一成年男性：黑色短发、白色圆领T恤、深蓝直筒牛仔裤、白色运动鞋。制作写实风格、白色背景、横向3:2的正面、左侧面、背面全身三视图，头顶和脚部完整。给一条可直接生成的完整图片提示词。' },
  },
  'beike-ugc-product-sales': {
    cover: sales, poster: salesPoster,
    example: { referenceImages: [productReference], prompt: '商品为附图的米白与深蓝色头戴式耳机，仅展示外观和佩戴动作，不编造性能参数。面向成年年轻通勤人群，10秒9:16。先给简短口播及镜头安排，再给一条完整视频提示词。' },
  },
};

