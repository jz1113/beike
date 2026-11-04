import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt } from './promptAssembler';
import { normalizeScriptTemplate } from './scriptTemplate';
import { resolveSalesProductSlots } from './promptInputs';

const finalVideoTemplate = '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}';
const input = {
  finalVideoTemplate,
  script: normalizeScriptTemplate({ durationSec: 5, voiceMode: 'none', shots: [{ beats: [{
    start: 0, end: 5, subject: '人物展示{{ 商品 }}', actionTemplate: '触碰{{商品正面结构}}后展示{{商品细节部位}}，手停在袖口',
    expression: '嘴角轻扬', transition: '侧转展示{{商品背部设计}}',
  }] }] })!,
  productName: '开衫', selectedImages: [], beatBindings: [], persona: null, scene: null,
};

describe('sales execution fact preparation', () => {
  it('expands known product slots across facts without adding unverified details', () => {
    const result = assembleSalesVideoPrompt({ ...input, productSummary: '展示{{商品}}，结构以参考图为准' });
    expect(result.templateError).toBe('');
    for (const text of ['人物展示当前商品', '商品正面', '袖口', '商品背面', '当前商品名称：开衫']) expect(result.enginePrompt).toContain(text);
    expect(result.enginePrompt).not.toContain('{{');
    expect(result.enginePrompt).not.toContain('纽扣');
    expect(input.script.shots[0].beats[0].actionTemplate).toContain('{{商品正面结构}}');
  });

  it('does not treat expanding the failed kneading slot as evidence of a current liner', () => {
    const result = assembleSalesVideoPrompt({ ...input, adaptedBeats: [{ index: 0,
      subject: '低头关注手部揉捏动作', action: '双手揉捏{{商品内部配件}}，展示内胆回弹', spokenLine: '', subtitle: '',
    }] });
    expect(result.templateError).toMatch(/第 1 段.*内胆.*原始资料未确认/);
    expect(result.enginePrompt).toBe('');
  });

  it.each(['商品细节部位', '{{ 商品细节部位 }}'])('keeps the source heart gesture and generic appearance display for %s', (detail) => {
    const action = `双手提至胸前指尖相对比划爱心手势，头部轻微向斜上方倾斜，展示${detail}`;
    const script = normalizeScriptTemplate({ durationSec: 5, voiceMode: 'none', shots: [{ beats: [{ start: 0, end: 5, actionTemplate: action }] }] })!;
    const result = assembleSalesVideoPrompt({ ...input, script, imitationMode: 'depth_imitation', scriptVideoReference: { url: '/depth.mp4', kind: 'depth' } });
    expect(result.templateError).toBe('');
    expect(result.enginePrompt).toContain('双手提至胸前指尖相对比划爱心手势，头部轻微向斜上方倾斜，展示商品外观细节');
    expect(result.enginePrompt).not.toContain('该部位');
    expect(result.enginePrompt).not.toContain('{{');
    expect(script.shots[0].beats[0].actionTemplate).toBe(action);
  });

  it.each(['同时自然展现出{{商品细节部位}}的纹理', '并且继续呈现{{ 商品细节部位 }}的状态'])('expands a standalone generic display in the rendered fact %s', (action) => {
    expect(resolveSalesProductSlots(`动作描述：${action}`)).toBe(`动作描述：${action.replace(/\{\{\s*商品细节部位\s*\}\}/, '商品外观细节')}`);
  });

  it.each(['手掌轻抚{{商品细节部位}}并展示纹理', '展示{{商品细节部位}}并按压'])('does not generalize an interaction clause %s', (action) => {
    expect(resolveSalesProductSlots(action)).toContain('该部位');
  });

  it.each(['{{未知细节}}', '{{商品神奇功能}}', '{{audioFacts}}', '{{constructor}}', '{{未结束'])('blocks unresolved source data %s before submitting', (placeholder) => {
    const result = assembleSalesVideoPrompt({ ...input, adaptedBeats: [{ index: 0, subject: '', action: placeholder, spokenLine: '', subtitle: '' }] });
    expect(result.templateError).toMatch(/占位符/);
    expect(result.enginePrompt).toBe('');
    expect(result.jimengPrompt).toBe('');
  });

  it('keeps normal dialogue and JSON braces without treating them as slots', () => {
    const result = assembleSalesVideoPrompt({ ...input, adaptedBeats: [{ index: 0, subject: '', action: '{你好}，记录为{"衣物":{"颜色":"蓝"}}', spokenLine: '', subtitle: '' }] });
    expect(result.templateError).toBe('');
    expect(result.enginePrompt).toContain('{你好}，记录为{"衣物":{"颜色":"蓝"}}');
  });

  it.each(['doubao-seedance-2.0-mini', 'doubao-seedance-2-0-mini-260615', 'doubao-seedance-2-0-260128', 'doubao-seedance-2-0-fast-260128'])('uses ordered timing for %s while retaining depth source locations', (model) => {
    const result = assembleSalesVideoPrompt({ ...input, model, imitationMode: 'depth_imitation', scriptVideoReference: { url: '/depth.mp4', kind: 'depth' } });
    expect(result.enginePrompt).toContain('源片定位记录 00:00 - 00:05');
    expect(result.enginePrompt).not.toContain('动作段一（00:00 - 00:05）');
    expect(result.enginePrompt).toContain('按动作段顺序自然衔接');
    expect(result.enginePrompt).not.toContain('逐句口播');
  });

  it('keeps existing timing facts for other models', () => {
    const result = assembleSalesVideoPrompt({ ...input, model: 'doubao-seedance-2.5' });
    expect(result.enginePrompt).toContain('动作段一（00:00 - 00:05）');
    expect(result.enginePrompt).not.not.toContain('逐句口播');
  });
});
