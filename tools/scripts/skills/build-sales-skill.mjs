/** Compile the selected sales skill once for the browser, Go API and local guide. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const stageSections = {
  analyze: ['质量判定与验收', '信息增益与叙事', '展示主线与脚本构建', '人设与信任', '输入与事实依据', '商品颜色保真', '叙事选择', '景别与运镜'],
  select: ['输入与事实依据', '商品颜色保真', '景别与运镜'],
  script: ['质量判定与验收', '信息增益与叙事', '展示主线与脚本构建', '分镜信息与状态设计', '人设与信任', '声音制作', '输入与事实依据', '商品颜色保真', '叙事选择', '日常风格', '生活动线与拍摄选择', '实拍表演与连续性', '景别与运镜', '口播', '素材与参考规则', '人物选角与年龄匹配'],
  image: ['画面与首帧', '商品层次与构图', '商品颜色保真', '日常风格', '景别与运镜', '素材与参考规则', '人物选角与年龄匹配'],
  finalize: ['质量判定与验收', '信息增益与叙事', '分镜信息与状态设计', '提示词编排与取舍', '画面与首帧', '声音制作', '人设与信任', '输入与事实依据', '商品颜色保真', '日常风格', '生活动线与拍摄选择', '实拍表演与连续性', '景别与运镜', '口播', '输出与阶段区分'],
  render: [],
};
const stageResources = {
  analyze: ['references/analysis.md'], select: ['references/selection.md'],
  script: [], image: [], finalize: ['assets/final-video-prompt.md'], render: ['references/render.md'],
};
const directiveKeys = {
  promptTerms: ['on_camera', 'voiceover', 'speechmode', 'sku', 'vlog', 'logo', 'ai', 'ugc', 'pov', 'fps'],
  speech: ['on_camera', 'voiceover'], presentation: ['live_presenter', 'voiceover'],
  referenceRoles: ['default', 'product', 'scene', 'face'], video: ['intro', 'selectedColor', 'colorFidelity'],
  scriptExample: ['lead', 'leadVoiceover', 'tail', 'tailVoiceover', 'closing', 'description', 'camera', 'prompt', 'presenterDescription', 'presenterCamera', 'presenterPrompt', 'assetPrompt', 'presenterAssetPrompt'],
};

export function compileSalesSkill(root, catalog, write) {
  const skill = catalog.find(item => item.id === 'fashion-video-sales');
  if (!skill) throw new Error('Missing installed fashion-video-sales skill');
  const resources = Object.fromEntries(skill.files.map(file => [file.path, file.content]));
  const guide = resources['references/production.md'];
  if (!guide) throw new Error('Missing sales production rules');
  const quality = resources['references/content-quality.md'];
  if (!quality) throw new Error('Missing sales content quality rules');
  const directing = resources['references/directing.md'];
  if (!directing) throw new Error('Missing sales directing rules');
  const sections = {};
  for (const source of [guide, quality, directing]) {
    for (const match of source.matchAll(/^## (.+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) {
      if (sections[match[1]]) throw new Error(`Duplicate sales section: ${match[1]}`);
      sections[match[1]] = match[0].trim();
    }
  }
  const stages = {};
  for (const [stage, names] of Object.entries(stageSections)) {
    stages[stage] = [
      ...names.map(name => {
        if (!sections[name]) throw new Error(`Missing ${stage} sales section: ${name}`);
        return sections[name];
      }),
      ...stageResources[stage].map(resource => {
        if (!resources[resource]?.trim()) throw new Error(`Missing sales resource: ${resource}`);
        return resources[resource].trim();
      }),
    ].join('\n\n');
    if (!stages[stage].trim()) throw new Error(`Empty sales stage: ${stage}`);
  }
  const imageRoles = JSON.parse(resources['assets/image-reference-roles.json']);
  for (const role of ['singleFrame', 'product', 'productView', 'viewEvidence', 'colorFidelity', 'scene', 'person', 'dependency']) {
    if (typeof imageRoles[role] !== 'string' || !imageRoles[role].trim()) throw new Error(`Missing sales image role: ${role}`);
  }
  const directives = JSON.parse(resources['assets/runtime-directives.json']);
  for (const [group, keys] of Object.entries(directiveKeys)) {
    for (const key of keys) {
      if (typeof directives[group]?.[key] !== 'string' || !directives[group][key].trim()) throw new Error(`Missing sales directive: ${group}.${key}`);
    }
  }
  const speechLimits = JSON.parse(resources['assets/speech-limits.json']);
  for (const key of ['minRate', 'maxRate', 'preferredMinRate', 'preferredMaxRate', 'shotMaxRate', 'minShotHan']) {
    if (!Number.isFinite(speechLimits[key]) || speechLimits[key] <= 0) throw new Error(`Invalid sales speech limit: ${key}`);
  }
  if (speechLimits.minRate > speechLimits.preferredMinRate || speechLimits.preferredMinRate > speechLimits.preferredMaxRate || speechLimits.preferredMaxRate > speechLimits.maxRate || speechLimits.maxRate > speechLimits.shotMaxRate || !Number.isInteger(speechLimits.minShotHan)) throw new Error('Inconsistent sales speech limits');
  if (!Array.isArray(speechLimits.disallowedPhrases) || speechLimits.disallowedPhrases.some(phrase => typeof phrase !== 'string' || !phrase.trim())) throw new Error('Invalid sales disallowed phrases');
  const revision = createHash('sha256').update(JSON.stringify({
    main: skill.markdownDoc, guide, quality, directing, stages, imageRoles, directives, speechLimits, version: skill.version,
  })).digest('hex');
  const runtime = JSON.stringify({ id: skill.id, revision, stages, imageRoles, directives, speechLimits }, null, 2) + '\n';
  const localGuide = `---\nname: ${skill.id}\ndescription: 为服饰、鞋、包编写实拍带货脚本，依据当前 SKU 商品图自动生成人物和场景，在实际图片完成后定稿整段视频提示词，一次生成整段。适用于服饰带货、开箱换装、生活穿搭及鞋包展示；不适用于其他商品品类。\n---\n\n${guide.trim()}\n\n${quality.trim()}\n\n${directing.trim()}\n`;
  for (const [file, content] of [
    ['src/shared/domain/sales/compiledSalesSkill.json', runtime],
    ['src/backend/internal/generate/sales/skill_package.generated.json', runtime],
    ['.agents/skills/fashion-video-sales/SKILL.md', localGuide],
  ]) {
    const target = path.join(root, file);
    if (write) fs.writeFileSync(target, content);
    else if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) {
      throw new Error(`Sales skill output is stale: ${file}. Run pnpm skills:build.`);
    }
  }
}
