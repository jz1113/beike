import { copyCanvasSpecialized } from './canvasNodeFactory';
import { syncEdgesWithNodeReferences } from './canvasGraph';
import { hideCoverBatchNodes } from './coverBatch';
import { canConnectStudioNodes, compilerSettings, studioEdgeSources, studioNodeKind, studioNodeMedia } from './studioConnections';
import { studioNodeToCanvasNode } from './studioSceneAdapter';
import type { CanvasNode, CanvasProject, StudioScene } from './types';

export type NativeCommerceKind = 'sales' | 'workshop' | 'poster';
export const nativeCommerceTitles: Record<NativeCommerceKind,string> = { sales: '商品短片', workshop: '商品图文', poster: '商品封面' };
export const commerceBriefPlaceholder = '填写商品名称、已核实卖点、受众与画面要求。封面请填写准确标题；视频请填写时长与是否需要口播。不要虚构功效或价格。';

const oldPosterGuide = '需要参考风格时，先上传封面样张，再将「封面风格参考」连接到绘图提示词或图片生成节点；不用样张时保持断开。';
const priorPosterGuide = '上传一张手机商品图 → 撰写封面提示词 → 生成封面 → 预览并下载。创作要求可选；下载沿用商品图原主文件名。';
const previousPosterGuide = '上传商品图 → 撰写提示词 → 生成封面 → 成图质检 → 下载。批量可上传 Excel 并在右上角运行，质检通过后下载当前批次 ZIP。';
const boardPosterGuide = '单张：上传商品图 → 撰写提示词 → 生成封面 → 成图质检 → 下载。批量：上传 Excel 后在右上角运行，成品保存后可直接下载当前批次 ZIP。';
const separateInputPosterGuide = '单张：上传商品图 → 撰写提示词 → 生成封面 → 成图质检 → 下载。Excel 批量的执行、成品预览和 ZIP 下载集中在右上角。';
const posterGuide = '在「商品素材」上传商品图或 Excel。单张沿画布生成并质检。批量从右上角执行、预览和下载 ZIP，两种方式共用画布中的文本和绘图模型。';
const splitPosterGuide = '上传商品图 → 撰写提示词 → 生成封面 → 成图质检 → 下载。Excel 请到下方的批量制作区上传。';

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
  const target = textOnly || kind === 'poster' ? nodeId : textStage;
  const linked = new Set(scene.connections.filter(edge => edge.to === target && (!edge.inputType || edge.inputType === 'default'))
    .flatMap(edge => studioEdgeSources(edge, scene)));
  const brief = scene.nodes.find(node => node.id === `${prefix}-brief` && linked.has(node.id));
  const body = brief && (compilerSettings(brief).text ?? brief.content);
  const hasBrief = typeof body === 'string' && Boolean(body.replace(commerceBriefPlaceholder, '').trim());
  const product = scene.nodes.find(node => linked.has(node.id) && (kind === 'poster'
    ? node.id !== `${prefix}-reference` && studioNodeKind(node) === 'image' && !node.isGenerating && !node.missingMedia && Boolean(studioNodeMedia(node).url)
    : node.id === `${prefix}-product`));
  const hasImage = product && studioNodeKind(product) === 'image' && !product.isGenerating && !product.missingMedia && studioNodeMedia(product).url;
  const missing = [!textOnly && !hasImage && '上传并连接商品参考图', kind !== 'poster' && !hasBrief && '填写并连接商品信息与创作要求'].filter(Boolean);
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
  const poster = kind === 'poster';
  node('product','input-image',poster ? '商品素材' : '商品参考图',80,100,'',{mediaType:'image', ...(poster && { beikeCoverSharedInput: true })});
  if (!poster) node('brief','text-node','商品信息与创作要求',80,500,'',{aiGenerated:true,text:commerceBriefPlaceholder});
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
    if (poster) node('design','text-node','封面提示词撰写',500,100,'',{beikeCoverPromptWriter:true,beikeTextResultRequired:true});
    else text('design','商品场景绘图提示词',500,100,'根据商品参考图与已核实事实，设计一张自然可信的电商场景图。保持商品外观，不添加虚构配件、价格和功效。明确构图、环境、光线、材质及商品位置。只输出一条可直接执行的中文生图提示词，不附分析或代码围栏。');
    link('product','design');
    if (!poster) link('brief','design');
    node('image','gen-image',poster?'商品封面生成':'商品场景图生成',920,100,poster?'按上游设计生成一张完整封面，精确呈现已确认标题，保持商品外观。':'按已确认绘图提示词生成商品场景图，保持商品参考图外观。',{ratio:poster?'3:4':'3:4',batchCount:1,beikeRequiredInputs:[`${id}-product`,`${id}-design`]});
    link('product','image');link('design','image');
    node('save','local-save',poster?'下载商品封面':'下载商品图片',poster ? 2100 : 1760,100);link('image','save');
    if (!poster) {
      node('preview','preview','场景图预览',1340,100);link('image','preview');
      text('copy','商品发布文案',500,500,'根据上游商品事实写简洁的标题、正文与话题标签。不得编造价格、促销、材质或功效。仅输出可发布的文案。');link('brief','copy');
      node('copy-save','local-save','下载发布文案',920,500);link('copy','copy-save');
    }
  }
  const project: CanvasProject = { id,title:nativeCommerceTitles[kind],createdAt:now,updatedAt:now,draft:false,nodes:[],nativeCommerce:{kind,version:1},
    studioScene:{nodes,connections,groups:[],strokes:[],textBoxes:[],view:poster ? {x:35,y:45,zoom:0.55} : {x:35,y:70,zoom:0.75}} };
  return poster ? addCoverWorkflowNodes(project, true) : project;
}

