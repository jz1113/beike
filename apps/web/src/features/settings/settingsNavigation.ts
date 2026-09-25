import { Layers, Boxes, SlidersHorizontal, Plug, Activity } from 'lucide-react';

export type SettingsNavSection = 'api_services' | 'models' | 'defaults' | 'other_services' | 'usage';

interface NavGroupItem {
  id: SettingsNavSection;
  label: string;
  icon: typeof Layers;
  keywords: string[];
}

interface NavGroup {
  groupTitle: string;
  items: NavGroupItem[];
}

export const SETTINGS_NAV_GROUPS: NavGroup[] = [
  {
    groupTitle: '模型与服务',
    items: [
      { id: 'api_services', label: '渠道管理', icon: Layers, keywords: ['api', 'comfly', 'openai', 'deepseek', '联池', '网关', 'key', 'token', '接口'] },
      { id: 'models', label: '模型管理', icon: Boxes, keywords: ['模型', '渠道', '筛选', '价格', '启用'] },
      { id: 'defaults', label: '默认模型与调用规则', icon: SlidersHorizontal, keywords: ['默认', '备用', '降级', '策略', '路由'] },
      { id: 'other_services', label: '其他服务', icon: Plug, keywords: ['电商', '万邦', '解析', '奇云', '存储', 'APIA'] },
    ],
  },
  {
    groupTitle: '数据与统计',
    items: [
      { id: 'usage', label: '用量统计', icon: Activity, keywords: ['用量', '额度', '余额', '统计', '消耗', 'token', '花费', '账单'] },
    ],
  },
];
