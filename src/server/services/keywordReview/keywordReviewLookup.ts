import type { KeywordReviewResult, KeywordReviewRow } from '@shared/contracts/generate';
import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import { getWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { gatewayFetch } from '../../gateways/http';
import { readKeywordLookupCache, writeKeywordLookupCache } from '../../repositories/keywordReview';
import { clipReasonChars, LOOKUP_SUBJECT_MAX, rewriteLookupCategoryReason } from './keywordReviewReasons';

export const KEYWORD_REVIEW_LOOKUP_LIMIT = 2;
export const KEYWORD_REVIEW_LOOKUP_RUN_LIMIT = 100;
export const KEYWORD_REVIEW_LOOKUP_CONCURRENCY = 3;
export const KEYWORD_REVIEW_LOOKUP_TIMEOUT_MS = 20_000;
const LOOKUP_CACHE_LIMIT = 2000;

export type ReviewedKeywordRow = KeywordReviewResult & { needsLookup: boolean };
type LookupHit = { category: string; subject?: string };

const lookupCache = new Map<string, LookupHit>();

function cacheKey(query: string, rulesVersion = 0): string {
  return `${rulesVersion}:${query.trim()}`;
}

export function resetLookupCacheForTests() {
  lookupCache.clear();
  persistence = prismaPersistence;
}

type LookupPersistence = {
  read: (workspaceId: string, rulesVersion: number, queries: string[]) => Promise<Array<{ query: string; category: string; subject: string }>>;
  write: (workspaceId: string, rulesVersion: number, query: string, hit: LookupHit) => Promise<void>;
};

const prismaPersistence: LookupPersistence = {
  read: readKeywordLookupCache,
  write: writeKeywordLookupCache,
};

let persistence: LookupPersistence = prismaPersistence;

export function setLookupPersistenceForTests(store: LookupPersistence | null) {
  persistence = store || prismaPersistence;
}

function rememberInMemory(query: string, category: string, subject?: string, rulesVersion = 0) {
  const key = cacheKey(query, rulesVersion);
  if (!key) return;
  if (lookupCache.size >= LOOKUP_CACHE_LIMIT) {
    const oldest = lookupCache.keys().next().value;
    if (oldest !== undefined) lookupCache.delete(oldest);
  }
  const clipped = clipReasonChars(subject || '', LOOKUP_SUBJECT_MAX) || undefined;
  lookupCache.set(key, { category, subject: clipped });
}

export async function storeLookupHit(query: string, category: string, subject?: string, rulesVersion = 0, workspaceId = getWorkspaceId()) {
  rememberInMemory(query, category, subject, rulesVersion);
  const key = query.trim();
  const hit = key ? recalledLookupHit(key, rulesVersion) : undefined;
  if (!workspaceId || !key || !hit) return;
  await persistence.write(workspaceId, rulesVersion, key, hit);
}

export function rememberLookupCategory(query: string, category: string, subject?: string, rulesVersion = 0) {
  void storeLookupHit(query, category, subject, rulesVersion).catch(() => undefined);
}

export async function hydrateLookupCache(queries: string[], rulesVersion = 0, workspaceId = getWorkspaceId()) {
  const missing = [...new Set(queries.map((query) => query.trim()).filter((query) => query && !lookupCache.has(cacheKey(query, rulesVersion))))];
  if (!workspaceId || missing.length === 0) return;
  try {
    const rows = await persistence.read(workspaceId, rulesVersion, missing);
    for (const row of rows) rememberInMemory(row.query, row.category, row.subject, rulesVersion);
  } catch {
    /* A missing table must not block the first-pass review. */
  }
}

export function recalledLookupCategory(query: string, rulesVersion = 0): string | undefined {
  return lookupCache.get(cacheKey(query, rulesVersion))?.category;
}

function recalledLookupHit(query: string, rulesVersion = 0): LookupHit | undefined {
  return lookupCache.get(cacheKey(query, rulesVersion));
}

export function selectLookupRows(
  results: ReviewedKeywordRow[],
  rows: KeywordReviewRow[],
  limit = KEYWORD_REVIEW_LOOKUP_LIMIT,
  rulesVersion = 0,
): KeywordReviewRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const picked: KeywordReviewRow[] = [];
  for (const result of results) {
    if (picked.length >= limit) break;
    if (!result.needsLookup) continue;
    const row = byId.get(result.id);
    if (!row) continue;
    const key = row.query.trim();
    if (!key || seen.has(key) || lookupCache.has(cacheKey(key, rulesVersion))) continue;
    seen.add(key);
    picked.push(row);
  }
  return picked;
}

function applyLookupHit(result: ReviewedKeywordRow, hit?: LookupHit): ReviewedKeywordRow {
  if (!hit) return result;
  return {
    ...result,
    category: hit.category,
    categoryReason: rewriteLookupCategoryReason(result, hit.category, hit.subject),
  };
}

export function applyCachedLookupCategories(
  results: ReviewedKeywordRow[],
  rows: KeywordReviewRow[],
  rulesVersion = 0,
): ReviewedKeywordRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return results.map((result) => {
    const query = byId.get(result.id)?.query;
    return applyLookupHit(result, query ? recalledLookupHit(query, rulesVersion) : undefined);
  });
}

