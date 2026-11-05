import type { StudioScene } from './types';

type StudioNode = StudioScene['nodes'][number];
interface StudioGroup { id:string; nodeIds:string[]; [field:string]:unknown }

/** Copy the displayed result and its versions, without continuing the source node's task. */
export function cloneStudioNode(node: StudioNode): StudioNode {
  const copy = structuredClone(node);
  const settings = { ...(copy.settings as Record<string,unknown> || {}) };
  for (const key of ['_executeTrigger','_preGenerateSnapshot','textNodeComposerOpen','speechComposerOpen','musicComposerOpen']) delete settings[key];
  settings.isGenerating = false;
  settings._agentRunning = false;
  return { ...copy, beikeTaskId:undefined, beikeTaskRecord:undefined,beikeLastTaskId:undefined, beikeTaskStopped:undefined, beikeLastTaskPrompt:undefined, beikeLastTaskSettings:undefined, beikePromptReviewPending:false,beikePromptOptimizing:false, taskId:undefined, isGenerating:false, extractingFrames:false,
    isMasking:false, errorMsg:undefined, settings };
}

/** Internal references must follow the new nodes, just as their visible connections do. */
export function remapStudioNodeReferences(nodes: StudioNode[], entries: Array<[string,string]>): StudioNode[] {
  const ids = new Map(entries);
  const fields=new Set(['beikeOriginalNodeId','previewSourceNodeId','selectedPreviewId','_autoCreatedPreviewId','beikeRequiredInputs','referenceNodeIds']);
  function remap(value:unknown,key=''):unknown {
    if(typeof value==='string') return fields.has(key)?ids.get(value)||value:value;
    if(Array.isArray(value)) return value.map(item=>remap(item,key));
    if(!value || typeof value!=='object') return value;
    return Object.fromEntries(Object.entries(value).map(([field,item])=>[field,remap(item,field)]));
  }
  return nodes.map(node=>remap(node) as StudioNode);
}

export function collectStudioClipboardGroups({groups = [],selectedNodeIds,selectedGroupId}: {
  groups?:StudioGroup[]; selectedNodeIds:string[]; selectedGroupId?:string | null;
}) {
  const ids=new Set(selectedNodeIds.filter(Boolean));
  const selected=groups.find(group=>group.id===selectedGroupId);
  selected?.nodeIds.forEach(id=>ids.add(id));
  return {nodeIds:[...ids],groups:structuredClone(groups.filter(group=>group.nodeIds.length>0 && group.nodeIds.every(id=>ids.has(id))))};
}

export function cloneStudioGroups(groups:StudioGroup[] | undefined, entries:Array<[string,string]>, offset:{x:number;y:number}):StudioGroup[] {
  const ids=new Map(entries);
  return (groups || []).flatMap(source=>{
    const nodeIds=source.nodeIds.map(id=>ids.get(id)).filter((id):id is string=>Boolean(id));
    if (nodeIds.length!==source.nodeIds.length || !nodeIds.length) return [];
    const group=structuredClone(source);
    group.id=`group-${crypto.randomUUID()}`;group.nodeIds=nodeIds;
    for (const key of ['frameX','collapsedX']) if(typeof group[key]==='number') group[key]+=offset.x;
    for (const key of ['frameY','collapsedY']) if(typeof group[key]==='number') group[key]+=offset.y;
    if (Array.isArray(group.stackRestoreLayout)) group.stackRestoreLayout=group.stackRestoreLayout.map(item=>({
      ...item,nodeId:ids.get(item.nodeId) || item.nodeId,x:item.x+offset.x,y:item.y+offset.y,
    }));
    group.createdAt=group.updatedAt=Date.now();return [group];
  });
}

export function remapStudioGroupConnections(connections:StudioScene['connections'],entries:Array<[string,string]>,
  sourceGroups:StudioGroup[] | undefined,copiedGroups:StudioGroup[]):StudioScene['connections'] {
  const nodes=new Map(entries),groups=new Map<string,string>(),used=new Set<string>();
  for(const source of sourceGroups || []) {
    const members=source.nodeIds.map(id=>nodes.get(id));
    const copy=copiedGroups.find(group=>!used.has(group.id) && group.nodeIds.length===members.length && members.every(id=>id && group.nodeIds.includes(id)));
    if(copy) { groups.set(source.id,copy.id);used.add(copy.id); }
  }
  return connections.map(edge=>{
    const copy={...edge};
    for(const field of ['fromGroupId','toGroupId']) if(typeof copy[field]==='string') copy[field]=groups.get(copy[field]);
    for(const field of ['fromGroupNodeIds','toGroupNodeIds']) if(Array.isArray(copy[field])) {
      copy[field]=(copy[field] as string[]).map(id=>nodes.get(id)).filter(Boolean);
    }
    return copy;
  });
}
