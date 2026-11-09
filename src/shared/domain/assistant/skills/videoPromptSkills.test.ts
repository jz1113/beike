import { describe, expect, it } from 'vitest';
import { videoPromptMessages, videoPromptProfiles, videoPromptSkill } from './videoPromptSkills';
import { listApprovedModels } from '@shared/domain/models/modelCatalog';

describe('verified video prompt skills', () => {
  it.each([
    ['wan3.0-video','wan3-pe'],['wan3.0-video-prime','wan3-pe'],['MiniMax-H3','h3-prompt-writing'],['h3','h3-prompt-writing'],
    ['doubao-seedance-2.0-mini','sd2-pe'],['doubao-seedance-2.5-pro','sd25-pe'],
  ])('matches %s to its versioned upstream package', (model,id) => expect(videoPromptSkill(model)?.id).toBe(id));
  it('does not use similar models or a Wan editing task as an excuse to apply another skill', () => {
    for(const model of ['wan2.2-t2v','MiniMax-Hailuo-02','seedance-1.5-pro','kling-v3','unknown']) expect(videoPromptSkill(model)).toBeUndefined();
    expect(videoPromptSkill('wan3.0-video','edit')).toBeUndefined();
  });
  it('passes the full upstream body without truncating long instructions or inventing asset observations', () => {
    const prompt='图1的人物说：“保持原话。”，视频1只参考运镜。';
    const messages=videoPromptMessages({model:'doubao-seedance-2.5-pro',prompt,mode:'omni',duration:8,images:1,videos:1})!;
    expect(messages[0].content).toContain(videoPromptSkill('doubao-seedance-2.5-pro')!.prompt);
    expect(JSON.parse(messages[1].content)).toMatchObject({originalPrompt:prompt,duration:8,references:{images:1,videos:1,audio:0}});
  });
  it('loads the correct H3 guide for reference versus keyframe generation', () => {
    const input={model:'h3',prompt:'连续推进',images:2,videos:0};
    const skill=videoPromptSkill('h3')!;
    const base=skill.files!.find(file=>file.path==='references/base-en.txt')!.content;
    const ref=skill.files!.find(file=>file.path==='references/ref-en.txt')!.content;
    expect(videoPromptMessages({...input,mode:'first_last_frame'})![0].content).toContain(base);
    expect(videoPromptMessages({...input,mode:'first_last_frame'})![0].content).not.toContain(ref);
    expect(videoPromptMessages({...input,mode:'omni'})![0].content).toContain(ref);
  });
  it('covers every currently approved video model with an explicit, traceable binding',()=>{
    for(const model of listApprovedModels('video')) {
      const skill=videoPromptSkill(model.id);
      expect(skill,model.id).toBeDefined();
      expect(skill?.source?.revision,model.id).toBeTruthy();
      const messages=videoPromptMessages({model:model.id,prompt:'人物在雨中抬头，镜头缓慢推近',images:0,videos:0});
      expect(messages?.[0].content,model.id).toContain(`上游技能：${skill?.name}`);
      expect(skill?.modelIcon,model.id).toBeTruthy();
    }
  });
  it('reads only the selected model guide in the shared community writer',()=>{
    const input={prompt:'商品保持外观，镜头绕行',images:1,videos:0};
    const source=videoPromptSkill('sora-2')!;
    for(const [model,guide] of [['sora-2','models/sora-2.md'],['kling-video-v2-5-turbo','models/kling.md'],['viduq4-preview','models/vidu.md']]) {
      const content=videoPromptMessages({...input,model})![0].content;
      expect(content).toContain(source.files!.find(file=>file.path===guide)!.content);
      for(const other of ['models/sora-2.md','models/kling.md','models/vidu.md'].filter(path=>path!==guide))expect(content).not.toContain(source.files!.find(file=>file.path===other)!.content);
    }
    expect(videoPromptSkill('kling-video-v2-5-turbo')?.modelIcon).toBe('kling-video-v2-5-turbo');
    expect(videoPromptSkill('viduq4-preview')?.displayName).toContain('通用');
    expect(videoPromptSkill('sora-2')?.source?.kind).toBe('community');
  });
  it('isolates prompt chapters from SDK and MCP execution workflows',()=>{
    for(const model of ['omni_flash-10s','veo3.1','veo3.1-fast','grok-imagine-video-1.5','viduq3']) {
      const skill=videoPromptSkill(model)!;
      const content=videoPromptMessages({model,prompt:'一只猫奔跑',images:0,videos:0})![0].content;
      for(const heading of videoPromptProfiles[model].sections || [])expect(content).toContain(heading);
      expect(content).not.toContain('## Dependencies and Prerequisites');
      expect(content).not.toContain('## Worked example:');
      expect(content).toContain('不附参数表、设置建议、网址、推广信息或自检报告');
      expect(content.length,model).toBeLessThan(skill.prompt.length+2000);
    }
  });
});
