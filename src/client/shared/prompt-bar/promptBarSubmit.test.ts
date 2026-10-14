import { describe, expect, it } from 'vitest';
import { buildPromptBarGenerationTasks, type PromptBarSubmitInput } from './promptBarSubmit';

function input(currentView: string): PromptBarSubmitInput {
  return {
    quickGenMode: 'image',
    quickPrompt: '一只猫',
    quickRefImages: [],
    activeSubjects: [],
    allSubjects: [],
    quickVideoRefMode: 'omni',
    quickVideoFirstFrame: null,
    quickVideoLastFrame: null,
    quickVideoMultiFrames: [],
    quickCount: 1,
    quickVideoCount: 1,
    quickModel: 'gpt-image-2',
    quickVideoModel: 'seedance',
    sizeStr: '1024x1024',
    quickQuality: 'medium',
    quickVideoAspectId: '1:1',
    quickVideoResolution: '720P',
    quickVideoDuration: 5,
    currentView,
    hasImageModels: true,
    hasVideoModels: true,
    quickDepthStyle: 'mocap',
    quickDepthQuality: 'standard',
  };
}

describe('buildPromptBarGenerationTasks session', () => {
  it('keeps later image and video generations in the current conversation or canvas', () => {
    const generate = buildPromptBarGenerationTasks(input('generate'));
    const canvas = buildPromptBarGenerationTasks({ ...input('canvas'), quickGenMode: 'video', quickPrompt: '镜头推进' });
    const home = buildPromptBarGenerationTasks(input('home'));
    expect(generate.ok && generate.shouldCreateNewSession).toBe(false);
    expect(canvas.ok && canvas.shouldCreateNewSession).toBe(false);
    expect(home.ok && home.shouldCreateNewSession).toBe(true);
  });
});
