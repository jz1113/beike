import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { resolveVideoMode, videoDurationOptions, videoModeLabel, videoModes, videoRatioLocked, videoResolutionOptions } from '@shared/domain/media/videoCapabilities';
import { resolveStudioInputs } from './studioConnections';
import { studioChannels } from './studioGeneration';
import type { StudioScene } from './types';
import { veoExtensionHint, isVeoNativeBase } from '@shared/domain/media/veoChannels';
import { isMetasoH3 } from '@shared/domain/media/videoChannels';

/** Use the host catalog for channel IDs; vendor predicates in the renderer cannot identify them. */
export function studioVideoSettings(node:StudioScene['nodes'][number],scene?:StudioScene) {
  const settings=node.settings as Record<string,unknown> || {};
  if(node.type!=='gen-video' || settings.beikeOperation)return;
  const channel=studioChannels().find(item=>item.id===settings.model && item.kind==='video');
  if(!channel)return;
  const model=channel.modelId,baseUrl=getGatewayClientBaseUrl(channel.route);
  const profile=getVideoModelById(model,baseUrl);
  if(!profile)return;
  let refs:Array<{type:string}>=[];
  let scriptAudio:boolean|undefined;
  try {if(scene){const inputs=resolveStudioInputs({...scene,nodes:scene.nodes.map(item=>item.id===node.id?node:item)},node.id);refs=inputs.refs;scriptAudio=inputs.audio;}}catch { /* Submission reports missing inputs. */ }
  const modes=videoModes(model,baseUrl);
  const preferred=typeof settings.beikeVideoMode==='string'?settings.beikeVideoMode:settings.beikeVideoWorkflow==='w3-copy'?'first_frame':'auto';
  const selected=preferred==='auto'||modes.some(item=>item.id===preferred)?preferred:'auto';
  const copy=settings.beikeVideoWorkflow==='w3-copy' && selected==='first_frame' && isMetasoH3(model,baseUrl);
  const imageCount=refs.filter(item=>item.type==='image').length,videoCount=refs.filter(item=>item.type==='video').length;
  const automatic=resolveVideoMode(model,undefined,imageCount,videoCount,baseUrl);
  const mode=resolveVideoMode(model,selected==='auto'?undefined:selected,imageCount,videoCount,baseUrl);
  const resolutions=videoResolutionOptions(model,mode,baseUrl) || profile.supportedResolutions;
  const resolution=resolveVideoResolution(copy?'768P':String(settings.resolution || resolutions[0]),resolutions);
  const durations=videoDurationOptions(model,resolution,mode,baseUrl);
  const requested=parseFloat(String(settings.duration || '5s'));
  const duration=durations.reduce((best,value)=>Math.abs(value-requested)<Math.abs(best-requested)?value:best,durations[0]);
  const locked=videoRatioLocked(model,mode,baseUrl),ratios=locked?['adaptive']:profile.supportedAspectRatios;
  const ratio=String(settings.ratio || 'adaptive').replace(/^Auto$/i,'adaptive');
  const aspect=locked?'adaptive':ratios.includes(ratio)?ratio:ratios[0];
  return {
    beikeModeOptions:[{value:'auto',label:`自动 · ${videoModeLabel(automatic)}`},...modes.map(item=>({value:item.id,label:item.name}))],
    beikeSelectedMode:selected,modeLayout:'pills',showGenMode:true,
    ratioOptions:ratios.map(item=>item==='adaptive'?'Auto':item),selectedRatio:aspect==='adaptive'?'Auto':aspect,
    showRatioSection:mode!=='motion_control',showResolutionSection:true,showDurationSection:!['edit','motion_control'].includes(mode),
    videoEditLocksAdaptive:locked,ratioHint:locked?'跟随原素材':undefined,
    resolutionOptions:resolutions,selectedResolution:resolution,resolutionField:'resolution',
    durationHint:veoExtensionHint(model,mode,baseUrl) ? isVeoNativeBase(baseUrl) ? '原生延长 · 新增 7 秒' : '末帧续拍并拼接 · 新增 8 秒' : undefined,
    durationOptions:durations.map(value=>`${value}s`),selectedDuration:`${duration}s`,
    showAudio:!copy && profile.audioSupport==='controllable',audioEnabled:typeof settings.beikeVideoAudio==='boolean'?settings.beikeVideoAudio:scriptAudio ?? true,audioField:'beikeVideoAudio',
  };
}
