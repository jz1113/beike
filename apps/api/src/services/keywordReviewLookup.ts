import type { KeywordReviewResult, KeywordReviewRow } from '@beike/contracts/generate';
import { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';
import { gatewayFetch } from '../gateways/http';
import { clipReasonChars, LOOKUP_SUBJECT_MAX, rewriteLookupCategoryReason } from './keywordReviewReasons';

export const KEYWORD_REVIEW_LOOKUP_LIMIT = 5;
export const KEYWORD_REVIEW_LOOKUP_CONCURRENCY = 3;
export const KEYWORD_REVIEW_LOOKUP_TIMEOUT_MS = 20_000;
const LOOKUP_CACHE_LIMIT = 2000;

export type ReviewedKeywordRow = KeywordReviewResult & { needsLookup: boolean };
type LookupHit = { category: string; subject?: string };

const lookupCache = new Map<string, LookupHit>();

export function resetLookupCacheForTests() {
  lookupCache.clear();
}

export function rememberLookupCategory(query: string, category: string, subject?: string) {
  const key = query.trim();
  if (!key) return;
  if (lookupCache.size >= LOOKUP_CACHE_LIMIT) {
    const oldest = lookupCache.keys().next().value;
    if (oldest !== undefined) lookupCache.delete(oldest);
  }
  const clipped = clipReasonChars(subject || '', LOOKUP_SUBJECT_MAX) || undefined;
  lookupCache.set(key, { category, subject: clipped });
}

export function recalledLookupCategory(query: string): string | undefined {
  return lookupCache.get(query.trim())?.category;
}

function recalledLookupHit(query: string): LookupHit | undefined {
  return lookupCache.get(query.trim());
}

export function selectLookupRows(
  results: ReviewedKeywordRow[],
  rows: KeywordReviewRow[],
  limit = KEYWORD_REVIEW_LOOKUP_LIMIT,
): KeywordReviewRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const picked: KeywordReviewRow[] = [];
  for (const result of results) {
    if (picked.length >= limit) break;
    if (!result.needsLookup && result.category !== '其他') continue;
    const row = byId.get(result.id);
    if (!row) continue;
    const key = row.query.trim();
    if (!key || seen.has(key) || lookupCache.has(key)) continue;
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
): ReviewedKeywordRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return results.map((result) => {
    const query = byId.get(result.id)?.query;
    return applyLookupHit(result, query ? recalledLookupHit(query) : undefined);
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
  };
}

function buildLookupPrompt(allowed: readonly string[]): string {
  return `你只确认这个中文内容关键词的主体是什么，并只从允许垂类里选一个：
${allowed.join('、')}

只用搜索确认作品、品牌、游戏、外文词、机构或陌生实体是什么。query 已经清楚时，不要用网页改意图。不要输出网页内容。

严格返回 JSON：{"category":"唯一允许垂类","subject":"不超过12字的主体短语"}。`;
}

async function lookupOneRow(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  row: KeywordReviewRow;
  allowed: Set<string>;
  categories: readonly string[];
}): Promise<LookupHit | undefined> {
  const cached = recalledLookupHit(options.row.query);
  if (cached) return cached;
  const response = await gatewayFetch(`${normalizeGatewayBaseUrl(options.baseUrl)}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify({
      model: options.model,
      thinking: { type: 'disabled' },
      reasoning: { effort: 'none' },
      max_output_tokens: 256,
      tools: [{ type: 'web_search' }],
      input: [
        { role: 'system', content: buildLookupPrompt(options.categories) },
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
  const hit = parseLookupResult(extractResponsesText(await response.json()), options.allowed);
  if (hit) rememberLookupCategory(options.row.query, hit.category, hit.subject);
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
}): Promise<{ results: KeywordReviewResult[]; lookedUp: number }> {
  const withCache = applyCachedLookupCategories(options.results, options.rows);
  const targets = selectLookupRows(withCache, options.rows);
  if (targets.length === 0) {
    return { results: withCache.map(toPublicResult), lookedUp: 0 };
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
  };
}
