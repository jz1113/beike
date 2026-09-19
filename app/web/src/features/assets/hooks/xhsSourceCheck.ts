export type SourceCheckRow = {
  url: string;
  resolvedUrl?: string;
  sourceKey?: string;
  state: string;
};

export type CollectionIssue = {
  kind: 'duplicate' | 'error';
  url: string;
  reason?: string;
};

export function selectFreshSourceUrls(
  rows: SourceCheckRow[],
  queue: Array<{ sourceUrl?: string; status: string }>,
): { urls: string[]; issues: CollectionIssue[] } {
  const issues: CollectionIssue[] = [];
  const seenKeys = new Set<string>();
  const urls: string[] = [];
  const failedUrls = new Set(
    queue.filter((item) => item.status === 'error' && item.sourceUrl).map((item) => item.sourceUrl as string),
  );

  for (const row of rows) {
    if (row.state === 'approved' && !failedUrls.has(row.url) && !failedUrls.has(row.resolvedUrl || '')) {
      issues.push({ kind: 'duplicate', url: row.url, reason: '已在资产库中' });
      continue;
    }
    const key = row.sourceKey || row.resolvedUrl || row.url;
    if (seenKeys.has(key)) {
      issues.push({ kind: 'duplicate', url: row.url, reason: '与已选链接指向同一笔记' });
      continue;
    }
    seenKeys.add(key);
    urls.push(row.resolvedUrl || row.url);
  }

  return { urls, issues };
}

export function mergeParsedQueueItems<T extends { sourceUrl?: string; id: string }>(
  prev: Array<T & { status?: string }>,
  incoming: T[],
): T[] {
  const next = [...prev];
  for (const item of incoming) {
    const index = next.findIndex(
      (row) => row.status === 'error' && row.sourceUrl && item.sourceUrl && row.sourceUrl === item.sourceUrl,
    );
    if (index >= 0) next[index] = item;
    else next.push(item);
  }
  return next;
}
