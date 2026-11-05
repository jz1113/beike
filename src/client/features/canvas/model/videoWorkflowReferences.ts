import type {StudioScene} from './types';
import {studioEdgeSources,studioNodeKind,studioNodeMedia} from './studioConnections';

/** Template roles follow actual connected sources, including the user's reference ordering. */
export function bindVideoWorkflowReferences(scene:StudioScene,node:StudioScene['nodes'][number],prompt:string,canonical:string):string {
 if(!prompt.startsWith(canonical))return prompt;
 const key=node.id.endsWith('-analysis')?'analysis':node.id.endsWith('-keyframe')?'keyframe':'video';
 const prefix=node.id.slice(0,-key.length-1);
 const roles=key==='analysis'?['source','product','person','background']:key==='keyframe'?['product','person','background']:['depth','keyframe'];
 const ids=[...new Set(scene.connections.filter(e=>e.to===node.id&&(!e.inputType||e.inputType==='default')).flatMap(e=>studioEdgeSources(e,scene)))];
 const media=ids.map(id=>scene.nodes.find(n=>n.id===id)).filter(n=>n&&studioNodeKind(n)!=='text') as StudioScene['nodes'];
 const s=node.settings as Record<string,unknown>||{},order=s.inputItemOrder||s.inputImageOrder;
 if(Array.isArray(order))media.sort((a,b)=>{
  const index=(n:StudioScene['nodes'][number])=>{const i=order.indexOf(studioNodeMedia(n).url);return i<0?Infinity:i;};
  return index(a)-index(b);
 });
 const bound=canonical.replace(/@(图片|视频)(\d+)/g,(token,kind:string,number:string)=>{
  const source=`${prefix}-${roles[Number(number)-1]}`,index=media.findIndex(n=>n.id===source);
  return index<0?token:`@${kind}${index+1}`;
 });
 return bound+prompt.slice(canonical.length);
}
