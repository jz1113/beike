import type { StudioScene } from './types';
import { resolveStudioInputs } from './studioConnections';
import { studioChannels } from './studioGeneration';

/** Track inputs rather than UI/busy state, so saving a draft or moving a node does not invalidate it. */
export function studioPromptPreparationKey(scene:StudioScene,nodeId:string):string {
  const node=scene.nodes.find(item=>item.id===nodeId);
  if(!node)throw new Error('生成节点已不存在');
  const settings=node.settings as Record<string,unknown>||{};
  const channel=studioChannels().find(item=>item.id===settings.model);
  const inputs=resolveStudioInputs(scene,nodeId);
  return JSON.stringify({type:node.type,model:settings.model,route:channel?.route,upstream:channel?.modelId,metasoH3:channel && 'metasoH3' in channel ? channel.metasoH3 : undefined,
    prompt:inputs.prompt,refs:inputs.refs,ratio:settings.ratio,resolution:settings.resolution,duration:('duration' in inputs ? inputs.duration : undefined) ?? settings.duration,audio:'audio' in inputs ? inputs.audio : undefined,workflow:settings.beikeVideoWorkflow,
    videoMode:settings.beikeVideoMode,videoAudio:settings.beikeVideoAudio,quality:settings.gptImageQuality,optimize:settings.beikeOptimizePrompt!==false,operation:settings.beikeOperation});
}

export function assertStudioPromptPreparation(scene:StudioScene,nodeId:string,taskId:string,key:string):void {
  const node=scene.nodes.find(item=>item.id===nodeId);
  if(!node?.isGenerating || node.beikeTaskId!==taskId || studioPromptPreparationKey(scene,nodeId)!==key)
    throw new Error('模型、参数或上游内容已修改，视频尚未提交，请按当前模型重新优化并确认');
}
