export interface SalesActionEvidenceBeat {
  index: number;
  subject?: string;
  action: string;
  expression?: string;
  transition?: string;
  detailReference?: boolean;
}

interface SalesActionEvidenceInput {
  productName: string;
  /** Original collected/OCR facts only; generated summaries and copy are not evidence. */
  productFacts?: string;
  beats: readonly SalesActionEvidenceBeat[];
  sceneSpatialType?: string;
}

const factClauses = (text: string) => text.split(/[\n。！？!?；;，,]/).map((clause) => clause.trim()).filter(Boolean);
const uncertainFact = /原片|原款|旧款|参考|示例|其他商品|不得|不要|禁止|是否|待确认|未知|未核实|未确认|无法确认|不能确认|未见|不确定|可选|选配|可搭配|可加配|可加购|另购|另售|需单独购买/;
const partModifiers = '(?:(?:独立|不可拆卸|不可拆|可拆卸|可拆|拆卸式|摇粒绒|网布|固定|保暖|配套|单独|加厚|抓绒|该|此|本|的|一件|一层|一套)*)';

/** A prohibition is not an instruction to render or manipulate the prohibited part. */
function affirmativeMentions(text: string, part: string) {
  return factClauses(text).flatMap((clause) => [...clause.matchAll(new RegExp(part, 'g'))].flatMap((match) => {
    const before = clause.slice(0, match.index), after = clause.slice(match.index! + part.length);
    const prohibited = /(?:不|不要|不得|不能|不应|不可|不许|不允许|严禁|禁止|避免|无需|不再|不用|不必)(?:再|额外|自行|新增|自动|擅自|去)*(?:展示|生成|补造|补出|虚构|新增|出现|渲染|引入|画出|添加|使用|有)(?:任何|该|这个|一个|新的?|额外的?|未确认的?|独立的?|可拆卸的?|可拆的?|的)*$/.test(before)
      || /(?:不|不要|不得|不应|不许|严禁|禁止|避免|无需|不再|不用|不必)(?:再|自行|擅自)*(?:拆下|取下|拆卸|拆开|拆掉|拆出|卸下|拆)(?:该|这个|独立的?|的)*$/.test(before)
      || /(?:不|不要|不得|避免|禁止)把[^，。；;]{0,10}(?:当作|当成|视作|变成|替代|误当|当)$/.test(before)
      || new RegExp(`(?:没有|不含|不带|不存在|无)${partModifiers}$`).test(before)
      || /^(?:不展示|不生成|不出现|无需展示|不得展示)/.test(after);
    return prohibited ? [] : [{ before, after }];
  }));
}

function removesPart(text: string, part: string): boolean {
  return affirmativeMentions(text, part).some(({ before, after }) =>
    new RegExp(`(?<![不可])(?:拆下|拆卸|拆开|拆掉|拆出|取下|卸下|拆)${partModifiers}$`).test(before)
    || new RegExp(`(?<!不)(?:可拆卸|可拆)${partModifiers}$`).test(before)
    || /^[：:\s]*(?:(?:从(?:衣身|外壳|衣服)上)?(?:拆下|拆卸|拆开|拆掉|拆出|取下|卸下)|可拆卸|可拆)/.test(after));
}

function detachableEvidence(text: string, part: string): boolean {
  let present = false;
  for (const clause of factClauses(text)) {
    if (uncertainFact.test(clause)) continue;
    for (const { before, after } of affirmativeMentions(clause, part)) {
      if (new RegExp(`(?:不可拆卸|不可拆|不能拆卸|不能拆|不支持拆卸|不支持拆|无法拆卸|无法拆|固定)${partModifiers}$`).test(before)
        || /^[：:\s]*(?:为|是)?(?:不可拆|不能拆|不支持拆|无法拆|固定)/.test(after)) return false;
      if (new RegExp(`(?:可拆卸|可拆|能拆|拆卸式)${partModifiers}$`).test(before)
        || /^[：:\s]*(?:为|是)?(?:可拆卸|可拆|能拆|支持拆卸)/.test(after)) present = true;
    }
  }
  return present;
}

