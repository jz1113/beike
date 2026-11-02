import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate, type SalesMaterialCatalog } from '@shared/domain/sales';
import { salesMaterialCards } from './salesMaterialCatalog';
import { applyMaterialAction, buildSalesBeatActionReferences, reconcileSalesMaterialBindings } from './salesMaterial';
import { emptySalesProductionPlan, parseSalesProductionPlan, planForSelectedScript } from './salesProductionDraft';

const script = normalizeScriptTemplate({ title: '两段展示', durationSec: 6, shots: [{ start: 0, end: 6, beats: [
  { start: 0, end: 3, actionTemplate: '正面展示{{商品}}' }, { start: 3, end: 6, actionTemplate: '转身' },
] }] })!;
const action = { id: 'a', title: '细节展示', action: '用手轻触{{商品}}展示纹理', camera: '', shotType: '近景', tags: '', coverUrl: '' };

it('displays all asset types in natural ascending name order without changing the source catalog', () => {
  const numbers = [10, 2, 1];
  const catalog: SalesMaterialCatalog = {
    personas: [2, 1, 10].map((n) => ({ id: `p${n}`, name: `女${n}`, description: '', tags: '女', avatarUrl: '', fullBodyUrl: '', faceUrl: '', sourceImages: [], hasReferenceImage: false, source: 'persona_library' })),
    scenes: numbers.map((n) => ({ id: `s${n}`, title: `室内${n}`, description: '', lighting: '', category: '', spatialType: 'indoor_room', tags: '', suitableCategories: [], coverUrl: '', sourceImages: [], source: 'scene_library' })),
    actions: numbers.map((n) => ({ ...action, id: `a${n}`, title: String(n) })),
    voices: numbers.map((n) => ({ id: `v${n}`, name: `人声${n}`, voiceId: '', ttsVoice: '', gender: 'female', tags: [], sampleAudioUrl: '', promptText: '', source: 'voice_library' })),
    bgms: numbers.map((n) => ({ id: `b${n}`, title: `BGM${n}`, description: '', moodTags: [], bpm: 90, durationSec: 12, suitableCategories: [], license: '', audioUrl: '' })),
  };
  const cards = salesMaterialCards(catalog);
  expect(cards.filter((card) => card.kind === 'persona').map((card) => card.title)).toEqual(['女1', '女2', '女10']);
  expect(cards.filter((card) => card.kind === 'scene').map((card) => card.title)).toEqual(['室内1', '室内2', '室内10']);
  expect(cards.filter((card) => card.kind === 'action').map((card) => card.title)).toEqual(['1', '2', '10']);
  expect(cards.filter((card) => card.soundType === 'voice').map((card) => card.title)).toEqual(['人声1', '人声2', '人声10']);
  expect(cards.filter((card) => card.soundType === 'bgm').map((card) => card.title)).toEqual(['BGM1', 'BGM2', 'BGM10']);
  expect(catalog.scenes.map((scene) => scene.title)).toEqual(['室内10', '室内2', '室内1']);
  expect(catalog.personas.map((persona) => persona.name)).toEqual(['女2', '女1', '女10']);
});

describe('reusable material action', () => {
  it('replaces only the target action, retaining edited narration and other beats', () => {
    const plan = { ...emptySalesProductionPlan(), customPrompt: '旧提示词', adaptedBeats: [
      { index: 1, subject: '手部', action: '原动作', spokenLine: '已核对的台词', subtitle: '已核对' },
    ] };
    const result = applyMaterialAction(script, plan, action, 1);
    expect(result.adaptedBeats?.[0].action).toBe('正面展示{{商品}}');
    expect(result.adaptedBeats?.[1]).toEqual({ index: 1, subject: '手部', action: action.action, spokenLine: '已核对的台词', subtitle: '已核对' });
    expect(result.customPrompt).toBe('');
    expect(parseSalesProductionPlan({ ...plan, ...result }).adaptedBeats).toEqual(result.adaptedBeats);
  });
  it('does not overwrite the plan for an invalid beat or empty action', () => {
    expect(applyMaterialAction(script, emptySalesProductionPlan(), action, 99)).toEqual({});
    expect(applyMaterialAction(script, emptySalesProductionPlan(), { ...action, action: '' }, 0)).toEqual({});
  });
});

it('retains chosen material bindings when switching scripts and clears old content and outputs', () => {
  const plan = { ...emptySalesProductionPlan(), scriptId: 'old', personaId: 'persona', sceneId: 'scene', voiceId: 'voice',
    customPersonaBodyUrl: '/body.jpg', customBgmUrl: '/music.mp3', customPrompt: 'old', generatedVideoUrl: '/old.mp4',
    voiceoverAudioUrl: '/old.mp3', beatImageOverrides: { 0: '/old.jpg' } };
  const next = planForSelectedScript(plan, 'new');
  expect(next).toMatchObject({ scriptId: 'new', personaId: 'persona', sceneId: 'scene', voiceId: 'voice',
    customPersonaBodyUrl: '/body.jpg', customBgmUrl: '/music.mp3', customPrompt: '', generatedVideoUrl: '',
    voiceoverAudioUrl: '', beatImageOverrides: {} });
  expect(planForSelectedScript(next, 'new')).toBe(next);
});

