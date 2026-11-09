import { domainStorage } from '@shared/domain/core/runtime';

export const PENDING_SETTINGS_SECTION_KEY = 'beike.settings.pendingSection';

let memoryPendingSection: string | null = null;

function queueStorageSection(section: string): void {
  memoryPendingSection = section;
  try {
    domainStorage()?.setItem(PENDING_SETTINGS_SECTION_KEY, section);
  } catch {
    /* 打开设置时仍回落到默认分区 */
  }
}

function peekStorageSection(): string | null {
  try {
    const stored = domainStorage()?.getItem(PENDING_SETTINGS_SECTION_KEY);
    if (stored) return stored;
  } catch {
    return memoryPendingSection;
  }
  return memoryPendingSection;
}

export function clearQueuedSettingsSection(): void {
  memoryPendingSection = null;
  try {
    domainStorage()?.removeItem(PENDING_SETTINGS_SECTION_KEY);
  } catch {
    /* 分区提示只影响下一次打开 */
  }
}

export type SettingsNavSection =
  | 'library'
  | 'appearance'
  | 'profile'
  | 'api'
  | 'chat'
  | 'image'
  | 'video'
  | 'voice'
  | 'canvas'
  | 'pet'
  | 'language'
  | 'storage';

export type CanvasSettingsPage =
  | 'connections'
  | 'board'
  | 'nodes'
  | 'actions'
  | 'pet';

interface NavItem {
  id: SettingsNavSection;
  label: string;
  keywords: string[];
}

export const CANVAS_SETTINGS_PAGES: { id: CanvasSettingsPage; label: string; count?: number; keywords: string[] }[] = [
  { id: 'connections', label: '连线', count: 9, keywords: ['连线', '跑马灯', '流光', '粗细'] },
  { id: 'board', label: '画布', count: 9, keywords: ['网格', '吸附', '导航', '光晕'] },
  { id: 'nodes', label: '节点', count: 5, keywords: ['节点', '秒表', '开始'] },
  { id: 'actions', label: '操作', count: 1, keywords: ['删除', '确认'] },
  { id: 'pet', label: '桌宠', keywords: ['桌宠', '画布联动', '视线'] },
];

export const SETTINGS_NAV_ITEMS: NavItem[] = [
  { id: 'profile', label: '创作档案', keywords: ['用量', '额度', '余额', '统计', '消耗', 'token', '足迹'] },
  { id: 'library', label: '资产库', keywords: ['素材', '共享', '工作区', '入口', '侧栏'] },
  { id: 'appearance', label: '外观与主题', keywords: ['外观', '深色', '浅色', '主题', '暗黑', '模式', '背景', '夜间', '白天'] },
  { id: 'api', label: 'API 接入', keywords: ['api', 'comfly', 'openai', 'deepseek', '网关', 'key', '渠道', '万邦'] },
  { id: 'chat', label: '多模态', keywords: ['多模态', '对话', '视觉', '默认', '助手'] },
  { id: 'image', label: '绘画', keywords: ['绘画', '生图', '默认'] },
  { id: 'video', label: '视频', keywords: ['视频', '默认'] },
  { id: 'voice', label: '语音', keywords: ['语音', '配音'] },
  { id: 'canvas', label: '画布功能', keywords: ['画布', '连线', '节点', '桌宠'] },
  { id: 'language', label: '语言', keywords: ['语言', '中文'] },
  { id: 'storage', label: '存储', keywords: ['存储', 'oss', 'r2', 's3'] },
];

export function settingsSectionLabel(section: SettingsNavSection, canvasPage: CanvasSettingsPage) {
  if (section === 'canvas') return CANVAS_SETTINGS_PAGES.find(page => page.id === canvasPage)?.label || '画布功能';
  return SETTINGS_NAV_ITEMS.find(item => item.id === section)?.label || '设置';
}

export function queueSettingsSection(section: SettingsNavSection | 'canvas:pet' | string) {
  queueStorageSection(section);
}

export function peekQueuedSettingsSection(): SettingsNavSection | null {
  const value = peekStorageSection();
  if (value === 'canvas:pet') return 'canvas';
  if (value && SETTINGS_NAV_ITEMS.some((item) => item.id === value)) return value as SettingsNavSection;
  return null;
}

export function initialCanvasSettingsPage(): CanvasSettingsPage {
  return peekStorageSection() === 'canvas:pet' ? 'pet' : 'connections';
}
