import type { CanvasProject, StudioScene } from './types';

export type NativeCommerceKind = 'sales' | 'workshop' | 'poster';
export const nativeCommerceTitles: Record<NativeCommerceKind,string> = { sales: '商品短片', workshop: '商品图文', poster: '商品封面' };

/** Use the editor's existing upload, text, image/video/audio, preview and download nodes. */
export function createNativeCommerceProject(kind: NativeCommerceKind, id: string, now: number): CanvasProject {
  const nodes: StudioScene['nodes'] = [], connections: StudioScene['connections'] = [];
  const node = (key:string,type:string,title:string,x:number,y:number,prompt='',settings:Record<string,unknown>={}) => {
    nodes.push({ id:`${id}-${key}`, type, nodeName:title, x,y, width:340,height:300,prompt,settings });
  };
  const link = (from:string,to:string) => connections.push({ id:`${id}-${from}-${to}`,from:`${id}-${from}`,to:`${id}-${to}` });
  const text = (key:string,title:string,x:number,y:number,prompt:string) => node(key,'text-node',title,x,y,prompt,{textNodeComposerPromptExpanded:true,beikeTextResultRequired:true});
  node('product','input-image','商品参考图',80,100,'',{mediaType:'image'});
  node('brief','text-node','商品信息与创作要求',80,500,'',{aiGenerated:true,text:'填写商品名称、已核实卖点、受众与画面要求。封面请填写准确标题；视频请填写时长与是否需要口播。不要虚构功效或价格。'});
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
  if(scene.nodes.some(node=>node.isGenerating || (node.settings as Record<string,unknown>)?.beikeBusinessState==='running'))return project;
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
  return {...project,nativeCommerce:{kind,version:1,legacyScene:scene},studioScene:{...next.studioScene!,nodes:[...next.studioScene!.nodes,...outputs.map((node,index)=>({...node,x:80+index*380,y:1400}))]}};
}
