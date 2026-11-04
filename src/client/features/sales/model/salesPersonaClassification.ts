import { appearanceAudience, audienceDimensions, setAudienceDimensions } from '@shared/domain/assets/appearanceAudience';
import type { SalesPersonaCandidate } from '@shared/domain/sales';

export const PERSONA_GENDERS = [{ id: 'female', label: '女' }, { id: 'male', label: '男' }] as const;
export type PersonaGender = typeof PERSONA_GENDERS[number]['id'];
export const PERSONA_AGES = { young: '青年', middle: '中年', senior: '老年', child: '幼年' } as const;
export type PersonaAge = keyof typeof PERSONA_AGES;
export type PersonaCategory = PersonaGender | `${Exclude<PersonaAge, 'young'>}_${PersonaGender}`;

export function personaCategory(gender: PersonaGender, age: PersonaAge): PersonaCategory {
  return age === 'young' ? gender : `${age}_${gender}`;
}
export function personaGender(category: PersonaCategory): PersonaGender {
  return category.endsWith('female') ? 'female' : 'male';
}
export const PERSONA_CATEGORIES = Object.fromEntries(PERSONA_GENDERS.flatMap(({ id, label }) =>
  Object.entries(PERSONA_AGES).map(([age, name]) => [personaCategory(id, age as PersonaAge), name + label])
)) as Record<PersonaCategory, string>;

export function classifyPersonaGroup(persona: Pick<SalesPersonaCandidate, 'name' | 'tags' | 'description' | 'dimensions'>): PersonaCategory {
  const audience = appearanceAudience(persona);
  const text = [persona.tags, persona.name, persona.description].join(' ');
  const gender = audience.endsWith('_male') ? 'male' : audience.endsWith('_female') ? 'female'
    : /男|爷爷|先生|大叔|大爷|小哥|绅士|子轩|博文/.test(text) && !/女/.test(text) ? 'male' : 'female';
  const adultAge = audienceDimensions(persona.dimensions).personaAge;
  const age = audience.startsWith('child_') ? 'child' : audience.startsWith('senior_') ? 'senior'
    : audience === 'unknown' && /幼年|儿童|童|男孩|女孩|宝宝/.test(text) ? 'child'
    : audience === 'unknown' && /老年|老人|爷爷|奶奶|长者|银发|大爷|大妈/.test(text) ? 'senior'
    : adultAge === 'middle' || (adultAge !== 'young' && /中年/.test(text)) ? 'middle' : 'young';
  return personaCategory(gender, age);
}

export function personaGroupToDimensions(existing: string | undefined, category: PersonaCategory): string {
  const gender = personaGender(category);
  const age = category.includes('_') ? category.split('_')[0] : 'young';
  const audienceAge = age === 'senior' || age === 'child' ? age : 'adult';
  return setAudienceDimensions({ ...audienceDimensions(existing), personaAge: age }, `${audienceAge}_${gender}`);
}
