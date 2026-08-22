import {
  assembleOriginalShotPrompt,
  sanitizeLookPartsForProductRole,
  normalizeOriginalProductRole,
  ensureSocialPromptSlots,
  ensureOriginalPromptSlots,
  stripWorkshopPromptGuards,
  cleanPromptText,
  getPlainNegativePrompt,
  getDynamicNegativePrompt,
} from '../../src/lib/drawing';
import {
  resolveOriginalGenPhase,
  originalGenPhaseLabel,
} from '../../src/features/buyer-show/originalGenPhase';
import type { GenerationTask } from '../../src/types/app-store';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('OK:', msg);
  }
}

{
  const role = normalizeOriginalProductRole(undefined, '女装蓝色衬衫 服饰穿搭');
  assert(role === 'worn_apparel', 'fingerprint infers worn_apparel');
  const parts = sanitizeLookPartsForProductRole(
    { top: '白色T恤', bottom: '牛仔裤', accessory: '脖子佩戴商品' },
    '白色T恤·牛仔裤·简约鞋·脖子佩戴',
    role
  );
  assert(!/白色T恤/.test(parts.top || ''), 'sanitize strips invented top');
  assert(/@图片1/.test(parts.top || ''), 'top references @图片1');
  const prompt = assembleOriginalShotPrompt(
    {
      lookParts: parts,
      lookBible: parts.summary,
      productRole: role,
      productFingerprint: '蓝色牛津衬衫',
      masterScene: '咖啡馆窗边',
      identityBible: '年轻东亚模特',
    },
    { shot_no: 1, expression: '浅笑', action: '站立', has_human: true },
    { hasFace: false }
  );
  assert(!/白色T恤/.test(prompt), 'assembled prompt has no white tee');
  assert(/蓝色牛津衬衫/.test(prompt), 'fingerprint preserved in guards');
  assert(/原创穿搭守卫/.test(prompt) && /@图片1/.test(prompt), 'apparel look guard present');
}

{
  const role = normalizeOriginalProductRole('held_object', '手机数码');
  const parts = sanitizeLookPartsForProductRole({}, '', role);
  assert(!/脖子佩戴/.test(parts.accessory || ''), 'held_object no necklace default');
  assert(role === 'held_object', 'held_object role');
}

{
  const s = ensureSocialPromptSlots('以 @图片2 构图，主体 @图片1', {
    hasHuman: true,
    hasFace: true,
    socialMode: true,
  });
  assert(/@图片3/.test(s) || /身份/.test(s), 'social face guard still works');
}

{
  const base = {
    isBatchGenerating: false,
    sceneAnchorEnabled: true,
    modelPersona: '亚洲清纯甜美女生',
    anchorFaceImageUrl: undefined as string | undefined,
    isAnchorFaceConfirmed: false,
  };
  const idleTasks: GenerationTask[] = [
    {
      id: 'shot-0',
      title: '1',
      prompt: 'p',
      status: 'IDLE',
      useReferenceImage: true,
      progress: '0%',
      model: 'x',
      size: '1',
      quality: 'high',
      has_human: true,
      shot_type: 'model_shot',
    },
    {
      id: 'shot-1',
      title: '2',
      prompt: 'p',
      status: 'IDLE',
      useReferenceImage: true,
      progress: '0%',
      model: 'x',
      size: '1',
      quality: 'high',
      has_human: true,
      shot_type: 'model_shot',
    },
  ];
  assert(resolveOriginalGenPhase({ ...base, tasks: idleTasks }) === 'need_shot1', 'phase need_shot1');
  const shot1Done: GenerationTask[] = [
    { ...idleTasks[0], status: 'SUCCESS', resultUrl: 'http://x' },
    idleTasks[1],
  ];
  assert(resolveOriginalGenPhase({ ...base, tasks: shot1Done }) === 'need_face_confirm', 'phase need_face_confirm');
  assert(
    resolveOriginalGenPhase({ ...base, tasks: shot1Done, isAnchorFaceConfirmed: true }) === 'ready_batch',
    'phase ready_batch after face'
  );
  const allDone = shot1Done.map((t) => ({ ...t, status: 'SUCCESS' as const, resultUrl: 'http://x' }));
  assert(
    resolveOriginalGenPhase({ ...base, tasks: allDone, isAnchorFaceConfirmed: true }) === 'ready_export',
    'phase ready_export'
  );
  assert(originalGenPhaseLabel('need_shot1').includes('分镜 1'), 'label need_shot1');
}

{
  const userPrompt = '一只猫在窗边';
  const wrapped = ensureOriginalPromptSlots(userPrompt, {});
  assert(/原创跟品守卫/.test(wrapped), 'workshop wrap adds original guards');
  const plain = stripWorkshopPromptGuards(cleanPromptText(wrapped));
  assert(!/原创/.test(plain), 'strip removes workshop guards from plain prompt');
  assert(plain.includes('一只猫'), 'user text preserved after strip');
  const plainNeg = getDynamicNegativePrompt({ plainMode: true });
  assert(plainNeg === getPlainNegativePrompt(), 'plain mode uses short negative prompt');
  const workshopNeg = getDynamicNegativePrompt({ hasHuman: false, shotType: 'pure_product' });
  assert(workshopNeg.length > plainNeg.length, 'workshop negative longer than plain');
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke checks passed');
