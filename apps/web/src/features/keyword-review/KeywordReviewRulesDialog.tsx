import { BookOpen, X } from 'lucide-react';
import type { ReactNode } from 'react';

export const KEYWORD_REVIEW_CATEGORIES = [
  '政史军', '3C数码', '本地生活', '动漫', '动物', '法律', '购物消费', '互联网IT', '家居',
  '交通出行', '教育', '金融财经', '科学技术', '旅游', '美食', '美术', '民俗文化', '其他', '汽车',
  '情感', '求职招聘', '软件工具', '社会', '时尚', '体育', '小说', '星座', '医疗健康', '音乐', '影视',
  '游戏', '娱乐', '政策政务', '植物',
] as const;

const VERTICAL_BOUNDARIES = [
  '宠物疾病、用药、诊疗、疫苗、兽医干预 → 医疗健康；普通物种、行为、训练、喂养、宠物用品 → 动物。',
  'App、办公软件、设置、效率工具 → 软件工具；编程、开发、互联网产品、协议、网络技术 → 互联网IT。',
  '科学原理、自然科学、技术知识和科普 → 科学技术；教材型知识点、解题、学习方法 → 教育。',
  '政治、历史、军事 → 政史军；政策解读、政务办理、公共服务 → 政策政务。',
  '影视剧 → 影视；动画与二次元向内容 → 动漫；一般社会知识和现象 → 社会，时效敏感热点不制作。',
  '「其他」只能在核对 query、拓展词和内容类型后仍无法映射到允许垂类时使用。',
];

const VERTICAL_EXAMPLES = [
  { query: '游戏手机推荐', category: '3C数码', reason: '被选的是手机，不是游戏内容' },
  { query: '乌天狗的日本传说', category: '民俗文化', reason: '神话天狗，不是动物' },
  { query: '中华人民共和国教师法', category: '法律', reason: '法律条文，不是教学实践' },
  { query: '梦幻西游装备属性', category: '游戏', reason: '游戏内装备属性' },
  { query: '狗狗腹泻怎么用药', category: '医疗健康', reason: '宠物用药诊疗，不是日常饲养' },
  { query: '狗狗训练方法', category: '动物', reason: '行为训练，不是诊疗' },
];

const EXCLUSIONS = [
  '金融财经：股票、基金、理财、投资建议、涨跌预测、证券期货外汇加密货币等金融决策。',
  '医疗健康：人或宠物的诊断、症状、治疗、用药、剂量、医疗风险判断、兽医诊疗或健康干预。',
  '敏感社会热点：正在发酵的争议事件、舆论事件、突发案件或敏感时事评论。',
  '违法、色情、暴恐、涉毒、危险或反科学内容。',
  '算命迷信：八字、风水、占卜、运势预测、生肖运气、起名打分、改命改运。',
  '工业硬广：厂家排名、供应商推荐、工业采购推销，无法形成真实用户体验。',
  '非笔记需求：在线观看、下载资源、全文资源、破解软件、实时查询、纯工具操作，或必须依赖视频演示。',
  '红包礼金、人情随礼、灰色利益决策，没有客观标准。',
  '限制过细：尺寸、数量、年限、颜色、型号、狭窄地点等条件层层叠加，生产空间过窄。不要改写原词来挽救。',
];

const SIMPLE_QA = [
  '自然回答只是一个事实、固定数字、身份、日期、距离、价格、尺寸、颜色、规格，或一两句话讲完，没有经验、评测、对比、教程空间 → 不制作。',
  '例如：看八字一般多少钱、石家庄到大连开轿车来回多少公里、Python 的 len() 是什么、美国总统是谁、iPhone 15 多少钱、今天上海天气怎么样。',
  '出现时长或数字不等于简单问答。「花菜焯水多久好吃」可以讲方法和口感，可制作。',
];

const LOW_VALUE_YES = [
  '恋爱婚姻咨询或个人情感决策',
  '社交回复话术、聊天公式、人际措辞模板',
  '起名、名字打分、姓名吉凶',
  '红包礼金、人情随礼决策',
  '算命、风水、占卜、星座运势、生肖运气',
  '违法、危险、反科学、猎奇或无意义内容',
];

