import { copyCanvasSpecialized } from './canvasNodeFactory';
import { compilerSettings, studioEdgeSources, studioNodeKind, studioNodeMedia } from './studioConnections';
import type { CanvasNode, CanvasProject, StudioScene } from './types';

export type NativeCommerceKind = 'sales' | 'workshop' | 'poster';
export const nativeCommerceTitles: Record<NativeCommerceKind,string> = { sales: '商品短片', workshop: '商品图文', poster: '商品封面' };
const commerceBriefPlaceholder = '填写商品名称、已核实卖点、受众与画面要求。封面请填写准确标题；视频请填写时长与是否需要口播。不要虚构功效或价格。';

export function validateNativeCommerceInputs(project: CanvasProject | undefined, nodeId: string) {
  const scene = project?.studioScene;
  const kind = project?.nativeCommerce?.kind;
  if (!kind || !scene) return;
  const stages = kind === 'sales' ? ['script', 'keyframe', 'video', 'spoken'] : ['design', 'image', 'copy'];
  const stage = stages.find(key => nodeId.endsWith('-' + key));
  if (!stage) return;
  const prefix = nodeId.slice(0, -stage.length - 1);
  const textStage = prefix + (kind === 'sales' ? '-script' : '-design');
  const textOnly = stage === 'spoken' || stage === 'copy';
  const target = textOnly ? nodeId : textStage;
  const linked = new Set(scene.connections.filter(edge => edge.to === target && (!edge.inputType || edge.inputType === 'default'))
    .flatMap(edge => studioEdgeSources(edge, scene)));
  const brief = scene.nodes.find(node => node.id === `${prefix}-brief` && linked.has(node.id));
  const body = brief && (compilerSettings(brief).text ?? brief.content);
  const hasBrief = typeof body === 'string' && Boolean(body.replace(/\s/g, '').replace(commerceBriefPlaceholder, ''));
  const product = scene.nodes.find(node => node.id === `${prefix}-product` && linked.has(node.id));
  const hasImage = product && studioNodeKind(product) === 'image' && !product.isGenerating && !product.missingMedia && studioNodeMedia(product).url;
  const missing = [!textOnly && !hasImage && '上传并连接商品参考图', !hasBrief && '填写并连接商品信息与创作要求'].filter(Boolean);
  if (missing.length) throw new Error(`请先${missing.join('，再')}`);
}

export function isNativeCommerceKind(kind: string): kind is NativeCommerceKind {
  return Object.hasOwn(nativeCommerceTitles, kind);
}

