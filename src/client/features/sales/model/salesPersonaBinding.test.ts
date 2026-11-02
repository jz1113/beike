import { describe, expect, it } from 'vitest';
import { emptySalesProductionPlan } from './salesProductionDraft';
import { reconcileSalesMaterialBindings } from './salesMaterial';
import { salesPersonaBindingKey, salesPersonaDescription, salesPersonaReferenceUrls, selectedSalesPersona, uploadSalesPersonaReference } from './salesPersonaBinding';

const persona = { id: 'chosen', name: '库中人物', description: '出镜人物', tags: '', avatarUrl: '/library-face.jpg', fullBodyUrl: '/library-body.jpg', faceUrl: '/library-face.jpg', sourceImages: [], hasReferenceImage: true, source: 'persona_library' };
const plan = () => ({ ...emptySalesProductionPlan(), personaId: persona.id });

describe('exclusive sales persona bindings', () => {
  it.each(['customPersonaBodyUrl', 'customPersonaFaceUrl'] as const)('isolates %s from every library anchor and label, including old saved mixed bindings', (field) => {
    const mixed = { ...plan(), [field]: '/uploaded.jpg' };
    expect(selectedSalesPersona(mixed, [persona])).toBeNull();
    expect(salesPersonaReferenceUrls(mixed, persona)).toEqual({ bodyUrl: field === 'customPersonaBodyUrl' ? '/uploaded.jpg' : '', faceUrl: field === 'customPersonaFaceUrl' ? '/uploaded.jpg' : '' });
    expect(salesPersonaDescription(mixed, persona)).not.toContain(persona.name);
    expect(salesPersonaBindingKey({ ...mixed, personaId: 'another' })).toBe(salesPersonaBindingKey(mixed));
  });

  it('clears the library ID on upload and keeps only the other explicitly uploaded custom anchor', () => {
    const body = { ...plan(), ...uploadSalesPersonaReference(plan(), 'personaBody', '/new-body.jpg') };
    const both = { ...body, ...uploadSalesPersonaReference(body, 'personaFace', '/new-face.jpg') };
    expect(both).toMatchObject({ personaId: '', customPersonaBodyUrl: '/new-body.jpg', customPersonaFaceUrl: '/new-face.jpg' });
    expect(salesPersonaReferenceUrls(both, persona)).toEqual({ bodyUrl: '/new-body.jpg', faceUrl: '/new-face.jpg' });
  });

  it('keeps a missing chosen ID through refresh and does not replace it with another catalog person', () => {
    const chosen = plan();
    const catalog = { personas: [{ ...persona, id: 'recommended' }], scenes: [], actions: [], voices: [], bgms: [] };
    const refreshed = reconcileSalesMaterialBindings(chosen, catalog);
    expect(refreshed.personaId).toBe('chosen');
    expect(selectedSalesPersona(refreshed, catalog.personas)).toBeNull();
    expect(selectedSalesPersona(emptySalesProductionPlan(), catalog.personas)).toBeNull();
  });

  it('uses body and face URLs from the one explicitly selected catalog asset', () => {
    const selected = selectedSalesPersona(plan(), [persona, { ...persona, id: 'other', fullBodyUrl: '/other-body.jpg' }]);
    expect(selected).toBe(persona);
    expect(salesPersonaReferenceUrls(plan(), selected)).toEqual({ bodyUrl: '/library-body.jpg', faceUrl: '/library-face.jpg' });
  });
});
