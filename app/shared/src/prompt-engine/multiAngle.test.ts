import { describe, expect, it } from 'vitest';
import { resolveAngleDescriptions, sanitizeOriginalPromptForMultiAngle, buildMultiAnglePrompt, normalizeLegacyMultiAnglePrompt } from './multiAngle';

describe('multiAngle prompt engine', () => {
  describe('resolveAngleDescriptions', () => {
    it('正确解析正视和平视角', () => {
      const desc = resolveAngleDescriptions(0, 0);
      expect(desc.horizontalLabel).toContain('正面');
      expect(desc.verticalLabel).toContain('平视');
      expect(desc.compositeLabel).toContain('正面拍摄视角 + 平视水平拍摄');
    });

    it('正确解析右侧 90 度和微俯视角', () => {
      const desc = resolveAngleDescriptions(90, 20);
      expect(desc.horizontalLabel).toContain('正右侧方90度');
      expect(desc.horizontalEn).toContain('profile right side view');
      expect(desc.verticalLabel).toContain('轻微高机位俯视');
    });

    it('正确解析背面 180 度和仰拍机位', () => {
      const desc = resolveAngleDescriptions(180, -20);
      expect(desc.horizontalLabel).toContain('正后方180度背影视角');
      expect(desc.verticalLabel).toContain('微低机位仰拍视角');
    });

    it('处理负角度与大于360度的情况（角度周期归一化）', () => {
      const desc = resolveAngleDescriptions(-90, 0); // 相当于 270 度（左视）
      expect(desc.horizontalLabel).toContain('正左侧方90度');

      const descOver = resolveAngleDescriptions(405, 0); // 相当于 45 度（右前）
      expect(descOver.horizontalLabel).toContain('右前侧方45度');
    });
  });

  describe('sanitizeOriginalPromptForMultiAngle', () => {
    it('剥离机位度数文本及旧版多角度标签', () => {
      const input = '多角度视角转换(机位: 129° / 0) 动漫原画群像，内容一切随机';
      const cleaned = sanitizeOriginalPromptForMultiAngle(input);
      expect(cleaned).toBe('动漫原画群像，内容一切随机');
      expect(cleaned).not.toContain('多角度');
      expect(cleaned).not.toContain('129');
    });

    it('剥离括号形机位前缀', () => {
      const input = '【多角度】 (机位: 90° / 10°) 精致少女侧颜特写';
      const cleaned = sanitizeOriginalPromptForMultiAngle(input);
      expect(cleaned).toBe('精致少女侧颜特写');
    });
  });

  describe('buildMultiAnglePrompt', () => {
    it('生成包含透视重构与防九宫格硬约束的完整提示词', () => {
      const prompt = buildMultiAnglePrompt({
        originalPrompt: '动漫原画群像，内容一切随机',
        azimuth: 129,
        elevation: 0,
        angleName: '右后侧方135度',
      });

      // 包含单视角摄影转换与透视重构，杜绝原图一模一样
      expect(prompt).toContain('【全新单视角摄影转换】');
      expect(prompt).toContain('【空间透视重构】');
      expect(prompt).toContain('彻底打破原图原有的平视正面机位');
      expect(prompt).toContain('严禁原样复刻原图正面视角');

      // 包含主体五官与画风锁定
      expect(prompt).toContain('【主体身份与风格继承】');
      expect(prompt).toContain('严格保持主体人物/角色的外貌长相');

      // 包含清理后的主体内容
      expect(prompt).toContain('【画面呈现内容】：动漫原画群像，内容一切随机。');

      // 包含防九宫格/反多切片/反接触表硬性守卫，杜绝九宫格
      expect(prompt).toContain('【单幅画面硬性约束】');
      expect(prompt).toContain('绝对严禁九宫格拼图');
      expect(prompt).toContain('严禁分镜接触表');
      expect(prompt).toContain('NO grid, NO collage');
    });
  });

  describe('normalizeLegacyMultiAnglePrompt', () => {
    it('自动识别旧版机位格式并升级防九宫格与透视重构', () => {
      const legacy = '多角度视角转换(机位: 129° / 0) 动漫原画群像，内容一切随机';
      const upgraded = normalizeLegacyMultiAnglePrompt(legacy);

      expect(upgraded).toContain('【全新单视角摄影转换】');
      expect(upgraded).toContain('【空间透视重构】');
      expect(upgraded).toContain('【单幅画面硬性约束】');
      expect(upgraded).toContain('动漫原画群像，内容一切随机');
      expect(upgraded).toContain('绝对严禁九宫格拼图');
    });

    it('普通提示词不受影响', () => {
      const normal = '一只可爱的猫咪在阳光下睡觉';
      expect(normalizeLegacyMultiAnglePrompt(normal)).toBe(normal);
    });
  });
});
