import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import type { SkillItem } from './skillTypes';

export interface CreationSkillSlot {
  id: string;
  label: string;
  defaultValue: string;
  placeholder: string;
  hint: string;
  kind: 'text' | 'select';
  options?: string[];
  buildInstruction: (value: string) => string;
}

export interface CreationSkillModifiableSummary {
  /** 左侧虚线上传卡片标题（对应图4，如：改状元姓名给强指令） */
  uploadSlotLabel: string;
  /** 输入框引导提示文案 */
  composerPlaceholder: string;
  /** 可修改的参数槽位列表 */
  slots: CreationSkillSlot[];
}

function extractDefaultFromText(text: string): string | null {
  const match = text.match(/[（(]默认[：:]\s*([^）)\s,，。]+)[）)]/);
  return match?.[1]?.trim() || null;
}

function isFirstPersonScholarSkill(idOrTitle: string, prompt: string): boolean {
  return (
    idOrTitle.includes('creation-first-person-scholar') ||
    idOrTitle.includes('金榜题名') ||
    idOrTitle.includes('金榜提名') ||
    (prompt.includes('丁显') && prompt.includes('状元'))
  );
}

/**
 * 解析创作技能在使用时可供用户修改的参数槽位与上传引导。
 */
export function resolveCreationSkillModifiableSummary(
  source: Pick<SkillItem, 'id' | 'title' | 'description' | 'prompt' | 'promptGuide' | 'assetGuide'> | AssistantSkill,
): CreationSkillModifiableSummary {
  const id = source.id || '';
  const title = 'title' in source ? source.title : (source.displayName || source.name);
  const description = source.description || '';
  const prompt = ('prompt' in source && source.prompt) || '';
  const promptGuide = 'title' in source ? (source.promptGuide || '') : (source.meta?.promptGuide || '');
  const assetGuide = 'title' in source ? (source.assetGuide || '') : (source.meta?.assetGuide || '');

  if (isFirstPersonScholarSkill(`${id} ${title}`, prompt)) {
    const defaultName = extractDefaultFromText(description) || '丁显';
    return {
      uploadSlotLabel: assetGuide || '改状元姓名给强指令',
      composerPlaceholder: `可直接输入要修改的状元姓名（默认：${defaultName}）、垫图参考要求或补充强指令…`,
      slots: [
        {
          id: 'protagonistName',
          label: '状元姓名',
          defaultValue: defaultName,
          placeholder: `默认：${defaultName}（输入新姓名生成强指令）`,
          hint: '自动生成全局强指令，同步替换金榜唱名、路人回头议论、官绅递名帖与殿试宣读台词',
          kind: 'text',
          buildInstruction: (value: string) =>
            `【强指令·修改状元姓名】将脚本中所有主角状元姓名“${defaultName}”全部替换为“${value}”（含金榜唱名“一甲第一名——${value}！”、路人议论“${value}？”、官绅称呼、礼官宣读“新科进士${value}——上前”及殿试诏书“今科殿试——${value}”），全程严格执行新姓名！`,
        },
        {
          id: 'costumeStyle',
          label: '朝代与官服',
          defaultValue: '灰青士子服 → 深朱砂红状元袍',
          placeholder: '选择或输入官服制式',
          hint: 'VIDEO 01 保持士子服，VIDEO 02 御前钦点后由内侍真实披上状元红袍',
          kind: 'select',
          options: [
            '灰青士子服 → 深朱砂红状元袍',
            '宋制青衫 → 宋制朱红官袍配长翅乌纱帽',
            '明制蓝衫 → 明制大红状元吉服配乌纱展翅帽',
            '唐制素色圆领衫 → 唐制绯红进士官袍',
          ],
          buildInstruction: (value: string) =>
            `【强指令·服饰与朝代】服饰形制设定为“${value}”，保留真实织物纹理与穿脱垂坠感。`,
        },
        {
          id: 'audioStyle',
          label: '声音与配乐',
          defaultValue: '无配乐 · 纯真实同期声',
          placeholder: '选择声音氛围设定',
          hint: '控制唱名、马蹄、礼鼓、诏书同期声与配乐比例',
          kind: 'select',
          options: [
            '无配乐 · 纯真实同期声',
            '极低音量古代雅乐/礼乐铺底（不盖台词与同期声）',
            '强化皇城礼鼓共鸣与大殿空间回响',
          ],
          buildInstruction: (value: string) =>
            `【强指令·声音设计】声音氛围采用“${value}”，确保唱名、马蹄、诏书与礼鼓层次清晰。`,
        },
        {
          id: 'sceneOverride',
          label: '自定义强指令',
          defaultValue: '',
          placeholder: '补充画面细节、天气光线或台词微调…',
          hint: '作为附加高优先级创作要求注入本次生成',
          kind: 'text',
          buildInstruction: (value: string) => `【强指令·画面微调】${value.replace(/[！。；]+$/, '')}。`,
        },
      ],
    };
  }

  const detectedDefault = extractDefaultFromText(`${description} ${promptGuide}`);
  const slots: CreationSkillSlot[] = [];
  if (detectedDefault) {
    slots.push({
      id: 'primarySubject',
      label: '核心替换项',
      defaultValue: detectedDefault,
      placeholder: `默认：${detectedDefault}（输入替换内容）`,
      hint: `将模板中的默认设定“${detectedDefault}”替换为你指定的新内容`,
      kind: 'text',
      buildInstruction: (value: string) =>
        `【强指令·核心替换】将技能模板中的默认“${detectedDefault}”全部替换为“${value}”，所有关联场景与台词同步生效。`,
    });
  } else {
    slots.push({
      id: 'primarySubject',
      label: '主体/角色替换',
      defaultValue: '保持模板默认主体',
      placeholder: '输入要替换的主角、商品或核心主体…',
      hint: promptGuide || '替换模板中的核心人物、商品或视觉主体',
      kind: 'text',
      buildInstruction: (value: string) => `【强指令·主体替换】本次创作核心主体设定为：${value}。`,
    });
  }

  slots.push({
    id: 'sceneOverride',
    label: '场景与细节微调',
    defaultValue: '',
    placeholder: promptGuide || '补充场景氛围、镜头节奏或台词改写要求…',
    hint: '补充需要改写的分镜细节、风格约束或台词文案',
    kind: 'text',
    buildInstruction: (value: string) => `【强指令·细节改写】${value.replace(/[！。；]+$/, '')}。`,
  });

  return {
    uploadSlotLabel: assetGuide || '上传参考垫图',
    composerPlaceholder: promptGuide
      ? `${promptGuide}（可在上方速改可修改项或左侧上传垫图）`
      : `围绕「${title}」输入要替换的主体、场景或微调要求…`,
    slots,
  };
}

/**
 * 将用户在可修改槽位中填写的内容合成为提示词中的强指令片段，并与现有输入融合。
 */
export function applyCreationSkillOverridesToPrompt(
  currentPrompt: string,
  skillTitle: string,
  overrides: Record<string, string>,
  slots: CreationSkillSlot[],
): string {
  const skillToken = `#[skill:${skillTitle}]`;
  const instructions: string[] = [];

  for (const slot of slots) {
    const raw = (overrides[slot.id] ?? '').trim();
    if (!raw || raw === slot.defaultValue) continue;
    instructions.push(slot.buildInstruction(raw));
  }

  const stripped = currentPrompt
    .replace(/#\[skill:[^\]]+\]\s*/gi, '')
    .replace(/【强指令·[^】]+】[^【\n]*?[！。；]\s*/g, '')
    .trim();

  const parts = [skillToken];
  if (instructions.length > 0) {
    parts.push(instructions.join(' '));
  }
  if (stripped) {
    parts.push(stripped);
  }
  return parts.join(' ').trim() + ' ';
}