function addCoverWorkflowNodes(project: CanvasProject, fresh = false): CanvasProject {
  const { nativeCommerce, studioScene: scene } = project;
  if (!scene || !nativeCommerce || nativeCommerce.coverFlowNodes) return project;
  const nodes = [...scene.nodes];
  const renderCandidates = nodes.filter(node => node.type === 'gen-image' && node.id.endsWith('-image') &&
    nodes.some(source => source.id === node.id.replace(/-image$/, '-product')));
  const render = renderCandidates.find(node => node.id === project.id + '-image') ??
    (renderCandidates.length === 1 ? renderCandidates[0] : undefined);
  if (!render) return project;
  const id = render.id.slice(0, -'-image'.length);
  const find = (key: string) => nodes.find(node => node.id === `${id}-${key}`);
  const product = find('product')!;
  const save = find('save');
  const defaultWriter = find('design');
  const writer = coverWorkflowWriter(scene, render) ?? (defaultWriter &&
    compilerSettings(defaultWriter).beikeCoverPromptWriter === true ? defaultWriter : undefined);
  if (!writer) return project;
  const px = Number(product.x ?? 80);
  const py = Number(product.y ?? 100);
  const rx = Number(render.x ?? 920);
  const ry = Number(render.y ?? 100);
  const sx = Number(save?.x ?? rx + 785);
  const sy = Number(save?.y ?? ry);
  const connections = [...scene.connections];
  const targets = new Set<string>();
  const add = (key: string, type: string, title: string, x: number, y: number, width: number, height: number,
    settings: Record<string, unknown> = {}): StudioScene['nodes'][number] => {
    const existing = find(key);
    if (existing) return existing;
    const occupied = nodes.filter(node => !compilerSettings(node).beikeLayerHidden)
      .map(node => ({ x: Number(node.x ?? 80), y: Number(node.y ?? 100), width: Number(node.width ?? 340), height: Number(node.height ?? 300) }))
      .filter(rect => Object.values(rect).every(Number.isFinite) && x < rect.x + rect.width + 28 && x + width + 28 > rect.x)
      .sort((a, b) => a.y - b.y);
    for (const rect of occupied) {
      if (y < rect.y + rect.height + 52 && y + height + 52 > rect.y) y = rect.y + rect.height + 52;
    }
    const node = { id: `${id}-${key}`, type, nodeName: title, x, y, width, height, settings };
    nodes.push(node);
    return node;
  };
  const link = (source: StudioScene['nodes'][number], target: StudioScene['nodes'][number]) => {
    const { id: from } = source;
    const { id: to } = target;
    if (connections.some(edge => edge.from === from && edge.to === to)) return true;
    if (canConnectStudioNodes(source, target, connections) === false) return false;
    connections.push({ id: `${from}:${to}`, from, to });
    targets.add(to);
    return true;
  };

  const title = add('brief', 'text-node', '标题确认', px, py + 380, 300, 155);
  const titleSettings = compilerSettings(title);
  const stockTitle = title.nodeName === '商品信息与创作要求' &&
    (titleSettings.text ?? title.content) === commerceBriefPlaceholder;
  const updatedTitle = stockTitle ? {
    ...title, nodeName: '标题确认', content: '', settings: { ...titleSettings, text: '' },
  } : title;
  if (stockTitle) nodes[nodes.indexOf(title)] = updatedTitle;
  const reference = add('reference', 'input-image', '封面风格参考（可选）', px, py + 610, 280, 220, { mediaType: 'image' });
  const layout = add('cover-layout', 'preview', '版式候选', rx, ry + 400, 250, 310, { beikeCoverStage: 'layout' });
  const compare = add('cover-compare', 'image-compare', '成图对照', fresh ? rx + 385 : Math.min(rx + 385, sx - 380),
    fresh ? ry : ry + 380, 340, 300, { beikeCoverStage: 'compare' });
  const review = add('cover-review', 'preview', '成图质检', fresh ? rx + 785 : sx,
    fresh ? ry : sy + 380, 300, 250, { beikeCoverStage: 'review' });
  link(updatedTitle, writer);
  link(reference, writer);
  link(reference, layout);
  link(writer, layout);
  link(render, layout);
  link(render, compare);
  link(compare, review);
  if (save) {
    const direct = connections.findIndex(edge => edge.from === render.id && edge.to === save.id &&
      !edge.fromGroupId && !(Array.isArray(edge.fromGroupNodeIds) && edge.fromGroupNodeIds.length) && (!edge.inputType || edge.inputType === 'default'));
    if (direct >= 0 && link(review, save)) {
      connections.splice(direct, 1);
      targets.add(save.id);
    }
  }

  const studioScene = { ...scene, nodes, connections };
  const next = { ...project, nativeCommerce: { ...nativeCommerce, coverFlowNodes: true as const }, studioScene };
  if (!project.nodes.length) return next;
  const canvasNodes = project.nodes.map(node => {
    if (stockTitle && node.id === title.id && (!node.content || node.content === commerceBriefPlaceholder)) {
      return { ...node, title: '标题确认', content: '', studioRaw: updatedTitle };
    }
    if (!targets.has(node.id)) return node;
    const refs = [...new Set(connections.filter(edge => edge.to === node.id).flatMap(edge => studioEdgeSources(edge, studioScene)))];
    return { ...node, referenceNodeIds: refs };
  });
  canvasNodes.push(...[updatedTitle, reference, layout, compare, review].filter(raw => !canvasNodes.some(node => node.id === raw.id))
    .map(raw => studioNodeToCanvasNode(raw, studioScene, project.createdAt)));
  return { ...next, nodes: canvasNodes, edges: syncEdgesWithNodeReferences(canvasNodes, project.edges) };
}

