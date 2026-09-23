import type { KeywordReviewMode, KeywordReviewResult, KeywordReviewRow } from '@beike/contracts/generate';
import { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';
import { gatewayFetch } from '../gateways/http';
import {
  lookupUncertainCategories,
  type ReviewedKeywordRow,
} from './keywordReviewLookup';
import { normalizeCategoryReason, normalizeRejectReason } from './keywordReviewReasons';
import { formatKeywordReviewRuleAdditions, ruleEntriesForMode } from './keywordReviewRules';
import { deepSeekResponseError } from './keywordReviewUpstreamError';
import { buildVideoReviewPrompt, VIDEO_CATEGORY_SET } from './keywordReviewVideo';
import type { KeywordReviewRuleEntry } from '@beike/contracts/generate';

export const KEYWORD_REVIEW_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const KEYWORD_REVIEW_DEEPSEEK_MODEL = 'deepseek-flash';
const KEYWORD_REVIEW_MAX_TOKENS = 12288;

export const KEYWORD_REVIEW_CATEGORIES = [
  '政史军', '3C数码', '本地生活', '动漫', '动物', '法律', '购物消费', '互联网IT', '家居',
  '交通出行', '教育', '金融财经', '科学技术', '旅游', '美食', '美术', '民俗文化', '其他', '汽车',
  '情感', '求职招聘', '软件工具', '社会', '时尚', '体育', '小说', '星座', '医疗健康', '音乐', '影视',
  '游戏', '娱乐', '政策政务', '植物',
] as const;

const CATEGORY_SET = new Set<string>(KEYWORD_REVIEW_CATEGORIES);

function buildSystemPrompt(): string {
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
7. 在线观看、下载资源、破解软件、实时查询、纯工具操作（如界面点击、账号或设备设置、访问共享文件夹），或必须依赖视频演示。讲原理、方案对比、故障排查时不能只因涉及工具就否决。
8. 红包礼金、人情随礼、灰色利益决策。
9. 尺寸、数量、年限、颜色、型号、狭窄地点等条件层层叠加，生产空间过窄。
10. 简单问答：自然回答只是一个事实、固定数字、身份、日期、距离、价格、尺寸或一两句话。例如「美国总统是谁」「iPhone 15多少钱」。出现数字不等于简单问答，「花菜焯水多久好吃」可制作。
11. 低价值：恋爱婚姻决策、社交话术模板、起名打分、红包礼金、算命风水、无意义内容。梦境描述、解梦文化说明、星座科普、版权、游戏攻略、校园、旅游、公司评价不算低价值。星座教育可制作；个人命运、财运、桃花、幸运色预测不制作。

只有完全没有提问、动作或层层限制的泛实体（如 U盘、杭州电子科技大学、猫砂），只要不触碰否决，填「制作」，不要改写 query。带具体问题的词必须按该问题独立判断，不得套用泛实体规则。

其余确实能形成经验、教程、对比、评测、攻略或实质说明的内容，填「制作」；每一行先检查上述否决项，不得因同批多数行可制作而沿用结论。

认不出作品、品牌、游戏、外文词、机构或陌生实体时，needsLookup 为 true；其余为 false。不要因为想更稳就把常识词标成 true。

依据只写决定性事实，不复述 query，不写「因为所以」「内容不适合」这类空话：
- categoryReason 每行必填，16-28字。句式：{认出来的主体}，{为什么落在这个垂类}。相邻类易混时后半句点出排除项。
- rejectReason 仅当 producible 为「不制作」时填写；「制作」必须是空字符串。句式：{否决类型}：{这一行命中的点}，12-24字。否决类型只能是：简单问答、低价值、金融决策、医疗诊疗、敏感热点、违法危险、算命迷信、工业硬广、非笔记需求、限制过细。只写第一条命中的。
例子：游戏手机推荐 → categoryReason=被选的是手机，不是游戏内容，rejectReason=""；美国总统是谁 → rejectReason=简单问答：只确认一个身份；怎么判断他对我有好感 → rejectReason=低价值：个人恋爱好感判断；怎么在淘宝上添加银行卡 → rejectReason=非笔记需求：平台绑卡操作。

严格返回 JSON：{"results":[{"id":"原id","category":"唯一允许垂类","producible":"制作或不制作","categoryReason":"垂类短依据","rejectReason":"不制作短依据或空字符串","needsLookup":false}]}。每个输入 id 恰好返回一次，不得遗漏。`;
}

function parseModelJson(raw: string): unknown {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

export function validateResults(value: unknown, rows: KeywordReviewRow[], mode: KeywordReviewMode = 'image'): ReviewedKeywordRow[] {
  const items = (value as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(items)) throw new SyntaxError('模型未返回 results 数组');
  const expected = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const results: ReviewedKeywordRow[] = [];
  for (const item of items) {
    const candidate = item as Partial<ReviewedKeywordRow>;
    const id = String(candidate?.id || '');
    const category = String(candidate?.category || '');
    const producible = String(candidate?.producible || '');
    if (!expected.has(id) || seen.has(id)) throw new SyntaxError('模型返回了未知或重复的行 ID');
    if (!(mode === 'video' ? VIDEO_CATEGORY_SET : CATEGORY_SET).has(category)) throw new SyntaxError(`模型返回了非法垂类：${category || '空值'}`);
    if (producible !== '制作' && producible !== '不制作') throw new SyntaxError('模型返回了非法制作结论');
    const lowValue = candidate?.lowValue;
    if (mode === 'video' && lowValue !== '是' && lowValue !== '否') throw new SyntaxError('视频审核结果缺少低价值标记');
    if (mode === 'video' && lowValue === '是' && producible !== '不制作') throw new SyntaxError('低价值关键词不能标为制作');
    seen.add(id);
    const nextProducible = producible as KeywordReviewResult['producible'];
    let rejectReason: string;
    try {
      rejectReason = normalizeRejectReason(nextProducible, candidate?.rejectReason);
    } catch (error) {
      const message = error instanceof Error ? error.message : '不制作依据格式异常';
      throw new SyntaxError(`模型返回的「${expected.get(id)?.query.slice(0, 40)}」：${message}`);
    }
    results.push({
      id,
      category,
      producible: nextProducible,
      categoryReason: normalizeCategoryReason(candidate?.categoryReason),
      rejectReason,
      ...(mode === 'video' ? { lowValue } : {}),
      needsLookup: candidate?.needsLookup === true,
    });
  }
  if (seen.size !== rows.length) throw new SyntaxError(`模型结果不完整：应有 ${rows.length} 条，实际 ${seen.size} 条`);
  const byId = new Map(results.map((item) => [item.id, item]));
  return rows.map((row) => byId.get(row.id) as ReviewedKeywordRow);
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
  ruleEntries?: KeywordReviewRuleEntry[];
  rulesVersion?: number;
  reviewMode?: KeywordReviewMode;
}): Promise<{ results: KeywordReviewResult[]; usage?: Record<string, number>; lookedUp: number }> {
  const mode = options.reviewMode || 'image';
  const additions = formatKeywordReviewRuleAdditions(ruleEntriesForMode(options.ruleEntries || [], mode));
  const response = await gatewayFetch(`${normalizeGatewayBaseUrl(options.baseUrl)}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify({
      model: options.model,
      temperature: 0.1,
      max_tokens: KEYWORD_REVIEW_MAX_TOKENS,
      ...(options.provider !== 'gateway' ? { thinking: { type: 'disabled' }, reasoning_effort: 'none' } : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${mode === 'video' ? buildVideoReviewPrompt() : buildSystemPrompt()}${additions}` },
        { role: 'user', content: `请审核以下行：\n${JSON.stringify(options.rows)}` },
      ],
    }),
    signal: AbortSignal.timeout(10 * 60_000 + 30_000),
  });
  if (!response.ok) throw await deepSeekResponseError(response, options.provider === 'gateway' ? '模型网关' : 'DeepSeek');
  const data = await response.json();
  // Record provider usage before validating the answer: malformed output can
  // still be billed, and successful-only accounting hides that expense.
  console.info('[KeywordReviewUsage]', JSON.stringify({
    providerRequestId: typeof data.id === 'string' ? data.id : undefined,
    model: options.model,
    reviewMode: mode,
    rowCount: options.rows.length,
    usage: data.usage || null,
  }));
  const finishReason = String(data.choices?.[0]?.finish_reason || '');
  if (finishReason === 'length') {
    throw new SyntaxError(`关键词审核模型 ${options.model} 输出被截断，本批结果未写入`);
  }
  const raw = data.choices?.[0]?.message?.content;
  if (typeof raw !== 'string' || !raw.trim()) throw new Error(`关键词审核模型 ${options.model} 没有返回内容`);
  let parsed: unknown;
  try {
    parsed = parseModelJson(raw);
  } catch {
    throw new SyntaxError(`关键词审核模型 ${options.model} 返回了不完整 JSON，本批结果未写入`);
  }
  const firstPass = validateResults(parsed, options.rows, mode);
  if (!options.lookup) {
    return { results: stripLookupFlag(firstPass), usage: data.usage, lookedUp: 0 };
  }
  try {
    const looked = await lookupUncertainCategories({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: options.model,
      rows: options.rows,
      results: firstPass,
      allowed: mode === 'video' ? VIDEO_CATEGORY_SET : CATEGORY_SET,
      categories: mode === 'video' ? [...VIDEO_CATEGORY_SET] : KEYWORD_REVIEW_CATEGORIES,
      rulesVersion: mode === 'video' ? -(options.rulesVersion ?? 0) - 1 : options.rulesVersion,
      ruleAdditions: additions,
    });
    return { results: looked.results, usage: data.usage, lookedUp: looked.lookedUp };
  } catch {
    return { results: stripLookupFlag(firstPass), usage: data.usage, lookedUp: 0 };
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
