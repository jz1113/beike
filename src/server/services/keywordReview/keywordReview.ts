import type { KeywordReviewMode, KeywordReviewResult, KeywordReviewRow } from '@shared/contracts/generate';
import { KEYWORD_REVIEW_CATEGORIES } from '@shared/contracts/generate';
import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import { gatewayFetch } from '../../gateways/http';
import type { ReviewedKeywordRow } from './keywordReviewLookup';
import { normalizeCategoryReason, normalizeRejectReason } from './keywordReviewReasons';
import { formatKeywordReviewRuleAdditions, ruleEntriesForMode } from './keywordReviewRules';
import { DeepSeekApiError, KeywordReviewOutputError, deepSeekResponseError } from './keywordReviewUpstreamError';
import { buildVideoReviewPrompt, VIDEO_CATEGORY_SET } from './keywordReviewVideo';
import type { KeywordReviewRuleEntry } from '@shared/contracts/generate';

export const KEYWORD_REVIEW_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const KEYWORD_REVIEW_DEEPSEEK_MODEL = 'deepseek-flash';
const KEYWORD_REVIEW_MAX_TOKENS = 12288;

export { KEYWORD_REVIEW_CATEGORIES } from '@shared/contracts/generate';

const CATEGORY_SET = new Set<string>(KEYWORD_REVIEW_CATEGORIES);

export const REVIEW_EXPANSION_MAX = 120;

