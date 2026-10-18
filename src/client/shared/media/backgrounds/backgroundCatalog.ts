export type AppBackgroundStyle =
  | 'clean'
  | 'shards'
  | 'beams'
  | 'rays'
  | 'dots'
  | 'galaxy'
  | 'particles';

export type BackgroundCatalogItem = {
  id: AppBackgroundStyle;
  name: string;
  description: string;
  keywords: string[];
  lightAccent: string;
  darkAccent: string;
};

export const BACKGROUND_CATALOG: BackgroundCatalogItem[] = [
  {
    id: 'clean',
    name: '系统内置',
    description: '默认底色，无颗粒与动画',
    keywords: ['系统', '内置', '默认', '极简'],
    lightAccent: '#3b82f6',
    darkAccent: '#818cf8',
  },
  {
    id: 'shards',
    name: '气旋碎片',
    description: '玻璃碎片流带与测绘标记，层次景深',
    keywords: ['气旋', '碎片', '玻璃', 'Aero'],
    lightAccent: '#7c6bb0',
    darkAccent: '#a78bfa',
  },
  {
    id: 'beams',
    name: '光束',
    description: '柔光光束扫过画面，适合创作主舞台',
    keywords: ['光束', '梁', '扫光'],
    lightAccent: '#2563eb',
    darkAccent: '#818cf8',
  },
  {
    id: 'rays',
    name: '光芒',
    description: '顶部光线倾泻与体积光晕，聚光舞台感',
    keywords: ['光芒', '光线', '体积光', 'LightRays'],
    lightAccent: '#2563eb',
    darkAccent: '#93c5fd',
  },
  {
    id: 'dots',
    name: '工程点阵',
    description: '低干扰坐标微点阵，辅助排版节奏',
    keywords: ['点阵', '网格', '工程'],
    lightAccent: '#6366f1',
    darkAccent: '#818cf8',
  },
  {
    id: 'galaxy',
    name: '星系',
    description: '星野纵深与微闪烁，沉浸暗场氛围',
    keywords: ['星系', '星空', '银河'],
    lightAccent: '#6366f1',
    darkAccent: '#c4b5fd',
  },
  {
    id: 'particles',
    name: '粒子',
    description: '轻盈粒子漂浮与连线，科技感背景',
    keywords: ['粒子', '漂浮', '连线'],
    lightAccent: '#0ea5e9',
    darkAccent: '#7dd3fc',
  },
];

export function getBackgroundCatalogItem(id: AppBackgroundStyle): BackgroundCatalogItem {
  return BACKGROUND_CATALOG.find((item) => item.id === id) ?? BACKGROUND_CATALOG[0];
}
