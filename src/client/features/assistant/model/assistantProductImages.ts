export function dedupeUrls(urls: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const res: string[] = [];
  for (const item of urls) {
    if (!item || typeof item !== 'string') continue;
    const u = item.trim();
    if (!u.startsWith('http') && !u.startsWith('//')) continue;
    let canonical = u;
    try {
      const p = new URL(u.startsWith('//') ? 'https:' + u : u);
      canonical = `${p.hostname}${p.pathname}`.toLowerCase();
    } catch {
      canonical = u.split('?')[0].toLowerCase();
    }
    if (!seen.has(canonical)) {
      seen.add(canonical);
      res.push(u.startsWith('//') ? 'https:' + u : u);
    }
  }
  return res;
}