/** Use the editor's existing upload, text, image/video/audio, preview and download nodes. */
export function createNativeCommerceProject(kind: NativeCommerceKind, id: string, now: number): CanvasProject {
  const nodes: StudioScene['nodes'] = [], connections: StudioScene['connections'] = [];
  const node = (key:string,type:string,title:string,x:number,y:number,prompt='',settings:Record<string,unknown>={}) => {
    nodes.push({ id:`${id}-${key}`, type, nodeName:title, x,y, width:340,height:300,prompt,settings });
  };
  const link = (from:string,to:string) => connections.push({ id:`${id}-${from}-${to}`,from:`${id}-${from}`,to:`${id}-${to}` });
  const text = (key:string,title:string,x:number,y:number,prompt:string) => node(key,'text-node',title,x,y,prompt,{textNodeComposerPromptExpanded:true,beikeTextResultRequired:true});
  node('product','input-image','商品参考图',80,100,'',{mediaType:'image'});
  node('brief','text-node','商品信息与创作要求',80,500,'',{aiGenerated:true,text:commerceBriefPlaceholder});
  if(kind==='sales') {
    text('script','商品短片分镜',500,100,'根据商品图与上游事实制作一条短视频分镜。保持同一商品外观，明确动作、镜头、时长与声音；不编造卖点。只输出一条可直接给视频模型执行的完整中文提示词，不附分析、表格或代码围栏。默认5秒竖屏产品展示，用户要求优先。');
    link('product','script');link('brief','script');
    node('keyframe','gen-image','商品短片首帧',920,100,'依据商品参考与已确认分镜制作一张竖版首帧，保持商品外观。只画第一瞬间，不生成多格分镜或文字说明。',{ratio:'9:16',batchCount:1,beikeRequiredInputs:[`${id}-product`,`${id}-script`]});
    link('product','keyframe');link('script','keyframe');
    node('video','gen-video','商品短片生成',1340,100,'执行上游分镜，以参考图为首帧，保持商品结构、颜色和标识。动作自然，禁止变形；声音遵循分镜。',{ratio:'9:16',duration:'5s',beikeVideoMode:'first_frame',beikeRequiredInputs:[`${id}-keyframe`,`${id}-script`]});
    link('keyframe','video');link('script','video');
    text('spoken','独立旁白文案（可选）',500,500,'依据商品事实写一条与本片时长相符的简短旁白，仅输出可直接朗读的正文。不得附镜头说明、时间码或标签；不要虚构商品功效或价格。');
    link('brief','spoken');
    node('voice','gen-speech','旁白配音（可选）',920,500);link('spoken','voice');
    node('voice-save','local-save','下载独立旁白',1340,500);link('voice','voice-save');
    node('spoken-save','local-save','下载旁白文稿',920,900);link('spoken','spoken-save');
    node('preview','preview','短片预览',1760,100);link('video','preview');
    node('save','local-save','下载商品短片',2180,100);link('video','save');
  } else {
    const poster=kind==='poster';
    if(poster) { node('reference','input-image','封面风格参考（可选）',80,900,'',{mediaType:'image'}); }
    text('design',poster?'封面绘图提示词':'商品场景绘图提示词',500,100,poster
      ? '根据商品参考图与准确标题设计一张中文封面。保持商品结构、颜色和标识；标题醒目且准确，布局留白清晰，不添加未核实信息。只输出一条完整中文绘图提示词，可直接给图片模型执行，不附分析或代码围栏。默认3:4竖版。'
      : '根据商品参考图与已核实事实，设计一张自然可信的电商场景图。保持商品外观，不添加虚构配件、价格和功效。明确构图、环境、光线、材质及商品位置。只输出一条可直接执行的中文生图提示词，不附分析或代码围栏。');
    link('product','design');link('brief','design');
    node('image','gen-image',poster?'商品封面生成':'商品场景图生成',920,100,poster?'按上游设计生成一张完整封面，精确呈现已确认标题，保持商品外观。':'按已确认绘图提示词生成商品场景图，保持商品参考图外观。',{ratio:poster?'3:4':'3:4',batchCount:1,beikeRequiredInputs:[`${id}-product`,`${id}-design`]});
    link('product','image');link('design','image');
    node('preview','preview',poster?'封面预览':'场景图预览',1340,100);link('image','preview');
    node('save','local-save',poster?'下载商品封面':'下载商品图片',1760,100);link('image','save');
    if(poster) {
      // An optional reference stays disconnected until the user supplies it.
      // Connecting an empty upload would incorrectly block every generation.
      node('guide','text-node','风格参考的用法',500,900,'',{aiGenerated:true,text:'需要参考风格时，先上传封面样张，再将「封面风格参考」连接到绘图提示词或图片生成节点；不用样张时保持断开。'});
    } else {
      text('copy','商品发布文案',500,500,'根据上游商品事实写简洁的标题、正文与话题标签。不得编造价格、促销、材质或功效。仅输出可发布的文案。');link('brief','copy');
      node('copy-save','local-save','下载发布文案',920,500);link('copy','copy-save');
    }
  }
  return { id,title:nativeCommerceTitles[kind],createdAt:now,updatedAt:now,draft:false,nodes:[],nativeCommerce:{kind,version:1},
    studioScene:{nodes,connections,groups:[],strokes:[],textBoxes:[],view:{x:35,y:70,zoom:0.75}} };
}