export function extractResponsesText(data: unknown): string {
  const payload = data as { output_text?: unknown; output?: unknown[] };
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  const texts: string[] = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    const row = item as { type?: string; content?: unknown[] };
    if (row.type && row.type !== 'message') continue;
    for (const part of Array.isArray(row.content) ? row.content : []) {
      const block = part as { type?: string; text?: unknown };
      if ((block.type === 'output_text' || block.type === 'text') && typeof block.text === 'string') {
        texts.push(block.text);
      }
    }
  }
  return texts.join('\n').trim();
}

export function parseLookupResult(raw: string, allowed: Set<string>): LookupHit | undefined {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(clean) as { category?: unknown; subject?: unknown };
    const category = String(parsed?.category || '').trim();
    if (!allowed.has(category)) return undefined;
    const subject = clipReasonChars(String(parsed?.subject || '').replace(/[，,。；;：:、]/g, ''), LOOKUP_SUBJECT_MAX);
    return subject ? { category, subject } : { category };
  } catch {
    return undefined;
  }
}

export function parseLookupCategory(raw: string, allowed: Set<string>): string | undefined {
  return parseLookupResult(raw, allowed)?.category;
}

function toPublicResult(result: ReviewedKeywordRow): KeywordReviewResult {
  return {
    id: result.id,
    category: result.category,
    producible: result.producible,
    categoryReason: result.categoryReason,
    rejectReason: result.rejectReason,
    ...(result.lowValue ? { lowValue: result.lowValue } : {}),
  };
}

function buildLookupPrompt(allowed: readonly string[], additions = ''): string {
  return `你只确认这个中文内容关键词的主体是什么，并只从允许垂类里选一个：
${allowed.join('、')}

只用搜索确认作品、品牌、游戏、外文词、机构或陌生实体是什么。query 已经清楚时，不要用网页改意图。不要输出网页内容。

严格返回 JSON：{"category":"唯一允许垂类","subject":"不超过12字的主体短语"}。${additions}`;
}

async function lookupOneRow(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  row: KeywordReviewRow;
  allowed: Set<string>;
  categories: readonly string[];
  rulesVersion?: number;
  ruleAdditions?: string;
  usage?: Record<string, number>;
}): Promise<LookupHit | undefined> {
  const cached = recalledLookupHit(options.row.query, options.rulesVersion);
  if (cached) return cached;
  const response = await gatewayFetch(`${normalizeGatewayBaseUrl(options.baseUrl)}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify({
      model: options.model,
      thinking: { type: 'disabled' },
      max_output_tokens: 256,
      tools: [{ type: 'web_search' }],
      input: [
        { role: 'system', content: buildLookupPrompt(options.categories, options.ruleAdditions) },
        {
          role: 'user',
          content: JSON.stringify({
            query: options.row.query,
            expansion: options.row.expansion || '',
            entityExpansion: options.row.entityExpansion || '',
            contentType: options.row.contentType || '',
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(KEYWORD_REVIEW_LOOKUP_TIMEOUT_MS),
  });
  if (!response.ok) return undefined;
  const data = await response.json();
  const callUsage = (data.usage || {}) as Record<string, number>;
  if (options.usage) {
    options.usage.input_tokens += Number(callUsage.input_tokens || 0);
    options.usage.output_tokens += Number(callUsage.output_tokens || 0);
    options.usage.total_tokens += Number(callUsage.total_tokens || 0);
  }
  console.info('[KeywordReviewLookupUsage]', JSON.stringify({
    providerRequestId: typeof data.id === 'string' ? data.id : undefined,
    model: options.model,
    usage: data.usage || null,
  }));
  const hit = parseLookupResult(extractResponsesText(data), options.allowed);
  if (hit) rememberLookupCategory(options.row.query, hit.category, hit.subject, options.rulesVersion);
  return hit;
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function lookupUncertainCategories(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  rows: KeywordReviewRow[];
  results: ReviewedKeywordRow[];
  allowed: Set<string>;
  categories: readonly string[];
  rulesVersion?: number;
  ruleAdditions?: string;
  maxLookups?: number;
}): Promise<{ results: KeywordReviewResult[]; lookedUp: number; usage: Record<string, number> }> {
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  await hydrateLookupCache(options.rows.map((row) => row.query), options.rulesVersion);
  const withCache = applyCachedLookupCategories(options.results, options.rows, options.rulesVersion);
  const limit = Math.max(0, Math.min(options.maxLookups ?? KEYWORD_REVIEW_LOOKUP_LIMIT, KEYWORD_REVIEW_LOOKUP_LIMIT));
  const targets = selectLookupRows(withCache, options.rows, limit, options.rulesVersion);
  if (targets.length === 0) {
    return { results: withCache.map(toPublicResult), lookedUp: 0, usage };
  }

  const found = new Map<string, LookupHit>();
  await mapPool(targets, KEYWORD_REVIEW_LOOKUP_CONCURRENCY, async (row) => {
    try {
      const hit = await lookupOneRow({
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        model: options.model,
        row,
        allowed: options.allowed,
        categories: options.categories,
        rulesVersion: options.rulesVersion,
        ruleAdditions: options.ruleAdditions,
        usage,
      });
      if (hit) found.set(row.query.trim(), hit);
    } catch {
      // Keep the first-pass result when search times out or fails.
    }
  });

  const byId = new Map(options.rows.map((row) => [row.id, row]));
  return {
    results: withCache.map((result) => {
      const query = byId.get(result.id)?.query.trim();
      return toPublicResult(applyLookupHit(result, query ? found.get(query) : undefined));
    }),
    lookedUp: found.size,
    usage,
  };
}