export function clipReviewText(value: string | undefined, max = REVIEW_EXPANSION_MAX): string | undefined {
  if (!value) return value;
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

export function buildModelRows(rows: KeywordReviewRow[]): KeywordReviewRow[] {
  return rows.map((row, index) => ({
    id: String(index + 1),
    query: row.query,
    expansion: clipReviewText(row.expansion),
    entityExpansion: clipReviewText(row.entityExpansion),
    contentType: clipReviewText(row.contentType, 40),
  }));
}

export function remapModelIds(value: unknown, rows: KeywordReviewRow[]): unknown {
  const items = (value as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(items)) return value;
  const byShort = new Map(rows.map((row, index) => [String(index + 1), row.id]));
  return {
    ...(value as object),
    results: items.map((item) => {
      const candidate = item as { id?: unknown };
      const mapped = byShort.get(String(candidate?.id ?? ''));
      return mapped ? { ...(candidate as object), id: mapped } : item;
    }),
  };
}

function buildSystemPrompt(lookup: boolean, compact: boolean): string {
  const lookupRule = lookup
    ? '认不出作品、品牌、游戏、外文词、机构或陌生实体时，needsLookup 为 true；其余为 false。不要因为想更稳就把常识词标成 true。'
    : '';
  const lookupField = lookup ? ',"needsLookup":false' : '';
  const outputFormat = compact
    ? `results 中每行使用定长数组，依次为 [id,category,producible,categoryReason,rejectReason${lookup ? ',needsLookup' : ''}]。制作时 rejectReason 仍填空字符串，不得省略位置。严格返回 JSON：{"results":[["1","3C数码","制作","手机选购，归数码设备",""${lookup ? ',false' : ''}]]}`
    : `严格返回 JSON：{"results":[{"id":"序号","category":"唯一允许垂类","producible":"制作或不制作","categoryReason":"垂类短依据","rejectReason":"不制作短依据或空字符串"${lookupField}}]}`;
  return `你是中文内容关键词的资深语义审核员。必须逐行理解真实意图，不得使用关键词命中、正则或“未命中即其他”。

输出只允许这 34 个垂类：
${KEYWORD_REVIEW_CATEGORIES.join('、')}

每行含 id、query、expansion（相关拓展q）、entityExpansion（实体拓展q）、contentType。

读表顺序：
1. 先只看 query 的主体、需求和场景；query 清晰时直接裁决。
2. query 是简称、陌生实体、泛实体或多义词时，才用 expansion 和 entityExpansion 消歧。扩展词有噪声时不得覆盖清晰的 query。
3. 仍不足才看 contentType。教程、攻略、解读、推荐、价格、视频只是表达形式，不能抢占主体。

垂类边界：
- 宠物疾病、用药、诊疗、疫苗 → 医疗健康；普通物种、行为、训练、喂养、宠物用品 → 动物。
- App、办公软件、设置、效率工具 → 软件工具；编程、开发、互联网产品、协议、网络技术 → 互联网IT。
- 科学原理、自然科学、技术知识 → 科学技术；教材型知识点、解题、学习方法 → 教育。
- 政治、历史、军事 → 政史军；政策解读、政务办理、公共服务 → 政策政务。
- 影视剧 → 影视；动画与二次元向内容 → 动漫；一般社会知识 → 社会，敏感热点不制作。
- 「其他」只能在核对 query、expansion、entityExpansion、contentType 后仍无法映射时使用。
- 例子：游戏手机推荐→3C数码；乌天狗的日本传说→民俗文化；中华人民共和国教师法→法律；梦幻西游装备属性→游戏；狗狗腹泻怎么用药→医疗健康；狗狗训练方法→动物。

可制作性与垂类分开判断。命中任一条填「不制作」，不要改写原词：
1. 金融决策：股票基金理财投资建议涨跌预测证券期货外汇加密货币。
2. 人或宠物的诊断、症状、治疗、用药、剂量、医疗风险、兽医干预。
3. 正在发酵的争议事件、舆论事件、突发案件、敏感时事评论。
4. 违法、色情、暴恐、涉毒、危险、反科学。
5. 八字、风水、占卜、运势预测、生肖运气、起名打分、改命改运。
6. 工业硬广、厂家排名、供应商推荐、工业采购推销。
7. 非笔记需求：query 明确指向视频、长图文、工具结果等非笔记形态，用户所需内容无法通过图片为主、文字为辅的笔记高效满足。不可做示例：「14款骐达中网拆装视频」「快手拍视频动图操作指南」「生日卡片任务视频应该用什么音乐」「电影抓娃娃在线观看」「聊斋全书txt」。操作步骤、经验心得若可用图文分步呈现，仍可按笔记生产；仅当内容天然依赖视频演示、长文拆解或工具输出时才判非笔记需求。不能只凭「视频」「操作」等字词或涉及软件、账号、设备就否决，须判断实际索取的内容与载体。
8. 红包礼金、人情随礼、灰色利益决策。
9. 尺寸、数量、年限、颜色、型号、狭窄地点等条件层层叠加，生产空间过窄。
10. 简单问答：自然回答只是一个事实、固定数字、身份、日期、距离、价格、尺寸或一两句话。例如「美国总统是谁」「iPhone 15多少钱」。出现数字不等于简单问答，「花菜焯水多久好吃」可制作。
11. 低价值：恋爱婚姻决策、社交话术模板、起名打分、红包礼金、算命风水、无意义内容。梦境描述、解梦文化说明、星座科普、版权、游戏攻略、校园、旅游、公司评价不算低价值。星座教育可制作；个人命运、财运、桃花、幸运色预测不制作。

只有完全没有提问、动作或层层限制的泛实体（如 U盘、杭州电子科技大学、猫砂），只要不触碰否决，填「制作」，不要改写 query。带具体问题的词必须按该问题独立判断，不得套用泛实体规则。

其余确实能形成经验、教程、对比、评测、攻略或实质说明的内容，填「制作」；每一行先检查上述否决项，不得因同批多数行可制作而沿用结论。

${lookupRule}

依据只写决定性事实，不复述 query，不写「因为所以」「内容不适合」这类空话：
- categoryReason 每行必填，10-18字。句式：{认出来的主体}，{为什么落在这个垂类}。相邻类易混时后半句点出排除项。
- rejectReason 仅当 producible 为「不制作」时填写；「制作」必须是空字符串。句式：{否决类型}：{这一行命中的点}，12-24字。否决类型只能是：简单问答、低价值、金融决策、医疗诊疗、敏感热点、违法危险、算命迷信、工业硬广、非笔记需求、限制过细。只写第一条命中的。
例子：游戏手机推荐 → categoryReason=被选的是手机，不是游戏内容，rejectReason=""；美国总统是谁 → rejectReason=简单问答：只确认一个身份；怎么判断他对我有好感 → rejectReason=低价值：个人恋爱好感判断；电影抓娃娃在线观看 → rejectReason=非笔记需求：索取电影正片播放。

id 是本批序号，必须原样返回。${outputFormat}。每个输入 id 恰好返回一次，不得遗漏。`;
}

function parseModelJson(raw: string): unknown {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

export function expandCompactResults(value: unknown, mode: KeywordReviewMode, lookup: boolean): unknown {
  const items = (value as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(items)) return value;
  const fields = mode === 'video'
    ? ['id', 'category', 'producible', 'lowValue', 'categoryReason', 'rejectReason']
    : ['id', 'category', 'producible', 'categoryReason', 'rejectReason'];
  return {
    ...(value as object),
    results: items.map((item) => {
      if (!Array.isArray(item)) return item;
      const valid = item.length >= fields.length - 1
        && item.length <= fields.length + Number(lookup)
        && (typeof item[0] === 'string' || (typeof item[0] === 'number' && Number.isInteger(item[0])));
      if (!valid) return { id: item[0] };
      const result = Object.fromEntries(fields.map((field, index) => [field, item[index]]));
      return lookup ? { ...result, needsLookup: item[fields.length] === true } : result;
    }),
  };
}

export type KeywordReviewValidation = { results: ReviewedKeywordRow[]; failedIds: string[] };

function canonicalCategory(raw: string, allowed: Set<string>): string | undefined {
  const trimmed = raw.trim();
  if (allowed.has(trimmed)) return trimmed;
  const compact = trimmed.replace(/\s+/g, '').replace(/／/g, '/');
  for (const name of allowed) {
    if (name.replace(/\s+/g, '') === compact) return name;
  }
  return undefined;
}

function repairRow(candidate: Partial<ReviewedKeywordRow>, mode: KeywordReviewMode): ReviewedKeywordRow {
  const allowed = mode === 'video' ? VIDEO_CATEGORY_SET : CATEGORY_SET;
  const category = canonicalCategory(String(candidate?.category || ''), allowed);
  const producible = String(candidate?.producible || '');
  if (!category) throw new SyntaxError('非法垂类');
  if (producible !== '制作' && producible !== '不制作') throw new SyntaxError('非法制作结论');
  const lowValue = candidate?.lowValue;
  if (mode === 'video' && lowValue !== '是' && lowValue !== '否') throw new SyntaxError('缺少低价值标记');
  if (mode === 'video' && lowValue === '是' && producible !== '不制作') throw new SyntaxError('低价值不能制作');
  const nextProducible = producible as KeywordReviewResult['producible'];
  return {
    id: String(candidate.id),
    category,
    producible: nextProducible,
    categoryReason: normalizeCategoryReason(String(candidate?.categoryReason || '').trim() || `${category}相关内容`),
    rejectReason: normalizeRejectReason(nextProducible, candidate?.rejectReason),
    ...(mode === 'video' ? { lowValue } : {}),
    needsLookup: candidate?.needsLookup === true,
  };
}

export function validateResults(value: unknown, rows: KeywordReviewRow[], mode: KeywordReviewMode = 'image'): KeywordReviewValidation {
  const items = (value as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(items)) throw new SyntaxError('模型未返回 results 数组');
  const expected = new Set(rows.map((row) => row.id));
  const seen = new Set<string>();
  const results: ReviewedKeywordRow[] = [];
  const failed = new Set<string>();
  for (const item of items) {
    const candidate = item as Partial<ReviewedKeywordRow>;
    const id = String(candidate?.id || '');
    if (!expected.has(id) || seen.has(id)) continue;
    seen.add(id);
    try {
      results.push(repairRow({ ...candidate, id }, mode));
    } catch {
      failed.add(id);
    }
  }
  for (const row of rows) if (!seen.has(row.id)) failed.add(row.id);
  const byId = new Map(results.map((item) => [item.id, item]));
  return {
    results: rows.flatMap((row) => {
      const item = byId.get(row.id);
      return item ? [item] : [];
    }),
    failedIds: rows.map((row) => row.id).filter((id) => failed.has(id)),
  };
}

function stripLookupFlag(results: ReviewedKeywordRow[]): KeywordReviewResult[] {
  return results.map(({ id, category, producible, categoryReason, rejectReason, lowValue }) => ({
    id,
    category,
    producible,
    categoryReason,
    rejectReason,
    ...(lowValue ? { lowValue } : {}),
  }));
}

export async function reviewKeywordRows(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider?: 'deepseek' | 'gateway';
  rows: KeywordReviewRow[];
  lookup?: boolean;
  lookupBudget?: number;
  ruleEntries?: KeywordReviewRuleEntry[];
  rulesVersion?: number;
  reviewMode?: KeywordReviewMode;
}): Promise<{ results: KeywordReviewResult[]; failedIds: string[]; usage?: Record<string, number>; lookupUsage?: Record<string, number>; lookedUp: number }> {
  if (options.lookup === true || (options.lookupBudget ?? 0) > 0) {
    throw new Error('联网补查已暂停：当前接口不会执行网页搜索');
  }
  const mode = options.reviewMode || 'image';
  const compact = options.provider !== 'gateway';
  const additions = formatKeywordReviewRuleAdditions(ruleEntriesForMode(options.ruleEntries || [], mode));
  const response = await gatewayFetch(`${normalizeGatewayBaseUrl(options.baseUrl)}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify({
      model: options.model,
      temperature: 0.1,
      max_tokens: KEYWORD_REVIEW_MAX_TOKENS,
      ...(options.provider !== 'gateway' ? { thinking: { type: 'disabled' } } : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${mode === 'video' ? buildVideoReviewPrompt(false, compact) : buildSystemPrompt(false, compact)}${additions}` },
        { role: 'user', content: `请审核以下行：\n${JSON.stringify(buildModelRows(options.rows))}` },
      ],
    }),
    signal: AbortSignal.timeout(10 * 60_000 + 30_000),
  });
  if (!response.ok) throw await deepSeekResponseError(response, options.provider === 'gateway' ? '模型网关' : 'DeepSeek');
  let data;
  try { data = await response.json(); }
  catch {
    throw new DeepSeekApiError(502, '模型服务响应传输异常，提交结果待核对', options.provider === 'gateway' ? '模型网关' : 'DeepSeek');
  }
  // Record provider usage before validating the answer: malformed output can
  // still be billed, and successful-only accounting hides that expense.
  const reasoningTokens = Number(data.usage?.completion_tokens_details?.reasoning_tokens || 0);
  if (reasoningTokens > 0) console.warn('[KeywordReviewUsage] thinking tokens were billed', reasoningTokens);
  console.info('[KeywordReviewUsage]', JSON.stringify({
    providerRequestId: typeof data.id === 'string' ? data.id : undefined,
    model: options.model,
    reviewMode: mode,
    rowCount: options.rows.length,
    usage: data.usage || null,
  }));
  try {
    const finishReason = String(data.choices?.[0]?.finish_reason || '');
    if (finishReason === 'length') {
      throw new SyntaxError(`关键词审核模型 ${options.model} 输出被截断，本批结果未写入`);
    }
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== 'string' || !raw.trim()) throw new SyntaxError(`关键词审核模型 ${options.model} 没有返回内容`);
    let parsed: unknown;
    try { parsed = parseModelJson(raw); }
    catch { throw new SyntaxError(`关键词审核模型 ${options.model} 返回了不完整 JSON，本批结果未写入`); }
    const firstPass = validateResults(remapModelIds(expandCompactResults(parsed, mode, false), options.rows), options.rows, mode);
    return { results: stripLookupFlag(firstPass.results), failedIds: firstPass.failedIds, usage: data.usage, lookedUp: 0 };
  } catch (error) {
    if (error instanceof SyntaxError) throw new KeywordReviewOutputError(error.message, data.usage);
    throw error;
  }
}

