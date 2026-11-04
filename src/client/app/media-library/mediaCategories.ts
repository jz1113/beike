import { PERSONA_AGES, PERSONA_GENDERS, personaGender, personaCategory, type PersonaCategory, type PersonaAge } from '@client/features/sales/model/salesPersonaClassification';
import type { SalesSceneSpace } from '@client/features/sales/model/salesMaterialCatalog';

export function personaFolder(category: PersonaCategory) {
  const gender = personaGender(category);
  const age = category === gender ? 'young' : category.split('_')[0] as PersonaAge;
  return ['人物', gender === 'male' ? '男' : '女', age === 'child' ? '儿童' : PERSONA_AGES[age]].join('/');
}

export const sceneFolder = (space: SalesSceneSpace) => space === 'indoor' ? '场景/室内' : '场景/室外';

export const libraryCategories = [
  '场景/室内', '场景/室外',
  ...PERSONA_GENDERS.flatMap(({id}) => (Object.keys(PERSONA_AGES) as PersonaAge[]).map(age => personaFolder(personaCategory(id, age)))),
  '声音/人声', '声音/BGM', '动作',
];

const folderOrder = new Map<string,number>();
for (const leaf of libraryCategories) {
  const parts = leaf.split('/');
  parts.forEach((_,index) => {
    const path = parts.slice(0,index+1).join('/');
    if (!folderOrder.has(path)) folderOrder.set(path,folderOrder.size);
  });
}

export function compareLibraryFolders(a:string, b:string) {
  const rank = (folderOrder.get(a) ?? Infinity) - (folderOrder.get(b) ?? Infinity);
  return rank || a.localeCompare(b,'zh-CN',{numeric:true});
}
