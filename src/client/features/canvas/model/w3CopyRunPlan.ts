import {studioEdgeSources,studioNodeKind,studioNodeMedia,resolveStudioInputs} from './studioConnections';
import type {StudioScene} from './types';

type Node=StudioScene['nodes'][number];
export const w3Settings=(node:Node)=>node.settings as Record<string,unknown>||{};
export function w3CopyRunPlan(scene:StudioScene) {
  const videos=scene.nodes.filter(n=>w3Settings(n).beikeVideoWorkflow==='w3-copy');
  if(videos.length!==1)throw new Error('一键运行需要一套W3复刻流程，请保留一个W3视频节点');
  const incoming=(node:Node)=>[...new Set(scene.connections.filter(e=>e.to===node.id&&(!e.inputType||e.inputType==='default')).flatMap(e=>studioEdgeSources(e,scene)))].map(id=>{
    const source=scene.nodes.find(n=>n.id===id);
    if(!source)throw new Error('连线中的节点已不存在，请检查模板连线');
    return source;
  });
  const video=videos[0],sources=incoming(video);
  const analysis=sources.find(n=>n.type==='text-node'&&w3Settings(n).beikeTextResultRequired);
  const keyframe=sources.find(n=>n.type==='gen-image'&&w3Settings(n).beikeStoryboardKeyframe);
  if(sources.length!==2||!analysis||!keyframe)throw new Error('视频节点只能连接分镜脚本和目标首帧，请恢复模板连线');
  const imageInputs=incoming(keyframe),pictures=imageInputs.filter(n=>studioNodeKind(n)==='image');
  const analysisInputs=incoming(analysis),originals=analysisInputs.filter(n=>studioNodeKind(n)==='video');
  const analysisPictures=analysisInputs.filter(n=>studioNodeKind(n)==='image');
  if(pictures.length!==3||pictures.some(n=>n.type!=='input-image')||!imageInputs.some(n=>n.id===analysis.id)
    ||imageInputs.some(n=>!['image','text'].includes(studioNodeKind(n)||''))
    ||originals.length!==1||originals[0].type!=='input-image'||analysisPictures.length!==3
    ||analysisPictures.some(n=>!pictures.some(p=>p.id===n.id)))throw new Error('请连接原视频、人物、商品和背景四项素材，保持模板连线');
  return {video,analysis,keyframe,inputs:[originals[0],...pictures],notes:analysisInputs.filter(n=>studioNodeKind(n)==='text')};
}

export function preflightW3Copy(scene:StudioScene) {
  const plan=w3CopyRunPlan(scene);
  for(const node of scene.nodes)if(node.isGenerating||w3Settings(node).isGenerating||w3Settings(node).textNodeIsAnalyzing)
    throw new Error('画布已有任务正在运行，请等待完成后再一键运行');
  for(const node of plan.inputs)if(!studioNodeMedia(node).url||node.missingMedia)throw new Error(`请先添加或替换素材：${node.nodeName||node.id}`);
  resolveStudioInputs(scene,plan.analysis.id);
  return plan;
}

/** Ignore generated results and viewport movement; changing inputs, prompts or wiring stops the remaining steps. */
export function w3CopyInputKey(scene:StudioScene) {
  const plan=w3CopyRunPlan(scene),critical=new Set([plan.analysis.id,plan.keyframe.id,plan.video.id]);
  return JSON.stringify({
    inputs:plan.inputs.map(n=>{const m=studioNodeMedia(n);return [n.id,m.assetId||m.url];}),
    notes:plan.notes.map(n=>[n.id,w3Settings(n).text||n.content||n.prompt]),
    analysis:[w3Settings(plan.analysis).textNodeDraftPrompt,w3Settings(plan.analysis).textNodeChatModel],
    image:[plan.keyframe.prompt,w3Settings(plan.keyframe).model,w3Settings(plan.keyframe).ratio,w3Settings(plan.keyframe).gptImageQuality],
    video:[plan.video.prompt,w3Settings(plan.video).model,w3Settings(plan.video).beikeVideoMode,w3Settings(plan.video).resolution,w3Settings(plan.video).duration,w3Settings(plan.video).beikeVideoAudio,w3Settings(plan.video).beikeOptimizePrompt],
    edges:scene.connections.filter(e=>critical.has(e.to)).map(e=>[e.to,studioEdgeSources(e,scene),e.inputType||'default']),
  });
}
