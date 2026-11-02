import { describe, expect, it } from 'vitest';
import type { SalesSceneCandidate } from '@shared/domain/sales';
import { readSceneViews, sceneImageFields, SCENE_VIEWS } from './salesSceneViews';
import { classifySceneSpace } from './salesMaterialCatalog';

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