export function coverWorkflowWriter(scene: StudioScene, render: StudioScene['nodes'][number]) {
  const upstreamIds = new Set(scene.connections.filter(edge => edge.to === render.id && (!edge.inputType || edge.inputType === 'default'))
    .flatMap(edge => studioEdgeSources(edge, scene)));
  const writers = scene.nodes.filter(node => upstreamIds.has(node.id) && node.type === 'text-node' &&
    compilerSettings(node).beikeCoverPromptWriter === true);
  return writers.length === 1 ? writers[0] : undefined;
}

function unifyCoverInputs(project: CanvasProject): CanvasProject {
  const scene = project.studioScene;
  if (!scene) return project;
  const product = scene.nodes.find(node => node.id === project.id + '-product') ??
    scene.nodes.find(node => node.type === 'input-image' && node.id.endsWith('-product') &&
      scene.nodes.some(render => render.id === node.id.replace(/-product$/, '-image') && render.type === 'gen-image'));
  const upload = product && scene.nodes.find(node => node.id === product.id.replace(/-product$/, '-cover-check') &&
    (compilerSettings(node).beikeCoverStage === 'check' ||
      (node.type === 'input-image' && (node.nodeName === '商品图上传' || compilerSettings(node).beikeCoverProductUpload === true))));
  const replacements = new Map<string, StudioScene['nodes'][number]>();
  const affected = new Set<string>();
  const dedicated = upload?.type === 'input-image' && compilerSettings(upload).beikeCoverStage !== 'check';
  if (product && (compilerSettings(product).beikeCoverSharedInput !== true || upload)) {
    const input = dedicated ? upload : product;
    const media = studioNodeMedia(input);
    const settings = { ...compilerSettings(product) };
    if (dedicated) {
      // The dedicated upload was the live single-image input. Its empty state supersedes any
      // image left behind on the Excel card by an older version.
      for (const key of ['_blobUrl', 'imageUrl', '_localCacheAssetId', '_contentAssetId', '_assetId', 'generatedImages', 'generationVersions']) {
        delete settings[key];
      }
      settings.beikeOriginalFileName = compilerSettings(input).beikeOriginalFileName;
    }
    replacements.set(product.id, { ...product, nodeName: '商品素材', content: media.url || undefined,
      imageUrl: media.url || undefined, _contentAssetId: media.assetId, assetId: undefined, missingMedia: input.missingMedia,
      settings: { ...settings, beikeCoverSharedInput: true } });
  }
  for (const node of scene.nodes) {
    const settings = compilerSettings(node);
    const isTitle = settings.beikeCoverStage === 'title';
    const required = settings.beikeRequiredInputs;
    const moved = upload && product && Array.isArray(required) && required.includes(upload.id);
    if (!isTitle && !moved) continue;
    const next = { ...settings };
    if (isTitle) delete next.beikeCoverStage;
    if (moved) next.beikeRequiredInputs = [...new Set(required.map(id => id === upload.id ? product.id : id))];
    replacements.set(node.id, { ...node, settings: next });
  }
  if (!replacements.size && !upload) return project;
  let connections = scene.connections;
  let groups = scene.groups;
  if (upload && product) {
    const seen = new Set<string>();
    const replace = (id: string) => id === upload.id ? product.id : id;
    groups = groups.map(group => {
      const entry = group as { nodeIds?: string[] } | null;
      return entry?.nodeIds?.includes(upload.id) ? { ...entry, nodeIds: entry.nodeIds.filter(id => id !== upload.id) } : group;
    });
    connections = connections.flatMap(edge => {
      const groupIds = studioEdgeSources(edge, scene);
      if (edge.to === upload.id) return [];
      const from = replace(edge.from);
      if (from === edge.to) return [];
      if (edge.from === upload.id || groupIds.includes(upload.id)) affected.add(edge.to);
      const grouped = Boolean(edge.fromGroupId || Array.isArray(edge.fromGroupNodeIds));
      if (from === product.id && !grouped) {
        const key = JSON.stringify([edge.to, edge.inputType || 'default']);
        if (seen.has(key)) return [];
        seen.add(key);
      }
      if (from === edge.from && !groupIds.includes(upload.id)) return [edge];
      return [{ ...edge, from, ...(grouped ? { fromGroupNodeIds: [...new Set(groupIds.map(replace))] } : {}) }];
    });
  }
  const studioScene = { ...scene, nodes: scene.nodes.filter(node => node.id !== upload?.id).map(node => replacements.get(node.id) ?? node),
    connections, groups };
  const nodes = project.nodes.filter(node => node.id !== upload?.id).map(node => {
    const raw = replacements.get(node.id);
    if (raw && node.id === product?.id) return studioNodeToCanvasNode(raw, studioScene, node.createdAt);
    const next = raw ? { ...node, studioRaw: raw } : node;
    if (!affected.has(node.id)) return next;
    const refs = [...new Set(connections.filter(edge => edge.to === node.id).flatMap(edge => studioEdgeSources(edge, studioScene)))];
    return { ...next, referenceNodeIds: refs };
  });
  return { ...project, studioScene, nodes, edges: project.nodes.length ? syncEdgesWithNodeReferences(nodes, project.edges) : project.edges };
}

