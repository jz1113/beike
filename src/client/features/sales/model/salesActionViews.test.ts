import { describe, expect, it } from 'vitest';
import type { SalesPersonaCandidate, SalesSceneCandidate } from '@shared/domain/sales';
import {
  classifyPersonaGroup,
  extractActionAngleEntries,
  PERSONA_CATEGORIES,
  personaGroupToDimensions,
  personaImageFields,
  readPersonaViews,
  readSceneViews,
  SCENE_VIEWS,
  sceneImageFields,
  type PersonaCategory,
} from './salesActionViews';
import { actionMedia, classifySceneSpace, salesMaterialCards } from './salesMaterialCatalog';

describe('sales multi-angle pose action views', () => {
  it('orders 5 pose camera angles consistently and marks the explicit default angle', () => {
    const dimensions = JSON.stringify({
      customMetadata: 'standing',
      defaultAngle: 'diagonal',
      actionViews: {
        low: '/pose/low.jpg',
        front: '/pose/front.jpg',
        diagonal: '/pose/diagonal.jpg',
        side: '/pose/side.jpg',
        high: '/pose/high.jpg',
      },
    });
    const entries = extractActionAngleEntries({
      dimensions,
      coverUrl: '/pose/diagonal.jpg',
      mediaUrl: '/pose/diagonal.jpg',
    });

    expect(entries.map((item) => item.angle)).toEqual(['front', 'diagonal', 'side', 'high', 'low']);
    expect(entries.map((item) => item.shortLabel)).toEqual(['正', '斜', '侧', '俯', '仰']);
    expect(entries.find((item) => item.isDefault)?.angle).toBe('diagonal');
  });

  it('falls back to sourceImages when actionViews metadata is absent', () => {
    const entries = extractActionAngleEntries({
      sourceImages: ['/a.jpg', '/b.jpg', '/c.jpg'],
      coverUrl: '/b.jpg',
    });

    expect(entries).toHaveLength(3);
    expect(entries[1]).toMatchObject({ url: '/b.jpg', isDefault: true });
    expect(extractActionAngleEntries({ sourceImages: ['/only-one.jpg'] })).toEqual([]);
  });
});

it.each(Object.keys(PERSONA_CATEGORIES) as PersonaCategory[])('keeps the selected gender and age for %s', (category) => {
  const dimensions = personaGroupToDimensions('{"hair":"short"}', category);
  expect(JSON.parse(dimensions).hair).toBe('short');
  expect(classifyPersonaGroup({ name: '', description: '', tags: '', dimensions })).toBe(category);
});

const persona = (patch: Partial<SalesPersonaCandidate>): SalesPersonaCandidate => ({
  id: 'p', name: '人物', description: '', tags: '', avatarUrl: '/face.jpg', faceUrl: '/face.jpg',
  fullBodyUrl: '/main.jpg', sourceImages: ['/main.jpg', '/face.jpg', '/extra.jpg'], hasReferenceImage: true, source: 'persona_library', ...patch,
});

