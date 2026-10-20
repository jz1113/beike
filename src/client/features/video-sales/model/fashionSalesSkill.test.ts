import source from '../../../../../.agents/skills/fashion-video-sales/SKILL.md?raw';
import { describe, expect, it } from 'vitest';
import { SALES_RULE_GROUPS, SALES_SKILL_DOCUMENT, SALES_SKILL_OPTIONS, salesCategoryForSkill, salesCreationRule, salesSkillBadge, salesSkillId } from './fashionSalesSkill';

describe('sales rule groups', () => {
  it('groups shared workflow and fashion guidance into two concise cards', () => {
    expect(SALES_RULE_GROUPS.map((group) => [group.id, group.title])).toEqual([
      ['workflow', '通用制作流程'], ['fashion', '服饰专属规则'],
    ]);
    for (const group of SALES_RULE_GROUPS) {
      expect(group.summary.length).toBeLessThanOrEqual(40);
      expect(group.appliesWhen).toBeTruthy();
      expect(group.input).toBeTruthy();
      expect(group.output).toContain('一条完整视频');
      expect(group.flow).toHaveLength(4);
    }
  });

  it('keeps the all-category workflow explicit and requires real images before finalization', () => {
    const workflow = SALES_RULE_GROUPS[0];
    expect(workflow.appliesWhen).toBe('全部商品品类');
    expect(workflow.input).toMatch(/商品资料.*SKU 颜色.*商品图.*时长.*画幅/);
    expect(workflow.flow).toEqual(['确认商品', '编排脚本', '生成素材', '定稿出片']);
    const details = workflow.sections.flatMap((section) => section.body).join('\n');
    expect(details).toContain('人物与场景按脚本需要自动规划');
    expect(details).toContain('根据实际图片定稿完整提示词');
    expect(details).toContain('不静默丢图、改秒数或拆段拼接');
    expect(details).toContain('仅请求分析或提示词时，不擅自调用付费');
    expect(details).toContain('提交结果未确认时不自动重复提交');
  });

  it('presents fashion as additional guidance with lightweight applicability labels', () => {
    const fashion = SALES_RULE_GROUPS[1];
    expect(fashion.summary).toContain('在通用流程上');
    expect(fashion.appliesWhen).toBe('服饰、鞋、包');
    expect(fashion.input).toContain('同一颜色的单品图');
    expect(fashion.input).toContain('人物与场景按需生成');
    expect(salesCreationRule('fashion').title).toBe('服饰专属规则');
    expect(salesCreationRule('home').title).toBe('通用制作流程');
    expect(salesCreationRule('beauty').detail).toContain('通用流程');
    expect(SALES_SKILL_OPTIONS.map((item) => [item.id, item.label])).toEqual([['generic', '通用制作流程'], ['fashion', '服饰专属规则']]);
    expect(salesSkillId('fashion')).toBe('fashion');
    expect(salesSkillId('beauty')).toBe('generic');
    expect(salesSkillId('home')).toBe('generic');
    expect(salesCategoryForSkill('fashion')).toBe('fashion');
    expect(salesCategoryForSkill('generic')).toBe('other');
    expect(salesSkillBadge(true)).toBe('当前适用');
    expect(salesSkillBadge(false)).toBe('服饰鞋包适用');
    expect(`${salesSkillBadge(true)}${salesSkillBadge(false)}`).not.toMatch(/不适用|使用中|未使用|正在生成/);
  });

  it('uses the exact skill file for copying and removes only frontmatter for display', () => {
    expect(SALES_SKILL_DOCUMENT.source).toBe(source);
    expect(SALES_SKILL_DOCUMENT.filename).toBe('SKILL.md');
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter?.[1]).toContain(`name: ${SALES_SKILL_DOCUMENT.name}`);
    expect(frontmatter?.[1]).toMatch(/description: .+适用于/);
    expect(SALES_SKILL_DOCUMENT.body).toBe(source.slice(frontmatter![0].length).trim());
    expect(SALES_SKILL_DOCUMENT.body).toMatch(/^# 服饰带货视频/);
    expect(SALES_SKILL_DOCUMENT.body).not.toMatch(/^---|^name:|^description:/m);
    expect(source.split('\n').length).toBeLessThan(500);
  });

  it('documents ordered stages, final output and delivery checks', () => {
    for (const section of ['适用范围', '输入与事实依据', '执行流程', '素材与参考规则', '输出与阶段区分', '费用与恢复', '交付自检']) {
      expect(SALES_SKILL_DOCUMENT.body).toContain(`## ${section}`);
    }
    expect(source.indexOf('**自动生图并校验**')).toBeLessThan(source.indexOf('**实际图片定稿**'));
    expect(source).toContain('`fullPrompt`');
    expect(source).toContain('`shotId`');
    expect(source).toContain('绘图提示词属于前面的素材规划');
    expect(source).toContain('分段时长加总等于目标时长');
    expect(source).toContain('文档本身不代表所有检查已由程序绝对保证');
  });

  it('requires product-aware automatic images and protects uncertain submissions', () => {
    expect(source).toContain('人物、人脸、场景无需人工上传');
    expect(source).toContain('商品上身或手持画面带入当前 SKU 商品图');
    expect(source).toContain('人脸特写从已经生成的人物派生');
    expect(source).toContain('不是商品图目录的 `imageIndex`');
    expect(source).toContain('每张图完成即保存');
    expect(source).toContain('部分失败只补缺失项');
    expect(source).toContain('提交结果未确认时禁止自动重复提交');
    expect(source).toContain('仅请求分析或提示词时不擅自调用付费');
  });

  it('keeps realistic single-video output and factual product constraints', () => {
    expect(source).toContain('一次出片');
    expect(source).toContain('不静默改秒数、丢图或拆段拼接');
    expect(source).toContain('真实皮肤、空间、自然光和比例');
    expect(source).toContain('画面无字幕、贴纸、大字标题或价格条');
    expect(source).toContain('没有依据的功效、评价、销量、实测、优惠、尺码或链接不编造');
    expect(source).toContain('不写换装或面料飘动');
  });
});