export type DeepSeekBalance = {
  currency: 'CNY' | 'USD';
  total: string;
  granted: string;
  toppedUp: string;
  available: boolean;
};

export function pickDeepSeekBalance(data: unknown): DeepSeekBalance {
  const payload = data as { is_available?: unknown; balance_infos?: unknown[] };
  const infos = Array.isArray(payload.balance_infos) ? payload.balance_infos : [];
  const asInfo = (item: unknown) => item as {
    currency?: unknown;
    total_balance?: unknown;
    granted_balance?: unknown;
    topped_up_balance?: unknown;
  };
  const cny = infos.find((item) => asInfo(item).currency === 'CNY');
  const usd = infos.find((item) => asInfo(item).currency === 'USD');
  const chosen = asInfo(cny || usd);
  if (chosen.currency !== 'CNY' && chosen.currency !== 'USD') {
    throw new Error('未能读取 DeepSeek 余额');
  }
  return {
    currency: chosen.currency,
    total: String(chosen.total_balance ?? '0'),
    granted: String(chosen.granted_balance ?? '0'),
    toppedUp: String(chosen.topped_up_balance ?? '0'),
    available: payload.is_available === true,
  };
}

export async function fetchDeepSeekBalance(options: {
  baseUrl: string;
  apiKey: string;
}): Promise<DeepSeekBalance> {
  const response = await gatewayFetch(`${normalizeGatewayBaseUrl(options.baseUrl)}/user/balance`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${options.apiKey}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw await deepSeekResponseError(response);
  return pickDeepSeekBalance(await response.json());
}
