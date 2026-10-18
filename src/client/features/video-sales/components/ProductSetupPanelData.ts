import { Box, Eye, LayoutGrid, Video } from 'lucide-react';
import type {
  VideoSalesCategory,
  VideoSalesMode,
  VideoSalesStyleType,
} from '@shared/domain/video-sales';

export const CATEGORIES: { id: VideoSalesCategory; label: string; icon: string }[] = [
  { id: 'beauty', label: '美妆护肤', icon: '💄' },
  { id: 'food', label: '食品零食', icon: '🍔' },
  { id: 'home', label: '家居日用', icon: '🏠' },
  { id: 'fashion', label: '服饰鞋包', icon: '👗' },
  { id: 'tech', label: '数码3C', icon: '📱' },
  { id: 'other', label: '通用百货', icon: '📦' },
];

export const VIDEO_MODES: {
  id: VideoSalesMode;
  label: string;
  tag: string;
  icon: typeof Box;
  desc: string;
}[] = [
  {
    id: 'product_closeup',
    label: '产品特写',
    tag: '真实感最高',
    icon: Box,
    desc: '商品原图 + Ken Burns 专业运镜，全程无 AI 假脸，适合高客单价',
  },
  {
    id: 'graphic_montage',
    label: '图文混剪',
    tag: '节奏最紧凑',
    icon: LayoutGrid,
    desc: '快节奏商品切片 + 醒目粗黑体卖点大字卡片，适配快消日用品',
  },
  {
    id: 'scene_demo',
    label: '场景演示',
    tag: '沉浸代入感',
    icon: Eye,
    desc: 'AI 生成手部局部使用/背影/道具场景，规避人脸失真',
  },
  {
    id: 'live_presenter',
    label: '真人出镜',
    tag: 'IP 讲解',
    icon: Video,
    desc: '结合人物角色库锚定外貌与音色，适合口播种草',
  },
];

export const STYLE_OPTIONS: { id: VideoSalesStyleType; label: string; desc: string }[] = [
  { id: 'pain_point', label: '痛点种草', desc: '痛点引入 → 产品救星 → 效果证明 → 逼单抢购' },
  { id: 'scene', label: '场景安利', desc: '生活场景切入 → 自然使用 → 真实效果 → 闺蜜式推荐' },
  { id: 'comparison', label: '对比测评', desc: '极限多方横评 → 数据说话 → 推荐唯一最优' },
  { id: 'unboxing', label: '开箱体验', desc: '快递开箱 → 包装细节 → 真实初体验 → 超预期好物' },
  { id: 'story', label: '剧情反转', desc: '尴尬/困扰引入 → 剧情反转解法 → 情感共鸣促单' },
];

export const DURATION_OPTIONS = [
  { value: 15, label: '15秒 (纯带货爆款)', desc: '完播率最高，适合爆品单点突破' },
  { value: 30, label: '30秒 (标准种草)', desc: '结构完整，转化率最均衡' },
  { value: 60, label: '60秒 (深度测评/剧情)', desc: '适合复杂卖点或剧情故事' },
];
