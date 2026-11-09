import {buildVideoWorkflowProject as createVideoWorkflowProject} from './videoWorkflowProjects';
import {compilerSettings} from './studioCompilerState';
/** Reconstruct the persisted pre-compiler graph for migration and legacy runner regressions. */
export function legacyDepthProject(id:string,now:number) {
 const project=createVideoWorkflowProject('depth-copy',id,now),scene=project.studioScene!;
 const compiler=scene.nodes.find(n=>n.id===`${id}-prompt`)!;
 scene.nodes=scene.nodes.filter(n=>n!==compiler&&!compilerSettings(n).beikeReferencePreparationRole).map(n=>{
  if(n.id===`${id}-keyframe`){const s={...compilerSettings(n)};delete s.beikeReferencePreparationVersion;s.beikeRequiredInputs=[`${id}-product`,`${id}-person`];return {...n,settings:s};}
  if(n.id!==`${id}-video`)return n;
  const settings:Record<string,unknown>={...compilerSettings(n),beikeScriptOnly:true,beikeOptimizePrompt:true};
  delete settings.beikeCompilerSource;
  return {...n,prompt:compiler.prompt,settings};
 });
 scene.connections=scene.connections.filter(e=>e.from!==compiler.id&&e.to!==`${id}-video`).filter(e=>e.to!==compiler.id||[`${id}-keyframe`,`${id}-analysis`].includes(e.from)).map(e=>e.to===compiler.id?{...e,to:`${id}-video`}:e);
 scene.connections=scene.connections.filter(e=>scene.nodes.some(n=>n.id===e.from)&&scene.nodes.some(n=>n.id===e.to));
 for(const key of ['product','person','background'])scene.connections.push({id:`${id}-${key}-frame`,from:`${id}-${key}`,to:`${id}-keyframe`});
 return project;
}
