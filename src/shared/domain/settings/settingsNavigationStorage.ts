export const PENDING_SETTINGS_SECTION_KEY = 'beike.settings.pendingSection';

export function queueSettingsSection(section: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PENDING_SETTINGS_SECTION_KEY, section);
    }
  } catch {
    /* 打开设置时仍回落到默认分区 */
  }
}

export function peekQueuedSettingsSection(): string | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(PENDING_SETTINGS_SECTION_KEY);
    }
  } catch {
    return null;
  }
  return null;
}

export function clearQueuedSettingsSection(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(PENDING_SETTINGS_SECTION_KEY);
    }
  } catch {
    /* 分区提示只影响下一次打开 */
  }
}
