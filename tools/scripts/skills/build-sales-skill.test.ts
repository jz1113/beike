import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import catalog from '../../../src/shared/domain/assistant/skills/compiledSkillPackages.json';
import { compileSalesSkill } from './build-sales-skill.mjs';

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sales-skill-'));
  temporary.push(root);
  for (const directory of ['src/shared/domain/sales', 'src/backend/internal/generate/sales', '.agents/skills/fashion-video-sales']) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  const skills = structuredClone(catalog.filter(skill => skill.id === 'fashion-video-sales'));
  return { root, skills, read: (file: string) => fs.readFileSync(path.join(root, file), 'utf8') };
}

describe('sales skill source propagation', () => {
  it('propagates a changed production rule to browser, server and guide with a new revision', () => {
    const { root, skills, read } = fixture();
    const browser = 'src/shared/domain/sales/compiledSalesSkill.json';
    const server = 'src/backend/internal/generate/sales/skill_package.generated.json';
    compileSalesSkill(root, skills, true);
    const before = JSON.parse(read(browser));
    const guide = skills[0].files.find(file => file.path === 'references/production.md')!;
    guide.content = guide.content.replace('## 日常风格', '## 日常风格\n\n本次维护新增的首帧自然曝光约束。');
    expect(() => compileSalesSkill(root, skills, false)).toThrow('stale');
    compileSalesSkill(root, skills, true);
    const after = JSON.parse(read(browser));
    expect(after.revision).not.toBe(before.revision);
    expect(read(browser)).toBe(read(server));
    for (const stage of ['script', 'image', 'finalize']) expect(after.stages[stage]).toContain('新增的首帧自然曝光约束');
    expect(after.stages.render).not.toContain('新增的首帧自然曝光约束');
    expect(read('.agents/skills/fashion-video-sales/SKILL.md')).toContain('新增的首帧自然曝光约束');
    expect(() => compileSalesSkill(root, skills, false)).not.toThrow();
  });

  it('fails compilation instead of substituting a builtin prompt for missing skill rules', () => {
    const { root, skills } = fixture();
    skills[0].files = skills[0].files.filter(file => file.path !== 'references/analysis.md');
    expect(() => compileSalesSkill(root, skills, true)).toThrow('Missing sales resource');
  });

  it('propagates color fidelity across creative stages and includes it in the source revision', () => {
    const { root, skills, read } = fixture();
    const output = 'src/shared/domain/sales/compiledSalesSkill.json';
    compileSalesSkill(root, skills, true);
    const before = JSON.parse(read(output));
    const guide = skills[0].files.find(file => file.path === 'references/production.md')!;
    guide.content = guide.content.replace('## 商品颜色保真', '## 商品颜色保真\n\n本次更新的面料保色要求。');
    compileSalesSkill(root, skills, true);
    const after = JSON.parse(read(output));
    expect(after.revision).not.toBe(before.revision);
    for (const stage of ['analyze', 'select', 'script', 'image', 'finalize']) {
      expect(after.stages[stage]).toContain('本次更新的面料保色要求');
    }
    expect(after.stages.image).not.toContain('【时间轴与剪辑】');
    const rolesFile = skills[0].files.find(file => file.path === 'assets/image-reference-roles.json')!;
    const roles = JSON.parse(rolesFile.content);
    delete roles.colorFidelity;
    rolesFile.content = JSON.stringify(roles);
    expect(() => compileSalesSkill(root, skills, true)).toThrow('Missing sales image role: colorFidelity');
  });

  it('keeps the video template out of the still and render stages', () => {
    const { root, skills, read } = fixture();
    compileSalesSkill(root, skills, true);
    const { stages } = JSON.parse(read('src/shared/domain/sales/compiledSalesSkill.json'));
    expect(stages.finalize).toContain('【时间轴与剪辑】');
    expect(stages.image).not.toContain('【时间轴与剪辑】');
    expect(stages.render).not.toContain('旧分镜');
  });

  it('routes directing methods by stage without leaking the teaching script into production prompts', () => {
    const { root, skills, read } = fixture();
    const output = 'src/shared/domain/sales/compiledSalesSkill.json';
    compileSalesSkill(root, skills, true);
    const before = JSON.parse(read(output));
    const directing = skills[0].files.find(file => file.path === 'references/directing.md')!;
    const routing: Record<string, string[]> = {
      '展示主线与脚本构建': ['analyze', 'script'],
      '分镜信息与状态设计': ['script', 'finalize'],
      '商品层次与构图': ['image'],
      '提示词编排与取舍': ['finalize'],
      '脚本构建示例': [],
    };
    Object.keys(routing).forEach((name, index) => {
      directing.content = directing.content.replace(`## ${name}\n`, `## ${name}\n\ndirecting-rule-${index}\n`);
    });
    expect(() => compileSalesSkill(root, skills, false)).toThrow('stale');
    compileSalesSkill(root, skills, true);
    const after = JSON.parse(read(output));
    expect(after.revision).not.toBe(before.revision);
    expect(read(output)).toBe(read('src/backend/internal/generate/sales/skill_package.generated.json'));
    Object.values(routing).forEach((targets, index) => {
      for (const [stage, content] of Object.entries(after.stages)) {
        expect((content as string).includes(`directing-rule-${index}`)).toBe(targets.includes(stage));
      }
      expect(read('.agents/skills/fashion-video-sales/SKILL.md')).toContain(`directing-rule-${index}`);
    });
    expect(after.stages.select).toBe(before.stages.select);
    expect(after.stages.render).toBe(before.stages.render);
    expect(after.stages.image).not.toContain('## 脚本构建示例');
  });

  it('rejects missing directing rules and duplicate sections across reference files', () => {
    const { root, skills } = fixture();
    const directing = skills[0].files.find(file => file.path === 'references/directing.md')!;
    const original = directing.content;
    directing.content = original.replace('## 分镜信息与状态设计', '## 已移除的分镜方法');
    expect(() => compileSalesSkill(root, skills, true)).toThrow('Missing script sales section: 分镜信息与状态设计');
    directing.content = `${original}\n\n## 商品颜色保真\n重复章节`;
    expect(() => compileSalesSkill(root, skills, true)).toThrow('Duplicate sales section: 商品颜色保真');
    skills[0].files = skills[0].files.filter(file => file.path !== directing.path);
    expect(() => compileSalesSkill(root, skills, true)).toThrow('Missing sales directing rules');
  });

  it('routes changed quality rules to their stages and invalidates the shared revision', () => {
    const { root, skills, read } = fixture();
    const output = 'src/shared/domain/sales/compiledSalesSkill.json';
    compileSalesSkill(root, skills, true);
    const before = JSON.parse(read(output));
    const quality = skills[0].files.find(file => file.path === 'references/content-quality.md')!;
    const routing: Record<string, string[]> = {
      '质量判定与验收': ['analyze', 'script', 'finalize'],
      '信息增益与叙事': ['analyze', 'script', 'finalize'],
      '画面与首帧': ['image', 'finalize'],
      '声音制作': ['script', 'finalize'],
      '人设与信任': ['analyze', 'script', 'finalize'],
    };
    Object.keys(routing).forEach((name, index) => {
      quality.content = quality.content.replace(`## ${name}\n`, `## ${name}\n\nquality-rule-${index}\n`);
    });
    expect(() => compileSalesSkill(root, skills, false)).toThrow('stale');
    compileSalesSkill(root, skills, true);
    const after = JSON.parse(read(output));
    expect(after.revision).not.toBe(before.revision);
    expect(read(output)).toBe(read('src/backend/internal/generate/sales/skill_package.generated.json'));
    Object.values(routing).forEach((targets, index) => {
      for (const [stage, content] of Object.entries(after.stages)) {
        expect((content as string).includes(`quality-rule-${index}`)).toBe(targets.includes(stage));
      }
      expect(read('.agents/skills/fashion-video-sales/SKILL.md')).toContain(`quality-rule-${index}`);
    });
    expect(after.stages.render).toBe(before.stages.render);
  });

  it('rejects missing or ambiguous quality sections instead of silently skipping them', () => {
    const { root, skills } = fixture();
    const quality = skills[0].files.find(file => file.path === 'references/content-quality.md')!;
    const original = quality.content;
    quality.content = original.replace('## 声音制作', '## 已移除的声音规则');
    expect(() => compileSalesSkill(root, skills, true)).toThrow('Missing script sales section: 声音制作');
    quality.content = `${original}\n\n## 商品颜色保真\n重复章节`;
    expect(() => compileSalesSkill(root, skills, true)).toThrow('Duplicate sales section: 商品颜色保真');
    skills[0].files = skills[0].files.filter(file => file.path !== quality.path);
    expect(() => compileSalesSkill(root, skills, true)).toThrow('Missing sales content quality rules');
  });

  it('includes executable templates and speech limits in the shared rule revision', () => {
    const { root, skills, read } = fixture();
    const output = 'src/shared/domain/sales/compiledSalesSkill.json';
    compileSalesSkill(root, skills, true);
    const before = JSON.parse(read(output));
    const resource = skills[0].files.find(file => file.path === 'assets/runtime-directives.json')!;
    const directives = JSON.parse(resource.content);
    directives.speech.on_camera = '声音来源：出镜人物现场说话，沿用更新的声音约束。';
    resource.content = JSON.stringify(directives);
    compileSalesSkill(root, skills, true);
    const changed = JSON.parse(read(output));
    expect(changed.revision).not.toBe(before.revision);
    expect(changed.directives.speech.on_camera).toContain('更新的声音约束');
    const limitsFile = skills[0].files.find(file => file.path === 'assets/speech-limits.json')!;
    const limits = JSON.parse(limitsFile.content);
    limits.maxRate = 6.4;
    limitsFile.content = JSON.stringify(limits);
    compileSalesSkill(root, skills, true);
    expect(JSON.parse(read(output)).revision).not.toBe(changed.revision);
    expect(JSON.parse(read(output)).speechLimits.maxRate).toBe(6.4);
    limits.preferredMinRate = limits.preferredMaxRate + 0.1;
    limitsFile.content = JSON.stringify(limits);
    expect(() => compileSalesSkill(root, skills, true)).toThrow('Inconsistent sales speech limits');
    limits.preferredMinRate = before.speechLimits.preferredMinRate;
    limitsFile.content = JSON.stringify(limits);
    delete directives.speech.on_camera;
    resource.content = JSON.stringify(directives);
    expect(() => compileSalesSkill(root, skills, true)).toThrow('Missing sales directive');
  });
});
