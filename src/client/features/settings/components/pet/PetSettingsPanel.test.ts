import { describe, expect, it } from 'vitest';
import type { PetSummary } from '@shared/contracts/pets';
import { petChoices } from './PetSettingsPanel';

const remote: PetSummary = {
  id: 'q-ban-da-fei-yu', displayName: 'Q版大肥鱼', description: '鲸灵', spriteVersion: 2, origin: 'builtin', spritesheetUrl: '/api/pets/q-ban-da-fei-yu/spritesheet',
};

describe('pet settings choices', () => {
  it('keeps none and the original monster ahead of installed pets', () => {
    expect(petChoices([remote]).map((pet) => pet.id)).toEqual(['none', 'beike', 'q-ban-da-fei-yu']);
  });
});
