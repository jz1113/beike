import { appearanceAudience, audienceLabel } from '../../assets/appearanceAudience';
import { sourcePromptSection, type FilledShotSlot } from './storyboardSlots';
import { appendFidelityGuidance } from '../../prompts/prompt-engine/fidelity';
import { isPhoneProduct } from '../../products/phoneProductPolicy';
import { extractTemplatePhoneScreenStyle } from '../../products/phoneScreenStyle';

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
  const phoneProduct = isPhoneProduct(productTitle);
  const templateScreenStyle = phoneProduct
    ? extractTemplatePhoneScreenStyle(slot.sourcePrompt) || extractTemplatePhoneScreenStyle(slot.action)
    : null;
  const screenObservation = phoneProduct
    ? ['主体', '穿搭或物体细节', '屏幕'].map((heading) => sourcePromptSection(slot.sourcePrompt, heading)).concat(slot.action).join('；')
    : '';
  const templateScreenOff = /(?:屏幕|屏显|显示屏)[^。；]{0,16}(?:熄屏|息屏|黑屏|未点亮|关闭状态)|(?:熄屏|息屏|黑屏)[^。；]{0,8}(?:屏幕|手机)/.test(screenObservation);
  const screenRule = phoneProduct
    ? templateScreenStyle
      ? `【屏显画面】仅在本镜露出手机正面亮屏时，沿用选中母本本镜屏幕的画面主题、主色调和光感：${templateScreenStyle}。在目标手机有效显示区内重新设计清晰自然的高审美画面；不照搬母本旧手机的具体 UI、数字、文字或截图，也不复制 @图片1 商品垫图中的假屏显。屏幕透视、亮度与环境反光真实，不因屏显规则改变原镜头的正背面视角。`
      : templateScreenOff
        ? '【屏显画面】母本本镜的手机屏幕为熄屏；保持自然熄屏和真实环境反光，不照搬 @图片1 商品垫图中的假 UI，也不为展示壁纸擅自翻转手机。'
      : '【屏显画面】本镜若无正面亮屏则保持原镜头状态；若正面亮屏可见而母本无可靠屏显主题，使用与场景和机身协调的简洁无字壁纸或自然熄屏，不复制 @图片1 商品垫图的假 UI、乱码和广告，不因屏显规则改变镜头视角。'
    : '';
  const subjectRule = handOnly
    ? '仅商品与必要手部出镜，保留母本握持关系；不出现人脸、全身人像，不额外添加人物与穿搭'
    : hasHuman ? '保持本镜的人物出镜范围、人数和裁切关系，不扩展为额外人物或全身远景'
      : '纯商品静物，不添加人物、人脸、肢体或手部';
  const prompt = [
    phoneProduct
      ? `【商品】${productTitle || '当前商品'}；机身身份、型号、颜色、结构及可验证标识以 @图片1 为准，屏幕画面另按本镜屏显规则。母本中的旧手机外观不可复用。`
      : `【商品】${productTitle || '当前商品'}；商品身份、型号、颜色、外观及文字全部以 @图片1 为准。母本中的旧商品不可复用。`,
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
    screenRule,
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