/** Keep the former scene and backing business records; never cancel submitted tasks during migration. */
export function upgradeNativeCommerceProject(project:CanvasProject):CanvasProject {
  if (project.nativeCommerce?.kind === 'poster' && project.studioScene) {
    project = restorePosterUploadNode(project);
    const savedScene = project.studioScene!;
    let scene = hideCoverBatchNodes(savedScene);
    if (scene !== savedScene) {
      const changed = new Map(scene.nodes.flatMap((node, index) =>
        node === savedScene.nodes[index] ? [] : [[node.id, node] as const]));
      const source = scene.nodes.find(node => node.id === project.id + '-product');
      const mainBottom = Math.max(0, ...scene.nodes.filter(node => !compilerSettings(node).beikeLayerHidden && !compilerSettings(node).beikeFoldedInGroupId)
        .map(node => (Number(node.y) || 0) + (Number(node.height) || 300)));
      const recoverView = (view: StudioScene['view']) =>
        source && view?.zoom > 0 && -view.y / view.zoom >= mainBottom
          ? { x: 80 - (Number(source.x) || 0) * view.zoom, y: 100 - (Number(source.y) || 0) * view.zoom, zoom: view.zoom }
          : view;
      scene = { ...scene, view: recoverView(scene.view) };
      project = { ...project, viewport: project.viewport && recoverView(project.viewport), nodes: project.nodes.map(node => {
        const raw = changed.get(node.id);
        return raw ? { ...node, studioRaw: raw, layerHidden: true } : node;
      }) };
    }
    const referenceId = project.id + '-reference';
    const nodes = scene.nodes.filter(node => node.id !== referenceId || studioNodeMedia(node).url ||
      scene.connections.some(edge => edge.from === referenceId || edge.to === referenceId));
    const guideId = project.id + '-guide';
    const guide = nodes.find(node => node.id === guideId);
    const previousGuides = [oldPosterGuide, priorPosterGuide, previousPosterGuide, boardPosterGuide, separateInputPosterGuide];
    if (!guide || !previousGuides.includes(String(compilerSettings(guide).text))) {
      return unifyCoverInputs(addCoverWorkflowNodes({ ...project, studioScene: { ...scene, nodes } }));
    }
    const updatedGuide = { ...guide, nodeName: '封面制作步骤', settings: { ...compilerSettings(guide), text: posterGuide } };
    return unifyCoverInputs(addCoverWorkflowNodes({ ...project,
      studioScene: { ...scene, nodes: nodes.map(node => node.id === guideId ? updatedGuide : node) },
      nodes: project.nodes.map(node => node.id === guideId && previousGuides.includes(node.content || '')
        ? { ...node, content: posterGuide, studioRaw: updatedGuide } : node),
    }));
  }
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
  return {...project,nodes:[],edges:undefined,nativeCommerce:{...next.nativeCommerce!,legacyScene:scene},studioScene:{...next.studioScene!,nodes:[...next.studioScene!.nodes,...outputs.map((node,index)=>({...node,x:80+index*380,y:1400}))]}};
}

