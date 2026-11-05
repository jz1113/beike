import { videoPromptSkill } from '@shared/domain/assistant/skills/videoPromptSkills';
import { resolveVideoMode } from '@shared/domain/media/videoCapabilities';
import { resolveStudioInputs } from './studioConnections';
import { videoPromptBindingMatches } from './videoPromptApproval';
import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import type { StudioScene } from './types';
import { studioChannels } from './studioGeneration';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';

function selection(node:StudioScene['nodes'][number],scene?:StudioScene) {
  const settings=node.settings as Record<string,unknown>|undefined;
  if(node.type!=='gen-video' || settings?.beikeOperation)return;
  if(settings?.beikeOptimizePrompt===false)return;
  const channel=studioChannels().find(item=>item.id===settings?.model);
  if(channel?.kind!=='video')return;
  let refs:Array<{type:string}>=[];
  try {if(scene)refs=resolveStudioInputs(scene,node.id).refs;}catch { /* Invalid references are explained when generation is requested. */ }
  const mode=typeof settings?.beikeVideoMode==='string' ? settings.beikeVideoMode==='auto'?undefined:settings.beikeVideoMode : settings?.beikeVideoWorkflow==='w3-copy'?'first_frame':undefined;
  return {model:channel.modelId,route:channel.id,mode:resolveVideoMode(channel.modelId,mode,refs.filter(ref=>ref.type==='image').length,refs.filter(ref=>ref.type==='video').length,getGatewayClientBaseUrl(channel.route))};
}

export function studioPromptSkill(node:StudioScene['nodes'][number],scene?:StudioScene) {
  const target=selection(node,scene);
  return target?videoPromptSkill(target.model,target.mode):undefined;
}

export function studioMatchingPromptOptimization(node:StudioScene['nodes'][number],scene?:StudioScene) {
  const target=selection(node,scene),value=node.beikePromptOptimization as VideoPromptOptimization|undefined;
  return target && videoPromptBindingMatches(value,target,target.route)?value:undefined;
}

export function studioPromptBadge(node:StudioScene['nodes'][number],scene?:StudioScene):string {
  const settings=node.settings as Record<string,unknown>|undefined;
  if(node.type!=='gen-video' || settings?.beikeOperation)return '';
  if(settings?.beikeOptimizePrompt===false)return '提示词技能：未启用';
  const target=selection(node,scene),skill=target?videoPromptSkill(target.model,target.mode):undefined;
  if(!skill || !target)return '提示词技能：暂无匹配';
  const optimization=studioMatchingPromptOptimization(node,scene);
  const name=skill.displayName || skill.name;
  if(node.beikePromptReviewPending && optimization)return `待确认 · ${name}`;
  if(node.beikePromptOptimizing)return `优化中 · ${name}`;
  if(optimization)return `${optimization.submitted?'已用':'已优化'} · ${name}`;
  return `待用 · ${name}`;
}
