import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, type SalesAdaptedBeat } from './promptAssembler';
import { normalizeScriptTemplate } from './scriptTemplate';

const script = normalizeScriptTemplate({
  title: '单镜展示', durationSec: 5.6, voiceMode: 'none', visualSpec: { oneTake: true },
  shots: [{ start: 0, end: 5.6, beats: [{ start: 0, end: 5.6, action: '举手后收势',
    expression: '看向旧窗边后微笑', transition: '转向旧窗边结束',
  }] }],
})!;
const adapted: SalesAdaptedBeat = { index: 0, subject: '当前人物', action: '举臂，腕部弯折，手指松垂',
  expression: '举臂时看镜头浅笑，末段笑意回落，嘴唇轻微分合', transition: '双手回落，保持当前站位', spokenLine: '', subtitle: '' };
const assemble = (beats?: SalesAdaptedBeat[], source = script) => assembleSalesVideoPrompt({
  script: source, productName: '开衫', selectedImages: [], beatBindings: [], persona: null, scene: null,
  customSceneImageUrl: '/new-room.jpg', adaptedBeats: beats, presentationMode: 'clean_visual',
});

describe('adapted facial performance and ending continuity', () => {
  it('keeps expression and transition in the final prompt when the action was adapted', () => {
    const result = assemble([adapted]);
    expect(result.enginePrompt).toContain(`眼神表情：${adapted.expression}`);
    expect(result.enginePrompt).toContain(`段落衔接：${adapted.transition}`);
    expect(result.enginePrompt).not.toContain('旧窗边');
    expect(result.warnings.join(' ')).not.toContain('未独立记录表情或衔接');
  });

  it('keeps source expression for script-only beats even when a new scene image is bound', () => {
    const source = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, action: '举手', expression: '抬眼看镜头浅笑' }] }] })!;
    expect(assemble(undefined, source).enginePrompt).toContain('眼神表情：抬眼看镜头浅笑');
  });

  it('honors a subject edit independently of action edits', () => {
    const source = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{
      start: 0, end: 5, subject: '原脚本出镜主体', action: '举手展示商品',
    }] }] })!;
    const result = assemble([{ index: 0, subject: '双手托住当前开衫', action: '', spokenLine: '', subtitle: '' }], source);
    expect(result.enginePrompt).toContain('主体状态：双手托住当前开衫');
    expect(result.enginePrompt).toContain('动作描述：举手展示商品');
    expect(result.enginePrompt).not.toContain('原脚本出镜主体');
  });

  it.each(['expression', 'transition'] as const)('honors an isolated %s edit while retaining the source action', (field) => {
    const result = assemble([{ index: 0, subject: '', action: '', spokenLine: '', subtitle: '', [field]: '手动精修内容' }]);
    expect(result.enginePrompt).toContain(`${field === 'expression' ? '眼神表情' : '段落衔接'}：手动精修内容`);
    expect(result.enginePrompt).toContain('动作描述：举手后收势');
  });

  it('retains the source subject only while the source action is retained', () => {
    const source = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{
      start: 0, end: 5, subject: '原脚本出镜主体', action: '举手展示商品',
    }] }] })!;
    expect(assemble(undefined, source).enginePrompt).toContain('主体状态：原脚本出镜主体');
    expect(assemble([{ ...adapted, subject: ' ' }], source).enginePrompt).not.toContain('原脚本出镜主体');
  });

  it('retains old action edits and asks for their missing performance without reintroducing source scenery', () => {
    const legacy = { index: 0, subject: '当前人物', action: '在新客厅举手', spokenLine: '', subtitle: '' };
    const result = assemble([legacy]);
    expect(result.enginePrompt).toContain(legacy.action);
    expect(result.enginePrompt).not.toContain('旧窗边');
    expect(result.warnings.join(' ')).toContain('旧改编未独立记录表情或衔接');
  });

  it('honors explicitly cleared performance and describes padding without inventing a new ending', () => {
    const result = assemble([{ ...adapted, expression: '', transition: '' }]);
    expect(result.enginePrompt).not.toContain('• 眼神表情：');
    expect(result.enginePrompt).not.toContain('旧窗边');
    expect(result.enginePrompt).toContain('若生成时长超过脚本 00:05.6');
    expect(result.enginePrompt).toContain('仅延续末姿势、呼吸和材质自然回落');
    expect(result.enginePrompt).toContain('不强制全程闭嘴');
    expect(result.enginePrompt).toContain('不新增连续说话式口型');
  });
});
