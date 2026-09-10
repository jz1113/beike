import { describe, it, expect } from 'vitest';
import { buildSmartEditPrompt, resolveMarkerSpatialDescription } from './smartEdit';

describe('smartEdit prompt engine', () => {
  it('测试标记点方位描述生成', () => {
    expect(resolveMarkerSpatialDescription(20, 15)).toContain('上方头部/上半部分偏左侧');
    expect(resolveMarkerSpatialDescription(50, 50)).toContain('中部身躯/中心位置居中');
    expect(resolveMarkerSpatialDescription(80, 85)).toContain('下方下半部分偏右侧');
  });

  it('测试智能改图提示词组装包含标记点与锁定规则', () => {
    const prompt = buildSmartEditPrompt({
      originalPrompt: '一个美丽的动漫少女穿紫衣站在樱花树下',
      userPrompt: '把头发换成粉色发丝',
      markers: [{ x: 45, y: 25, index: 1, type: 'point' }],
    });

    expect(prompt).toContain('【局部定向修改与智能重绘指令】：以参考图 @图片1 (image) 为绝对视觉基准画面。');
    expect(prompt).toContain('标记序号【1】（点选标记）：位于原图上方头部/上半部分居中');
    expect(prompt).toContain('【目标修改内容】：把头发换成粉色发丝。');
    expect(prompt).toContain('全画面一致性与局部锁定严密规则');
    expect(prompt).toContain('一个美丽的动漫少女穿紫衣站在樱花树下');
  });

  it('测试智能改图提示词组装包含矩形框选区域与范围说明', () => {
    const prompt = buildSmartEditPrompt({
      originalPrompt: '一只可爱的小猫坐在床上',
      userPrompt: '把右侧背景上的相框去掉',
      markers: [{ x: 60, y: 30, width: 25, height: 18, index: 1, type: 'box' }],
    });

    expect(prompt).toContain('选区序号【1】（矩形框选区域）：位于原图中部身躯/中心位置偏右侧');
    expect(prompt).toContain('框选区域覆盖宽度约 25%，高度约 18%');
    expect(prompt).toContain('【目标修改内容】：把右侧背景上的相框去掉。');
  });

  it('测试无标记点时的默认提示词组装', () => {
    const prompt = buildSmartEditPrompt({
      userPrompt: '更换背景为海边沙滩',
    });

    expect(prompt).toContain('【目标修改内容】：更换背景为海边沙滩。');
    expect(prompt).toContain('以用户描述指向的具体局部位置为准');
  });
});