function partEvidence(text: string, part: string): 'present' | 'absent' | 'unknown' {
  let present = false;
  for (const rawClause of factClauses(text)) {
    const clause = rawClause.replace(/衬里|里布|里料/g, '内衬');
    if (!clause.includes(part) || uncertainFact.test(clause)) continue;
    const before = clause.slice(0, clause.indexOf(part));
    const after = clause.slice(clause.indexOf(part) + part.length);
    const assertion = before.replace(/有无$/, '');
    if (new RegExp(`(?:没有|不含|不带|不配|未配|未含|未提供|不提供|不支持|不包括|不附带|不具备|不包含|不自带|不设|无)${partModifiers}$`).test(assertion)
      || /^[：:=＝\s]*(?:无|否|false|none|null|空|没有|不含|不带|未配|未提供|不存在|缺失|不包含)/i.test(after)) return 'absent';
    if (/待|需(?:要)?核对|以.*为准/.test(after)) continue;
    if (new RegExp(`(?:带|含|配有|配备|有|采用|搭载|附带|内置|附送)${partModifiers}$`).test(assertion)
      || /^[：:\s]*(?:有|是|为|true|采用|材质|颜色|成分|面料|固定|可拆|不可拆|连接|厚度)/i.test(after)
      || new RegExp(`(?:可拆卸|可拆|不可拆卸|不可拆|固定)${partModifiers}$`).test(assertion)
      || /^[：:=＝]\s*(?!(?:空|无|不|未|待|否|false|none|null|详见|咨询|请|以))\S+/i.test(after)
      || /(?:摇粒绒|绒|网布|聚酯|涤纶|棉)[^，。；;]{0,3}$/.test(assertion)) present = true;
  }
  return present ? 'present' : 'unknown';
}

function singleShell(text: string): boolean {
  return factClauses(text).some((clause) => !uncertainFact.test(clause)
    && !/(?:不是|并非|非|不属于)[^，。；;]{0,5}(?:单冲|单层|仅.*外壳)/.test(clause)
    && /单冲|单层(?:外壳|冲锋衣)|仅(?:有|含|为|售)?(?:外壳|单外套)/.test(clause));
}

/** Reject unsupported performance facts without rewriting the user's actions or creative rules. */
export function salesActionEvidenceError(input: SalesActionEvidenceInput): string {
  const evidence = `${input.productName}\n${input.productFacts || ''}`;
  for (const beat of input.beats) {
    const prefix = `第 ${beat.index + 1} 段`;
    const text = resolveSalesProductSlots([beat.subject, beat.action, beat.expression, beat.transition].filter(Boolean).join('；')).replace(/衬里|里布|里料/g, '内衬');
    if (affirmativeMentions(text, '内部配件').length) return `${prefix}的「内部配件」未绑定到当前商品的明确部件。请核对原始商品资料并明确接触对象；原动作已保留。`;
    const parts = [...new Set(text.match(/领口|衣领|袖口|下摆|衣襟|门襟|前襟|拉链|口袋|内胆|内衬|接口|包边/g) || [])]
      .filter((part) => affirmativeMentions(text, part).length);
    const genericPart = ['商品细节部位', '该部位'].find((part) => affirmativeMentions(text, part).length);
    if (genericPart && parts.length !== 1) return `${prefix}的「${genericPart}」未明确接触对象。请在本段注明当前商品的具体部位；原动作已保留。`;
    for (const part of ['内胆', '内衬']) {
      if (!affirmativeMentions(text, part).length) continue;
      const status = partEvidence(evidence, part);
      if (status === 'absent' || (part === '内胆' && singleShell(evidence))) {
        return `${prefix}要求展示「${part}」，与当前商品原始资料${part === '内胆' && singleShell(evidence) ? '中的单冲/单层外壳配置' : `中不含${part}的说明`}冲突。请核对当前款式和本段动作；原动作已保留。`;
      }
      if (status !== 'present') return `${prefix}要求展示「${part}」，但当前商品名称和原始资料未确认该部件；内搭、生成文案和其他部件不能作为依据。请补充当前款式资料或明确本段实际接触对象。`;
      if (removesPart(text, part) && !detachableEvidence(evidence.replace(/衬里|里布|里料/g, '内衬'), part)) {
        return `${prefix}要求拆卸${part}，但原始商品资料未确认${part}可拆卸。请核对连接结构和本段动作。`;
      }
      if (!beat.detailReference) return `${prefix}要展示「${part}」，请补充能看清该部件及连接关系的商品细节图，将图片视角标为「细节」，并重新绑定到本段；上身主图不能代替。`;
    }
    const indoor = /indoor|studio|室内|影棚/.test(input.sceneSpatialType || '');
    const outdoor = /outdoor|户外|室外/.test(input.sceneSpatialType || '');
    const sceneText = text.split(input.productName).join('当前商品');
    const conflict = indoor ? sceneText.match(/(?:户外|室外)(?!款|外套|冲锋衣|防风|防水|防泼水|防寒|运动|活动|穿搭|用品|装备|商品|品牌)|城市街头|街头(?!风|感)|露天|天幕/)
      : outdoor ? sceneText.match(/室内(?!拖鞋|鞋|运动|穿搭|服装|用品|商品)|屋内|房间内/) : null;
    if (conflict) return `${prefix}仍描述「${conflict[0]}」，与当前${indoor ? '室内' : '室外'}场景冲突。请明确当前主体与场景关系后再生成；原动作已保留。`;
  }
  return '';
}
import { resolveSalesProductSlots } from './promptInputs';