describe('人物视角保存与旧资产兼容', () => {
  it('keeps unknown legacy images without guessing side or front views', () => {
    expect(readPersonaViews(persona({}))).toEqual({
      views: { ...readPersonaViews().views, main: '/main.jpg', face: '/face.jpg' }, extraImages: ['/extra.jpg'],
    });
    expect(readPersonaViews(persona({ sourceImages: ['/face.jpg'], fullBodyUrl: '/face.jpg' })).views)
      .toEqual({ ...readPersonaViews().views, main: '/face.jpg' });
  });
  it('round trips explicit views, audio selection and unrelated dimensions', () => {
    const views = { ...readPersonaViews().views, main: '/main.jpg', face: '/face2.jpg', side: '/side.jpg', front: '/front.jpg' };
    const fields = personaImageFields(views, ['/extra.jpg', '/main.jpg'], '{"hair":"short"}', 'male', 'voice-1');
    expect(JSON.parse(fields.dimensions)).toMatchObject({ hair: 'short', audience: 'adult_male', defaultVoiceId: 'voice-1' });
    expect(fields.avatarUrl).toBe('/face2.jpg');
    expect(readPersonaViews(persona({ ...fields, sourceImages: JSON.parse(fields.sourceImages) }))).toEqual({ views, extraImages: ['/extra.jpg'] });
    expect(fields).not.toHaveProperty('description');
  });
  it('does not resurrect a removed face view from legacy fallback fields', () => {
    const views = { ...readPersonaViews().views, main: '/main.jpg', face: '', side: '/side.jpg', front: '' };
    const fields = personaImageFields(views, [], undefined, 'female', '');
    expect(readPersonaViews(persona({ ...fields, sourceImages: JSON.parse(fields.sourceImages) })).views).toEqual(views);
    expect(fields.avatarUrl).toBe('/main.jpg');
  });
  it('keeps the generated high resolution portrait as the cover and stores the separate face view', () => {
    const views = { ...readPersonaViews().views, main: '/created.jpg', face: '/face-crop.jpg' };
    const creation = { referenceImageUrl: '/input.jpg', imageUrl: '/created.jpg', prompt: '正面自然光肖像' };
    const fields = personaImageFields(views, [], JSON.stringify({ assetCreation: creation }), 'female', '');
    expect(fields.avatarUrl).toBe('/created.jpg');
    expect(JSON.parse(fields.dimensions)).toMatchObject({ assetCreation: creation, personaViews: views });
    expect(JSON.parse(fields.sourceImages)).toEqual(['/created.jpg', '/face-crop.jpg']);
  });
  it('preserves retired angle labels on ordinary edits and clears them for a new reference', () => {
    const dimensions = JSON.stringify({ personaViews: { main: '/old.jpg', upperBody: '/half.jpg' } });
    const old = readPersonaViews(persona({ dimensions }));
    expect(old.extraImages).toContain('/half.jpg');
    const edited = personaImageFields(old.views, old.extraImages, dimensions, 'female', '');
    expect(JSON.parse(edited.dimensions).personaViews.upperBody).toBe('/half.jpg');
    const replaced = personaImageFields(readPersonaViews().views, [], dimensions, 'female', '');
    expect(JSON.parse(replaced.dimensions).personaViews).not.toHaveProperty('upperBody');
  });
  it.each(['senior', 'child'] as const)('preserves male audience metadata when saving a %s persona', (group) => {
    const views = { ...readPersonaViews().views, main: '/main.jpg' };
    const dimensions = JSON.stringify({ audience: `${group}_male`, hair: 'short' });
    const fields = personaImageFields(views, [], dimensions, `${group}_male`, '');
    expect(JSON.parse(fields.dimensions)).toMatchObject({ audience: `${group}_male`, hair: 'short' });
    const aged = personaImageFields(views, [], '{"audience":"adult_male"}', `${group}_male`, '');
    expect(JSON.parse(aged.dimensions).audience).toBe(`${group}_male`);
  });
});

const scene = (patch: Partial<SalesSceneCandidate>): SalesSceneCandidate => ({
  id: 's', title: '场景', description: '原描述', lighting: '自然光', category: 'general', spatialType: 'indoor_room',
  tags: '', suitableCategories: [], coverUrl: '/main.jpg', sourceImages: ['/main.jpg', '/old.jpg'], source: 'scene_library', ...patch,
});

