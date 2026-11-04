import { expect, it } from 'vitest';
import { classifyPersonaGroup, PERSONA_CATEGORIES, personaGroupToDimensions, type PersonaCategory } from './salesPersonaClassification';

it.each(Object.keys(PERSONA_CATEGORIES) as PersonaCategory[])('keeps the selected gender and age for %s', (category) => {
  const dimensions = personaGroupToDimensions('{"hair":"short"}', category);
  expect(JSON.parse(dimensions).hair).toBe('short');
  expect(classifyPersonaGroup({ name: '', description: '', tags: '', dimensions })).toBe(category);
});