const LOW_VALUE_NO = [
  '个人梦境描述，如梦见前任和别人结婚、昨晚梦见蛇追我',
  '把解梦写成文化、心理或一般说明',
  '星座/星象知识科普；星座教育可制作，个人命运、财运、桃花、幸运色预测不可制作',
  '版权话题、游戏攻略、校园升学、旅游、公司评价',
];

interface Props {
  open: boolean;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{title}</h3>
      <div className="mt-2 space-y-1.5 text-[13px] leading-6 text-slate-600">{children}</div>
    </section>
  );
}

export function KeywordReviewRulesDialog({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="keyword-review-rules-title" className="flex max-h-[90vh] w-full max-w-[820px] flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)]" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 ring-1 ring-amber-100">
              <BookOpen className="h-4 w-4 text-amber-600" />
            </span>
            <div>
              <h2 id="keyword-review-rules-title" className="text-sm font-black tracking-tight">审核规则</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">完整口径。保留原表头；空的「实体拓展q」「分类」不进入结果表；审核列接在「下发时间」后面</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭审核规则" className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4 text-sm sm:px-6">
          <Section title="怎么读表">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>先只看 query 的主体、需求和场景；query 已经清晰时直接裁决。</li>
              <li>query 是简称、陌生实体、泛实体或多义词时，才用相关拓展 q 和实体拓展 q 消歧。</li>
              <li>仍不足时，才参考笔记内容类型。教程、攻略、推荐、价格、视频只是表达形式，不能抢占主体。</li>
              <li>源表「分类」列整列为空则不进入结果表；有内容才保留，且不当成最终垂类。</li>
            </ol>
          </Section>

          <Section title="允许垂类 · 34">
            <div className="flex flex-wrap gap-1.5">
              {KEYWORD_REVIEW_CATEGORIES.map((category) => (
                <span key={category} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{category}</span>
              ))}
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              {VERTICAL_BOUNDARIES.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-bold">Query</th>
                    <th className="px-3 py-2 font-bold">最终垂类</th>
                    <th className="px-3 py-2 font-bold">垂类依据</th>
                  </tr>
                </thead>
                <tbody>
                  {VERTICAL_EXAMPLES.map((row) => (
                    <tr key={row.query} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-800">{row.query}</td>
                      <td className="px-3 py-2 font-bold text-slate-700">{row.category}</td>
                      <td className="px-3 py-2 text-slate-500">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="不制作">
            <p>垂类定完后再独立判断。命中任一条都填「不制作」，不要改写原词来挽救：</p>
            <ol className="list-decimal space-y-1.5 pl-5">
              {EXCLUSIONS.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </Section>

          <Section title="简单问答">
            <ul className="list-disc space-y-1.5 pl-5">
              {SIMPLE_QA.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </Section>

          <Section title="低价值">
            <p>命中后填「不制作」。以下算低价值：</p>
            <ul className="list-disc space-y-1.5 pl-5">
              {LOW_VALUE_YES.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="pt-1">不能只因为话题像这些就标低价值：</p>
            <ul className="list-disc space-y-1.5 pl-5">
              {LOW_VALUE_NO.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </Section>

          <Section title="无方向泛实体">
            <p>光秃秃的产品、机构、概念、地点、作品或工具，没有明确问题或生产方向时，只要不触碰上面的否决，仍填「制作」。原 query 不改写。当前表不写强需生产方向。</p>
            <p>例如：U 盘、杭州电子科技大学、猫砂，都可以制作。</p>
          </Section>

          <Section title="判断依据">
            <p>两列都只写决定性事实，不复述 query，不写空话。制作行的「不制作依据」留空。</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>垂类依据：每行必填。句式是「认出来的主体，为什么落在这个垂类」。相邻类易混时点出排除项。</li>
              <li>不制作依据：仅「不制作」填写。句式是「否决类型：这一行命中的点」。否决类型只用：简单问答、低价值、金融决策、医疗诊疗、敏感热点、违法危险、算命迷信、工业硬广、非笔记需求、限制过细。</li>
            </ul>
            <p>例如：美国总统是谁 → 简单问答：只确认一个身份；怎么判断他对我有好感 → 低价值：个人恋爱好感判断；怎么在淘宝上添加银行卡 → 非笔记需求：平台绑卡操作。</p>
          </Section>
        </div>
      </section>
    </div>
  );
}
