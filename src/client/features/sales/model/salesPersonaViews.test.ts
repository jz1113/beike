import { describe, expect, it } from 'vitest';
import type { SalesPersonaCandidate } from '@shared/domain/sales';
import { personaImageFields, readPersonaViews } from './salesPersonaViews';

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
  it.each(['senior', 'child'] as const)('preserves male audience metadata when saving a %s persona', (group) => {
    const views = { ...readPersonaViews().views, main: '/main.jpg' };
    const dimensions = JSON.stringify({ audience: `${group}_male`, hair: 'short' });
    const fields = personaImageFields(views, [], dimensions, group, '');
    expect(JSON.parse(fields.dimensions)).toMatchObject({ audience: `${group}_male`, hair: 'short' });
    const aged = personaImageFields(views, [], '{"audience":"adult_male"}', group, '');
    expect(JSON.parse(aged.dimensions).audience).toBe(`${group}_male`);
  });
});