/** Restore workbooks that may have already been saved while the split canvas was open. */
function restorePosterUploadNode(project: CanvasProject): CanvasProject {
  const scene = project.studioScene!;
  const splitId = project.id + '-cover-batch';
  const split = scene.nodes.find(node => node.id === splitId);
  const productId = project.id + '-product';
  if (!split || !scene.nodes.some(node => node.id === productId)) return project;
  const guideId = project.id + '-guide';
  const batch = compilerSettings(split).beikeCoverBatch;
  const changes = new Map<string, StudioScene['nodes'][number]>();
  const nodes = scene.nodes.filter(node => node.id !== splitId).map(node => {
    const settings = compilerSettings(node);
    let next: Record<string, unknown> | undefined;
    if (node.id === productId && batch && !settings.beikeCoverBatch) next = { ...settings, beikeCoverBatch: batch };
    else if (node.id === guideId && settings.text === splitPosterGuide) next = { ...settings, text: posterGuide };
    if (!next) return node;
    const restored = { ...node, settings: next };
    changes.set(node.id, restored);
    return restored;
  });
  return {
    ...project,
    studioScene: { ...scene, nodes, connections: scene.connections.filter(edge => edge.from !== splitId && edge.to !== splitId) },
    nodes: project.nodes.filter(node => node.id !== splitId).map(node => {
      const raw = changes.get(node.id);
      if (!raw) return node;
      return { ...node, studioRaw: raw,
        ...(node.id === guideId && node.content === splitPosterGuide ? { content: posterGuide } : {}),
      };
    }),
    edges: project.edges?.filter(edge => edge.sourceNodeId !== splitId && edge.targetNodeId !== splitId),
  };
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
