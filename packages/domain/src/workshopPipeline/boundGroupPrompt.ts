import { sourcePromptSection, type FilledShotSlot } from './storyboardSlots';

/** Compile the resolved binding once, without applying generic portrait/jewelry templates. */
export function buildBoundGroupPrompt(slot: FilledShotSlot, productTitle: string) {
  const handOnly = slot.shotType === 'hand_held_only';
  const hasHuman = !handOnly && slot.hasHuman;
  const persona = hasHuman ? slot.persona?.reversePrompt || slot.persona?.description
    || sourcePromptSection(slot.sourcePrompt, '发型与面部') : '';
  const outfit = hasHuman ? slot.outfit?.reversePrompt
    || [slot.outfit?.top, slot.outfit?.bottom, slot.outfit?.shoes].filter(Boolean).join('；') : '';
  const subjectRule = handOnly
    ? '仅商品与必要手部出镜，保留母本握持关系；不出现人脸、全身人像，不额外添加人物与穿搭'
    : hasHuman ? '保持本镜的人物出镜范围、人数和裁切关系，不扩展为额外人物或全身远景'
      : '纯商品静物，不添加人物、人脸、肢体或手部';
  return [
    `【商品】${productTitle || '当前商品'}；商品身份、型号、颜色、外观及文字全部以 @图片1 为准。母本中的旧商品不可复用。`,
    `【出镜规则】${subjectRule}`,
    persona && `【人物】${persona}`,
    outfit && `【穿搭】${outfit}`,
    slot.scene && `【场景结构】${slot.scene}`,
    slot.action && `【动作或摆放】${slot.action}`,
    [slot.camera, slot.angle, slot.optics].filter(Boolean).length > 0
      && `【构图镜头】${[slot.camera, slot.angle, slot.optics].filter(Boolean).join('；')}`,
    slot.lighting && `【光影】${slot.lighting}`,
    slot.productSentence && `【商品接触与受光】${slot.productSentence}`,
    '【执行约束】保留上述镜头顺序、主体占比、机位、动作及空间关系；商品与环境形成真实接触阴影，不新增母本未要求的道具。',
  ].filter(Boolean).join('\n');
}
