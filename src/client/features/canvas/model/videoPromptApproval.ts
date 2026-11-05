import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import type { VideoPromptInput } from '@shared/domain/assistant/skills/videoPromptSkills';
import { videoPromptSkill } from '@shared/domain/assistant/skills/videoPromptSkills';
import { canonicalModelId } from '@shared/domain/models/modelCatalog';

export function videoPromptReviewKey(input:VideoPromptInput,refs:readonly unknown[],route:string):string {
  return JSON.stringify({input,refs,route});
}

/** A previous model, route, mode or upstream Skill version must never describe the current selection. */
export function videoPromptBindingMatches(value:VideoPromptOptimization|undefined,target:Pick<VideoPromptInput,'model'|'mode'>,route:string):boolean {
  const skill=videoPromptSkill(target.model,target.mode);
  if(!value || !skill || value.skillId!==skill.id || value.revision!==skill.source?.revision)return false;
  try {
    const binding=JSON.parse(value.inputKey || '');
    return binding.route===route && typeof binding.input?.model==='string'
      && canonicalModelId(binding.input.model)===canonicalModelId(target.model) && binding.input.mode===target.mode;
  } catch {return false;}
}

export function reusableVideoPromptDraft(value:VideoPromptOptimization|undefined,input:VideoPromptInput,refs:readonly unknown[],route:string) {
  return value && !value.submitted && value.inputKey===videoPromptReviewKey(input,refs,route)
    && videoPromptBindingMatches(value,input,route) ? value : undefined;
}

/** No default approval: undefined is cancellation and invalid drafts cannot become task prompts. */
export function approveVideoPrompt(optimization:VideoPromptOptimization,prompt:string|undefined) {
  if(prompt===undefined)return;
  if(!prompt.trim() || prompt.length>20000)throw new Error('请填写 20000 字以内的视频提示词');
  return {...optimization,draft:prompt,submitted:prompt};
}

export async function reviewVideoPrompt(optimization:VideoPromptOptimization,signal:AbortSignal,
  requestReview:(value:VideoPromptOptimization,signal:AbortSignal,onDraft?:(prompt:string)=>void)=>Promise<string|undefined>,onDraft?:(prompt:string)=>void) {
  signal.throwIfAborted();
  const prompt=await requestReview(optimization,signal,onDraft);
  signal.throwIfAborted();
  return approveVideoPrompt(optimization,prompt);
}