describe('场景主图与九宫格补充视角', () => {
  it('uses the saved indoor classification even when the room overlooks a street or garden', () => {
    expect(classifySceneSpace(scene({ title: '街景咖啡馆', description: '室内落地窗，窗外是公园', spatialType: 'indoor_room' }))).toBe('indoor');
    expect(classifySceneSpace(scene({ title: '花园', spatialType: '', tags: '室内，暖光' }))).toBe('indoor');
    expect(classifySceneSpace(scene({ title: '室内风格的户外展台', spatialType: 'outdoor' }))).toBe('outdoor');
    expect(classifySceneSpace(scene({ title: '公园草坪', spatialType: '', tags: '' }))).toBe('outdoor');
  });
  it('uses the cover as the main view and retains unlabelled historical references', () => {
    expect(SCENE_VIEWS).toHaveLength(10);
    expect(readSceneViews(scene({}))).toEqual({ views: { ...readSceneViews().views, main: '/main.jpg' }, extraImages: ['/old.jpg'] });
  });
  it('round trips view labels, deduplicates images and preserves unrelated metadata', () => {
    const views = { ...readSceneViews().views, main: '/main.jpg', left: '/left.jpg', right: '/right.jpg', reverse: '/reverse.jpg' };
    const fields = sceneImageFields(views, ['/old.jpg', '/main.jpg'], '{"room":"living"}');
    expect(JSON.parse(fields.dimensions)).toMatchObject({ room: 'living', sceneViews: views });
    expect(JSON.parse(fields.sourceImages)).toEqual(['/main.jpg', '/left.jpg', '/right.jpg', '/reverse.jpg', '/old.jpg']);
    expect(readSceneViews(scene({ ...fields, sourceImages: JSON.parse(fields.sourceImages) }))).toEqual({ views, extraImages: ['/old.jpg'] });
    expect(fields).not.toHaveProperty('description');
  });
  it('keeps a missing left view empty when only the right view has been added', () => {
    const views = { ...readSceneViews().views, main: '/main.jpg', left: '', right: '/right.jpg', reverse: '' };
    const fields = sceneImageFields(views, []);
    expect(readSceneViews(scene({ ...fields, sourceImages: JSON.parse(fields.sourceImages) })).views).toEqual(views);
  });
  it('retains the three existing images and leaves the new reverse view empty', () => {
    const oldViews = { main: '/main.jpg', left: '/left.jpg', right: '/right.jpg' };
    expect(readSceneViews(scene({ dimensions: JSON.stringify({ sceneViews: oldViews }), sourceImages: Object.values(oldViews) })))
      .toEqual({ views: { ...readSceneViews().views, ...oldViews }, extraImages: [] });
  });
});

const base = { id: 'old', title: '旧动作', action: '转身', shotType: '', camera: '', tags: '', coverUrl: '/old.jpg' };
describe('action media catalog', () => {
  it('keeps historical image references and classifies video/depth media independently', () => {
    expect(actionMedia(base)).toEqual({ type: 'image', url: '/old.jpg', video: false });
    const cards = salesMaterialCards({ personas: [], scenes: [], voices: [], bgms: [], actions: [base,
      { ...base, id: 'v', mediaType: 'video', mediaUrl: '/motion.mp4', coverUrl: '' },
      { ...base, id: 'di', mediaType: 'depth-image', mediaUrl: '/depth.png', sourceUrl: '/old.jpg' },
      { ...base, id: 'dv', mediaType: 'depth-video', mediaUrl: '/depth.mp4', coverUrl: '' },
    ] });
    expect(cards.map((c) => c.badge)).toEqual(['图片', '视频', '深度图片', '深度视频']);
    expect(cards[1].video).toBe('/motion.mp4');
    expect(cards[2].image).toBe('/depth.png');
    expect(cards[2].sourceUrl).toBe('/old.jpg');
    expect(cards[3].image).toBe('');
  });

  it('numbers machine-generated hash titles as 1, 2, 3 and strips system noise tags', () => {
    const cards = salesMaterialCards({
      personas: [], scenes: [], voices: [], bgms: [],
      actions: [
        {
          ...base,
          id: 'hash-1',
          title: '01eae4aae15dd2254f037001a18d3e65a4_520 · 深度',
          shotType: '中景',
          camera: 'iPhone 50mm 生活镜头',
          tags: '深度动作,mocap,standard,转身展示',
          mediaType: 'depth-video',
          mediaUrl: '/depth.mp4',
        },
      ],
    });
    expect(cards[0].title).toBe('1');
    expect(cards[0].tags).toEqual(['转身展示']);
    expect(cards[0].subBadge).toBeUndefined();
  });
});