it('clears removed material selections while preserving uploads, edits and generated media', () => {
  const plan = { ...emptySalesProductionPlan(), personaId: 'removed-persona', sceneId: 'removed-scene',
    voiceId: 'removed-voice', bgmId: 'removed-bgm', customPrompt: '旧素材提示词', customPersonaBodyUrl: '/body.jpg',
    customSceneImageUrl: '/scene.jpg', customBgmUrl: '/music.mp3', generatedVideoUrl: '/video.mp4',
    adaptedBeats: [{ index: 0, subject: '商品', action: '展示', spokenLine: '保留台词', subtitle: '' }] };
  const catalog = { personas: [], scenes: [], actions: [], voices: [], bgms: [] };
  const next = reconcileSalesMaterialBindings(plan, catalog);
  expect(next).toEqual({ ...plan, personaId: '', sceneId: '', voiceId: '', bgmId: '', customPrompt: '' });
  expect(reconcileSalesMaterialBindings(next, catalog)).toBe(next);
});

it('retains material selections that still exist in the workspace', () => {
  const plan = { ...emptySalesProductionPlan(), personaId: 'p', sceneId: 's', voiceId: 'v', bgmId: 'b' };
  const catalog = {
    personas: [{ id: 'p', name: '人物', description: '', tags: '', avatarUrl: '/face.jpg', fullBodyUrl: '/body.jpg',
      faceUrl: '/face.jpg', sourceImages: [], hasReferenceImage: true, source: 'persona_library' }],
    scenes: [{ id: 's', title: '场景', description: '', lighting: '', category: '', spatialType: '', tags: '',
      suitableCategories: [], coverUrl: '', sourceImages: [], source: 'scene_library' }],
    voices: [{ id: 'v', name: '音色', voiceId: 'custom', ttsVoice: 'custom', gender: '', tags: [],
      sampleAudioUrl: '', promptText: '', source: 'voice_library' }],
    bgms: [{ id: 'b', title: '配乐', description: '', moodTags: [], bpm: 90, durationSec: 12,
      suitableCategories: [], license: '', audioUrl: '/music.mp3' }], actions: [],
  };
  expect(reconcileSalesMaterialBindings(plan, catalog)).toBe(plan);
});

it('retains a missing selected scene so a refresh cannot silently choose a replacement', () => {
  const plan = { ...emptySalesProductionPlan(), sceneId: 'chosen-room' };
  expect(reconcileSalesMaterialBindings(plan, { personas: [], scenes: [], actions: [], voices: [], bgms: [] })).toBe(plan);
});

it('binds media-only depth actions, restores them from drafts and drops deleted asset IDs', () => {
  const plan = { ...emptySalesProductionPlan(), adaptedBeats: [{ index: 0, subject: '商品', action: '已改编动作', spokenLine: '保留台词', subtitle: '' }] };
  const depth = { ...action, action: '', mediaType: 'depth-video' as const, mediaUrl: '/depth.mp4', sourceUrl: '/original.mp4' };
  const next = { ...plan, ...applyMaterialAction(script, plan, depth, 0) };
  expect(next.adaptedBeats[0]).toEqual(plan.adaptedBeats[0]);
  expect(parseSalesProductionPlan(next).beatActionIds).toEqual({ 0: 'a' });
  expect(planForSelectedScript({ ...next, scriptId: 'old' }, 'new').beatActionIds).toEqual({});
  const catalog = { personas: [], scenes: [], actions: [depth], voices: [], bgms: [] };
  expect(reconcileSalesMaterialBindings(next, catalog)).toBe(next);
  expect(reconcileSalesMaterialBindings(next, { ...catalog, actions: [] }).beatActionIds).toEqual({});
});

it('maps bound beat action IDs to image or video prompt reference descriptors', () => {
  const refs = buildSalesBeatActionReferences(
    { 0: 'pose-img', 1: 'depth-vid', 2: 'missing' },
    [
      { ...action, id: 'pose-img', title: '自然站姿', coverUrl: '/pose-front.jpg', mediaUrl: '/pose-front.jpg', mediaType: 'image' },
      { ...action, id: 'depth-vid', title: '转身深度', coverUrl: '', mediaUrl: '/depth.mp4', mediaType: 'depth-video' },
    ],
  );
  expect(refs).toEqual({
    0: { url: '/pose-front.jpg', mediaType: 'image', label: '片段 1 动作参考（自然站姿）' },
    1: { url: '/depth.mp4', mediaType: 'video', label: '片段 2 动作参考（转身深度）' },
  });
});
