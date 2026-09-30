/** Save one related group, restoring its previous values if any write fails. */
export function writeLocalConfig(values: Readonly<Record<string, string | null>>): void {
  const previous = new Map<string, string | null>();
  const written: string[] = [];
  try {
    for (const key of Object.keys(values)) previous.set(key, localStorage.getItem(key));
    for (const [key, value] of Object.entries(values)) {
      written.push(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  } catch {
    let restored = true;
    for (const key of written.reverse()) {
      try {
        const value = previous.get(key);
        if (value === null || value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch { restored = false; }
    }
    throw new Error(restored
      ? '本地配置保存失败，请检查存储权限或可用空间后重试'
      : '本地配置保存失败，部分更改未能还原，请恢复存储权限后重新保存');
  }
}
