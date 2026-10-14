import {
  Activity,
  AudioLines,
  Box,
  HardDrive,
  Languages,
  LayoutGrid,
  MessageSquare,
  Music,
  Palette,
  Plug,
  Shield,
  Video,
} from 'lucide-react';

export type SettingsNavSection =
  | 'privacy'
  | 'canvas'
  | 'api'
  | 'chat'
  | 'image'
  | 'video'
  | 'three_d'
  | 'music'
  | 'voice'
  | 'storage'
  | 'language'
  | 'profile';

export type CanvasSettingsPage =
  | 'connections'
  | 'board'
  | 'nodes'
  | 'actions'
  | 'token'
  | 'media'
  | 'pet'
  | 'jimeng'
  | 'codex'
  | 'upscale';

interface NavItem {
  id: SettingsNavSection;
  label: string;
  icon: typeof Shield;
  keywords: string[];
}

export const CANVAS_SETTINGS_PAGES: { id: CanvasSettingsPage; label: string; count?: number; keywords: string[] }[] = [
  { id: 'connections', label: '连线', count: 8, keywords: ['连线', '跑马灯', '流光', '粗细'] },
  { id: 'board', label: '画布', count: 10, keywords: ['网格', '吸附', '导航', '光晕'] },
  { id: 'nodes', label: '节点', count: 5, keywords: ['节点', '秒表', '开始'] },
  { id: 'actions', label: '操作', count: 1, keywords: ['删除', '确认'] },
  { id: 'token', label: '平台令牌', keywords: ['token', 'user id', '令牌'] },
  { id: 'media', label: '图床', keywords: ['图床', 'oss', '存储', '素材'] },
  { id: 'pet', label: '桌宠', keywords: ['桌宠', '麻衣'] },
  { id: 'jimeng', label: '即梦', keywords: ['即梦', 'seedance'] },
  { id: 'codex', label: 'Codex', keywords: ['codex', 'openai'] },
  { id: 'upscale', label: '超清', keywords: ['超清', '放大'] },
];

export const SETTINGS_NAV_ITEMS: NavItem[] = [
  { id: 'privacy', label: '隐私', icon: Shield, keywords: ['隐私', '截图', '分享'] },
  { id: 'canvas', label: '画布功能', icon: LayoutGrid, keywords: ['画布', '连线', '节点', '图床', '桌宠'] },
  { id: 'api', label: 'API 接入', icon: Plug, keywords: ['api', 'comfly', 'openai', 'deepseek', '联池', '网关', 'key', '渠道', '万邦', '奇云'] },
  { id: 'chat', label: '对话', icon: MessageSquare, keywords: ['对话', '视觉', '默认', '助手'] },
  { id: 'image', label: '绘画', icon: Palette, keywords: ['绘画', '生图', '默认'] },
  { id: 'video', label: '视频', icon: Video, keywords: ['视频', '默认'] },
  { id: 'three_d', label: '3D', icon: Box, keywords: ['3d', '混元'] },
  { id: 'music', label: '音乐', icon: Music, keywords: ['音乐', 'suno'] },
  { id: 'voice', label: '语音', icon: AudioLines, keywords: ['语音', '配音'] },
  { id: 'storage', label: '存储', icon: HardDrive, keywords: ['存储', 'oss', 'r2', 's3'] },
  { id: 'language', label: '语言', icon: Languages, keywords: ['语言', '中文'] },
  { id: 'profile', label: '创作档案', icon: Activity, keywords: ['用量', '额度', '余额', '统计', '消耗', 'token', '足迹'] },
];

export function settingsSectionLabel(section: SettingsNavSection, canvasPage: CanvasSettingsPage) {
  if (section === 'canvas') return CANVAS_SETTINGS_PAGES.find(page => page.id === canvasPage)?.label || '画布功能';
  return SETTINGS_NAV_ITEMS.find(item => item.id === section)?.label || '设置';
}