/** Keep the former scene and backing business records; never cancel submitted tasks during migration. */
export function upgradeNativeCommerceProject(project:CanvasProject):CanvasProject {
  if(project.nativeCommerce || !project.studioScene || !(project.sales||project.workshop||project.poster))return project;
  const scene=project.studioScene;
  const kind=project.sales?'sales':project.workshop?'workshop':'poster';
  const next=createNativeCommerceProject(kind,project.id,project.createdAt);
  const draft=project.sales?.draft && typeof project.sales.draft==='object' ? project.sales.draft as Record<string,unknown> : undefined;
  if(draft) {
    const brief=next.studioScene!.nodes.find(node=>node.id===`${project.id}-brief`)!;
    const facts=['productName','brand','category','audience','sellingPoints','props'].flatMap(key=>typeof draft[key]==='string' && draft[key] ? [`${key}: ${draft[key]}`] : []);
    if(facts.length) brief.settings={aiGenerated:true,text:facts.join('\n')};
    const images=Array.isArray(draft.imageCatalog)?draft.imageCatalog:[];
    const source=images.find(image=>image && typeof image==='object' && typeof image.url==='string');
    if(source) next.studioScene!.nodes.find(node=>node.id===`${project.id}-product`)!.content=source.url;
  }
  const outputs=scene.nodes.filter(node=>(node.settings as Record<string,unknown>)?.beikeBusinessOutput);
  return {...project,nodes:[],edges:undefined,nativeCommerce:{kind,version:1,legacyScene:scene},studioScene:{...next.studioScene!,nodes:[...next.studioScene!.nodes,...outputs.map((node,index)=>({...node,x:80+index*380,y:1400}))]}};
}

export type LegacyCommerceOutput = {
  id: string;
  title: string;
  type: 'image' | 'video' | 'audio' | 'text';
  value: string;
};

export function appendLegacyCommerceOutputs(project: CanvasProject, outputs: LegacyCommerceOutput[]): StudioScene | undefined {
  const scene = project.studioScene;
  if (!scene) return;
  const known = new Set(scene.nodes.map(node => (node.settings as Record<string, unknown> | undefined)?.beikeBusinessOutputId));
  const hidden = new Set([...(project.sales?.hiddenOutputIds ?? []), ...(project.workshop?.hiddenOutputIds ?? [])]);
  const nodes = outputs.flatMap((output, index) => {
    if (!output.value || known.has(output.id) || hidden.has(output.id)) return [];
    known.add(output.id);
    const settings = { beikeBusinessOutput: true, beikeBusinessOutputId: output.id };
    return [{
      id: `${project.id}-legacy-${output.id}`, nodeName: output.title,
      x: 80 + (index % 5) * 380, y: 1450 + Math.floor(index / 5) * 340, width: 340, height: 280,
      ...(output.type === 'text' ? { type: 'text-node', content: output.value, settings: { ...settings, text: output.value, aiGenerated: true } }
        : { type: 'input-image', content: output.value, settings: { ...settings, mediaType: output.type } }),
    }];
  });
  if (nodes.length) return { ...scene, nodes: [...scene.nodes, ...nodes] };
}

export type CanvasProjectOrder = 'updated' | 'created' | 'title';
export type CanvasProjectPeriod = 'all' | 'week' | 'month';

export function filterCanvasProjects(projects: CanvasProject[], options: { query: string; order: CanvasProjectOrder; period: CanvasProjectPeriod }, now = Date.now()) {
  const query = options.query.trim().toLocaleLowerCase();
  const days = options.period === 'week' ? 7 : options.period === 'month' ? 30 : Infinity;
  return projects.filter(project => (!query || project.title.toLocaleLowerCase().includes(query)) && project.updatedAt >= now - days * 86400000)
    .sort((a, b) => options.order === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : (options.order === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt));
}

export function uniqueCanvasProjectTitle(title:string, projects:Pick<CanvasProject,'id'|'title'>[], excludeId?:string):string {
  const base=(title || '').trim().slice(0,40)||'未命名画布';
  const used=new Set(projects.filter(project=>project.id!==excludeId).map(project=>(project.title || '').trim().normalize('NFKC').toLocaleLowerCase()));
  if(!used.has(base.normalize('NFKC').toLocaleLowerCase()))return base;
  for(let index=2;;index++) {
    const suffix=` · ${String(index).padStart(2,'0')}`, candidate=base.slice(0,40-suffix.length)+suffix;
    if(!used.has(candidate.normalize('NFKC').toLocaleLowerCase()))return candidate;
  }
}

