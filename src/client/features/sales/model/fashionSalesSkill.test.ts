import source from '../../../../../.agents/skills/fashion-video-sales/SKILL.md?raw';
import { describe, expect, it } from 'vitest';
import { SALES_RULE_GROUPS, SALES_SKILL_DOCUMENT, SALES_SKILL_OPTIONS, salesCategoryForSkill, salesCreationRule, salesSkillBadge, salesSkillId } from './fashionSalesSkill';

describe('sales rule groups', () => {
  it('shows one self-contained fashion card in the rules dialog', () => {
    expect(SALES_RULE_GROUPS.map((group) => [group.id, group.title])).toEqual([
      ['fashion', '服饰专属规则'],
    ]);
    const fashion = SALES_RULE_GROUPS[0];
    expect(fashion.summary.length).toBeLessThanOrEqual(40);
    expect(fashion.summary).toBe('为服饰、鞋、包选择实拍叙事，保持同一人物与单品。');
    expect(fashion.summary).not.toContain('通用');
    expect(fashion.appliesWhen).toBe('服饰、鞋、包');
    expect(fashion.input).toBe('商品资料、同一颜色的单品图、时长和画幅；人物与场景按需生成');
    expect(fashion.output).toContain('一条完整视频');
    expect(fashion.flow).toEqual(['选择叙事', '保持一致', '实图定稿', '整段出片']);
  });

  it('keeps generic creation selectable outside the rules dialog', () => {
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
    for (const section of ['适用范围', '输入与事实依据', '执行流程', '口播', '素材与参考规则', '输出与阶段区分', '参考成片吸收', '费用与恢复', '交付自检']) {
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
    expect(source).toContain('口播不出现价格或金额');
    expect(source).toContain('没有依据的功效、评价、销量、实测、优惠、尺码或链接不编造');
    expect(source).toContain('15秒全片写48–69个汉字');
    expect(source).toContain('约每秒 3.2–4.6 个字');
    expect(source).toContain('单段不超过约每秒 6 个字');
    expect(source).toContain('对镜头说的第一人称');
    expect(source).toContain('可以直接入手、简单好搭、值得入、基础百搭、闭眼入不算收尾');
    expect(source).toContain('语速略慢，一句说完停半拍，嘴型与原文对齐');
    expect(source).toContain('参考成片吸收');
    expect(source).toContain('不认第二套、第三套');
    expect(source).toContain('不写换装或面料飘动');
  });
});
