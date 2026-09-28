import { appearanceAudience, audienceLabel } from '../../assets/appearanceAudience';
import { sourcePromptSection, type FilledShotSlot } from './storyboardSlots';
import { appendFidelityGuidance } from '../../prompts/prompt-engine/fidelity';

/** Explicit replacements win; otherwise preserve per-shot details before group summaries. */
export function resolveBoundGroupAppearance(slot: FilledShotSlot) {
  const personaAsset = slot.persona?.reversePrompt || slot.persona?.description || slot.persona?.name || '';
  const outfitAsset = slot.outfit?.reversePrompt
    || [slot.outfit?.top, slot.outfit?.bottom, slot.outfit?.shoes].filter(Boolean).join('；')
    || slot.outfit?.title || '';
  const portrait = slot.hasHuman && slot.shotType !== 'hand_held_only' && slot.shotType !== 'pure_product';
  return {
    persona: !portrait ? '' : slot.persona?.id ? personaAsset
      : sourcePromptSection(slot.sourcePrompt, '人物') || sourcePromptSection(slot.sourcePrompt, '发型与面部') || personaAsset,
    outfit: !portrait ? '' : slot.outfit?.id ? outfitAsset
      : sourcePromptSection(slot.sourcePrompt, '穿搭') || sourcePromptSection(slot.sourcePrompt, '服装与配饰') || outfitAsset,
  };
}

/** Compile the resolved binding once, without applying generic portrait/jewelry templates. */
export function buildBoundGroupPrompt(slot: FilledShotSlot, productTitle: string) {
  const handOnly = slot.shotType === 'hand_held_only';
  const hasHuman = !handOnly && slot.hasHuman;
  const { persona, outfit } = resolveBoundGroupAppearance(slot);
  const subjectRule = handOnly
    ? '仅商品与必要手部出镜，保留母本握持关系；不出现人脸、全身人像，不额外添加人物与穿搭'
    : hasHuman ? '保持本镜的人物出镜范围、人数和裁切关系，不扩展为额外人物或全身远景'
      : '纯商品静物，不添加人物、人脸、肢体或手部';
  const prompt = [
    `【商品】${productTitle || '当前商品'}；商品身份、型号、颜色、外观及文字全部以 @图片1 为准。母本中的旧商品不可复用。`,
    `【出镜规则】${subjectRule}`,
    persona && `【人物】${persona}`,
    hasHuman && slot.persona && appearanceAudience({ ...slot.persona }) !== 'unknown' && `【人群约束】${audienceLabel({ ...slot.persona })}，男性仅配男装或通用款，女性可配男装、女装或通用款；年龄段必须一致，全组保持所选人物与穿搭。`,
    outfit && `【穿搭】${outfit}`,
    slot.scene && `【场景结构】${slot.scene}`,
    slot.action && `【动作或摆放】${slot.action}`,
    [slot.camera, slot.angle, slot.optics].filter(Boolean).length > 0
      && `【构图镜头】${[slot.camera, slot.angle, slot.optics].filter(Boolean).join('；')}`,
    slot.lighting && `【光影】${slot.lighting}`,
    slot.productSentence && `【商品接触与受光】${slot.productSentence}`,
    '【执行约束】保留上述镜头顺序、主体占比、机位、动作及空间关系；商品与环境形成真实接触阴影，不新增母本未要求的道具。',
  ].filter(Boolean).join('\n');
  return appendFidelityGuidance(prompt, {
    productFingerprint: productTitle,
    hasHuman,
  });
}

/** Grid and single-shot generation consume the exact same resolved shot bindings. */
export function buildBoundGroupGridPrompt(shots: Array<{ prompt: string; shot_no: number }>): string {
  if (shots.length !== 4 || shots.some(shot => !shot.prompt.trim())) {
    throw new Error('四宫格需要四个完整的已绑定分镜提示词');
  }
  const positions = ['左上格', '右上格', '左下格', '右下格'];
  return [
    '生成一张 2×2 四宫格摄影图片，四格等大、无边框、无分割线，不添加编号、字幕或水印。',
    '每格严格执行下方对应分镜。商品外观统一以 @图片1 为准；人物、穿搭、场景及出镜范围分别以各格描述为准。',
    '同一人物在多个镜头出镜时保持身份一致；不得将人物镜头的面部、服装或肢体添加到静物和仅手部镜头。',
    ...shots.map((shot,index) => `【${positions[index]}·分镜${shot.shot_no}】\n${shot.prompt}`),
  ].join('\n\n');
}