export function normalizeCanvasProjectTitles(projects:CanvasProject[]):CanvasProject[] {
  const aliases:Record<string,string>={'电商视频画布':'商品短片','电商图文画布':'商品图文','封面画布':'商品封面','W3 视频复刻 · 电商视频':'视频复刻 · 四图替换','深度视频复刻 · 电商视频':'视频复刻 · 深度动作'};
  const mapped=projects.map(project=>{
    const title=Object.hasOwn(aliases,project.title)?aliases[project.title]:(project.title?.trim()?project.title:'未命名画布');
    return title===project.title?project:{...project,title};
  });
  const kept:CanvasProject[]=[];
  return mapped.map(project=>{
    const duplicate=kept.some(previous=>previous.title.trim().normalize('NFKC').toLocaleLowerCase()===(project.title || '').trim().normalize('NFKC').toLocaleLowerCase());
    const next=duplicate?{...project,title:uniqueCanvasProjectTitle(project.title,[...mapped.filter(row=>row.id!==project.id),...kept])}:project;
    kept.push(next);return next;
  });
}

export function cloneCanvasProject(project: CanvasProject, id: string, now = Date.now()): CanvasProject {
  const copy = structuredClone(project);
  copy.id = id;
  if (copy.sales) copy.sales = { ...copy.sales, draftId: id };
  if (project.workshop) copy.workshop = { sourceBatchId: project.workshop.batchId || project.workshop.sourceBatchId, ...(project.workshop.hiddenOutputIds ? { hiddenOutputIds: [...project.workshop.hiddenOutputIds] } : {}) };
  copy.title = project.title.slice(0, 37) + ' 副本';
  copy.draft = false;
  copy.createdAt = copy.updatedAt = now;
  const copyStudioNode = (node: StudioScene['nodes'][number]): StudioScene['nodes'][number] => ({
    ...node, beikePromptOperationId:undefined,beikePromptRecoveryRequired:undefined,beikePromptOptimizing:false,beikeTextOperationId:undefined,beikeTextRecoveryRequired:undefined, beikeSpeechOperationId:undefined, beikeSpeechRecoveryRequired:undefined, beikeTaskId: undefined, beikeTaskRecord:undefined,beikeLastTaskId:undefined, beikeTaskStopped:undefined, beikeLastTaskPrompt:undefined, beikeLastTaskSettings:undefined, isGenerating: false,
    beikeCanvasTaskId: undefined, beikeCanvasTaskRecord: undefined,
    settings: { ...(node.settings as object || {}), isGenerating: false,
      ...(node.settings && typeof node.settings === 'object' && 'beikeSpecialized' in node.settings ? {beikeSpecialized:copyCanvasSpecialized(node.settings.beikeSpecialized as CanvasNode['specialized'])} : {}),
      textNodeIsAnalyzing:false,beikeTextRunError:undefined,_executeTrigger: undefined, _agentRunning: false, _preGenerateSnapshot: undefined },
  });
  copy.nodes = copy.nodes.map(node => ({ ...node, specialized: copyCanvasSpecialized(node.specialized), taskId: undefined, generationIntent: undefined, promptOperationId:undefined,promptRecoveryRequired:undefined,textOperationId:undefined,textRecoveryRequired:undefined, speechOperationId:undefined, speechRecoveryRequired:undefined, layerOperationId:undefined, layerRetryAllowed:undefined, layerPrompt:undefined, layerSourceNodeId:undefined, layerTask:undefined,
    ...(node.studioRaw ? { studioRaw: copyStudioNode(node.studioRaw) } : {}),
    status: node.status === 'generating' ? node.imageUrl || node.videoUrl || node.audioUrl ? 'success' : 'idle' : node.status }));
  if (copy.studioScene) copy.studioScene.nodes = copy.studioScene.nodes.map(copyStudioNode);
  return copy;
}
