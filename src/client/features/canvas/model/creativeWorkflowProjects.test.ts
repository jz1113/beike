import { describe, expect, it } from 'vitest';
import {
  cloneCanvasProject,
  createNativeCommerceProject,
  filterCanvasProjects,
  normalizeCanvasProjectTitles,
  uniqueCanvasProjectTitle,
  upgradeNativeCommerceProject,
  validateNativeCommerceInputs,
} from './creativeWorkflowProjects';
import { resolveStudioInputs } from './studioConnections';
import { appendCoverBatch, coverComparisonInputs, coverLayoutPreview, getCoverBatch } from './coverBatch';
import {
  studioSceneToCanvasGraph,
  syncCanvasGraphToStudioScene,
} from './studioSceneAdapter';
import type { CanvasProject } from './types';
import { createVideoWorkflowProject } from './videoWorkflowProjects';
import { preflightW3Copy, w3CopyInputKey } from './w3CopyRunner';

const now = 1793756000000;
const day = 86400000;
const projects: CanvasProject[] = [
  { id: 'older', title: '旧海报', createdAt: now - 60 * day, updatedAt: now - 40 * day, nodes: [] },
  { id: 'edited', title: '秋日海报', createdAt: now - 50 * day, updatedAt: now - day, nodes: [] },
  { id: 'new', title: '新品视频', createdAt: now - 10 * day, updatedAt: now - 8 * day, nodes: [] },
];
describe('canvas asset listing', () => {
  it('combines title search and modification date without hiding an older project edited recently', () => {
    expect(filterCanvasProjects(projects, { query: '  海报  ', period: 'week', order: 'updated' }, now).map(p => p.id)).toEqual(['edited']);
  });
  it('sorts by creation time separately from modification time, without mutating the source', () => {
    expect(filterCanvasProjects(projects, { query: '', period: 'month', order: 'created' }, now).map(p => p.id)).toEqual(['new', 'edited']);
    expect(projects.map(p => p.id)).toEqual(['older', 'edited', 'new']);
  });
  it('keeps every project in the all-time view', () => {
    expect(filterCanvasProjects(projects, { query: '', period: 'all', order: 'updated' }, now).map(p => p.id)).toEqual(['edited', 'new', 'older']);
  });
});

it('avoids future reserved names and keeps custom names stable',()=>{
 const list=['电商视频画布','电商视频画布','商品短片 · 02','我的成片'].map((title,index)=>({...createNativeCommerceProject('sales',String(index),1),title}));
 const named=normalizeCanvasProjectTitles(list);
 expect(named.map(row=>row.title)).toEqual(['商品短片','商品短片 · 03','商品短片 · 02','我的成片']);
 expect(normalizeCanvasProjectTitles(named)).toEqual(named);
 expect(uniqueCanvasProjectTitle('商品短片',named)).toBe('商品短片 · 04');
});
it('handles normalized collisions and limits complete suffixed names',()=>{
 expect(uniqueCanvasProjectTitle('Ａ',[{id:'a',title:'A'}])).toBe('Ａ · 02');
 const title='测'.repeat(40);
 expect(uniqueCanvasProjectTitle(title,[{id:'a',title}])).toHaveLength(40);
});

it('preserves custom titles that match inherited object properties',()=>{
 const list=['constructor','toString'].map((title,index)=>({...createNativeCommerceProject('sales',String(index),1),title}));
 expect(normalizeCanvasProjectTitles(list)).toEqual(list);
});

it('tolerates missing titles in legacy project records',()=>{
 expect(uniqueCanvasProjectTitle('商品封面',[{id:'old'} as never])).toBe('商品封面');
 expect(uniqueCanvasProjectTitle(undefined as never,[])).toBe('未命名画布');
 const list=[
  {...createNativeCommerceProject('sales','old',1),title:undefined as never},
  {...createNativeCommerceProject('sales','blank',1),title:'   '},
  {...createNativeCommerceProject('sales','custom',1),title:'我的成片'},
 ];
 const normalized=normalizeCanvasProjectTitles(list);
 expect(normalized.map(project=>project.title)).toEqual(['未命名画布','未命名画布 · 02','我的成片']);
 expect(normalizeCanvasProjectTitles(normalized)).toEqual(normalized);
 expect(list[0].title).toBeUndefined();
 expect(normalized[0].nodes).toBe(list[0].nodes);
});

it('copies the complete graph and result versions without retaining an active generation', () => {
  const source: CanvasProject = {id:'original', title:'已有项目', createdAt:1, updatedAt:2,
    nodes:[{id:'legacy',type:'image',createdAt:1,x:0,y:0,width:200,height:200,imageUrl:'/storage/image.png',status:'generating',taskId:'old-task',speechOperationId:'old-speech',speechRecoveryRequired:true,layerOperationId:'layer-original',layerSourceNodeId:'source',layerTask:true,
      studioRaw:{id:'legacy',type:'gen-image',beikeCanvasTaskId:'old-task',beikeCanvasTaskRecord:{id:'old-task'}}}],
    edges:[{id:'edge',sourceNodeId:'legacy',targetNodeId:'target'}],
    studioScene:{nodes:[{id:'result',type:'gen-video',content:'/storage/v1.mp4',beikeSpeechOperationId:'studio-speech',beikeSpeechRecoveryRequired:true,isGenerating:true,beikeTaskId:'active-task',beikeLastTaskId:'active-task',beikeTaskStopped:true,beikeTaskRecord:{id:'original'},beikeCanvasTaskId:'manual',beikeCanvasTaskRecord:{id:'manual'},
      settings:{isGenerating:true,_executeTrigger:123,_agentRunning:true,_preGenerateSnapshot:true,activeGenerationVersionIndex:0,generationVersions:[{content:'/storage/v1.mp4'},{content:'/storage/v2.mp4'}]}}],
      connections:[{id:'link',from:'input',to:'result'}],groups:[{id:'group'}],textBoxes:[{id:'note'}],strokes:[{points:[1,2]}],view:{x:12,y:34,zoom:.5}},
  };
  const copy = cloneCanvasProject(source,'copy',100);
  expect(copy).toMatchObject({id:'copy',title:'已有项目 副本',createdAt:100,updatedAt:100});
  expect(copy.studioScene?.connections).toEqual(source.studioScene?.connections);
  expect(copy.studioScene?.nodes[0]).toMatchObject({isGenerating:false,beikeSpeechOperationId:undefined,beikeSpeechRecoveryRequired:undefined,beikeTaskId:undefined,beikeLastTaskId:undefined,beikeTaskStopped:undefined,beikeTaskRecord:undefined,content:'/storage/v1.mp4',
    settings:{isGenerating:false,activeGenerationVersionIndex:0,generationVersions:[{content:'/storage/v1.mp4'},{content:'/storage/v2.mp4'}]}});
  expect(copy.nodes[0]).toMatchObject({status:'success',taskId:undefined,speechOperationId:undefined,speechRecoveryRequired:undefined,layerOperationId:undefined,layerSourceNodeId:undefined,layerTask:undefined});
  expect(copy.nodes[0].studioRaw).toMatchObject({beikeCanvasTaskId:undefined,beikeCanvasTaskRecord:undefined});
  expect(copy.studioScene!.nodes[0]).toMatchObject({beikeCanvasTaskId:undefined,beikeCanvasTaskRecord:undefined});
  expect(copy.studioScene!.nodes[0].settings).toMatchObject({_executeTrigger:undefined,_agentRunning:false,_preGenerateSnapshot:undefined});
  copy.studioScene!.nodes[0].content = '/storage/changed.mp4';
  expect(source.studioScene!.nodes[0].content).toBe('/storage/v1.mp4');
  expect(source.studioScene!.nodes[0].beikeTaskId).toBe('active-task');
});

describe('native commerce workflows',()=>{
  it.each([['sales', 'script', 'keyframe'], ['workshop', 'design', 'image'], ['poster', 'design', 'image']] as const)(
    'checks linked product media and edited facts before %s submissions', (kind, text, image) => {
      const project = createNativeCommerceProject(kind, 'demo', 1);
      const scene = project.studioScene!;
      const product = scene.nodes.find(node => node.id === 'demo-product')!;
      const brief = scene.nodes.find(node => node.id === 'demo-brief')!;
      const validate = () => validateNativeCommerceInputs(project, 'demo-' + text);
      expect(validate).toThrow(kind === 'poster' ? '上传并连接商品参考图' : '上传并连接商品参考图，再填写并连接商品信息');
      product.content = '/storage/product.mp4';
      product.settings = { mediaType: 'video' };
      brief.settings = { text: '商品是银色耳机。' };
      expect(validate).toThrow('上传并连接商品参考图');
      product.content = '/storage/product.jpg';
      product.settings = { mediaType: 'image' };
      expect(validate).not.toThrow();
      expect(() => validateNativeCommerceInputs(project, 'demo-' + image)).not.toThrow();
      scene.connections = scene.connections.filter(edge => edge.from !== brief.id);
      if (kind === 'poster') expect(validate).not.toThrow();
      else expect(validate).toThrow('填写并连接商品信息');
    },
  );
  it.each(['sales','workshop','poster'] as const)('uses native nodes and valid wiring for %s',kind=>{
    const project=createNativeCommerceProject(kind,'test',1), scene=project.studioScene!;
    const ids=new Set(scene.nodes.map(node=>node.id));
    expect(ids.size).toBe(scene.nodes.length);
    for(const edge of scene.connections){expect(ids.has(edge.from)).toBe(true);expect(ids.has(edge.to)).toBe(true);}
    expect(scene.nodes.some(node=>node.type==='local-save')).toBe(true);
    expect(scene.nodes.some(node=>(node.settings as Record<string,unknown>).beikeBusinessStage)).toBe(false);
    expect(scene.nodes.filter(node=>node.type==='gen-image'||node.type==='gen-video').length).toBeGreaterThan(0);
    expect(scene.nodes.some(node=>node.isGenerating)).toBe(false);
  });
  it('uses a separate placeholder for cover prompt writing',()=>{
    const scene=createNativeCommerceProject('poster','cover',1).studioScene!;
    const writer=scene.nodes.find(node=>node.id==='cover-design')!;
    expect(writer.settings).toMatchObject({beikeCoverPromptWriter:true,beikeTextResultRequired:true});
    expect(scene.connections.some(edge=>edge.from==='cover-product' && edge.to==='cover-image')).toBe(true);
    expect(scene.connections.some(edge=>edge.from==='cover-design' && edge.to==='cover-image')).toBe(true);
  });
  it('builds nine cover nodes and leaves deliberate node removals in place after reopening', () => {
    const project = createNativeCommerceProject('poster', 'cover', 1);
    const scene = project.studioScene!;
    expect(scene.nodes).toHaveLength(9);
    expect(scene.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'cover-design', to: 'cover-cover-layout' }),
      expect.objectContaining({ from: 'cover-image', to: 'cover-cover-layout' }),
      expect.objectContaining({ from: 'cover-cover-compare', to: 'cover-cover-review' }),
      expect.objectContaining({ from: 'cover-cover-review', to: 'cover-save' }),
    ]));
    expect(scene.connections.some(edge => edge.from === 'cover-image' && edge.to === 'cover-save')).toBe(false);
    scene.nodes = scene.nodes.filter(node => node.id !== 'cover-cover-layout');
    scene.connections = scene.connections.filter(edge => edge.to !== 'cover-cover-layout');
    expect(upgradeNativeCommerceProject(project).studioScene?.nodes).toHaveLength(8);
  });
  it.each([false, true])('upgrades a saved cover with a replaced writer and keeps the result (Excel: %s)', excel => {
    const id = 'cover-project';
    const writerId = 'replaced-writer';
    const imageUrl = '/storage/existing-cover.png';
    const project = createNativeCommerceProject('poster', id, 1);
    const original = project.studioScene!;
    const scene = {
      ...original,
      nodes: [
        { id: id + '-product', type: 'input-image', x: 81, y: 120, imageUrl: '/storage/product.png',
          settings: excel ? { beikeCoverBatch: { name: '封面.xlsx', ids: ['batch-result'] } } : {} },
        { id: writerId, type: 'text-node', x: 521, y: 140, settings: { beikeCoverPromptWriter: true } },
        { id: id + '-image', type: 'gen-image', x: 921, y: 160, imageUrl },
        { id: id + '-save', type: 'local-save', x: 1321, y: 190 },
      ],
      connections: [[id + '-product', writerId], [id + '-product', id + '-image'], [writerId, id + '-image'], [id + '-image', id + '-save']]
        .map(([from, to]) => ({ id: from + ':' + to, from, to })),
    };
    const graph = studioSceneToCanvasGraph(scene);
    const restored = upgradeNativeCommerceProject({
      ...project, ...graph, nativeCommerce: { kind: 'poster', version: 1 }, studioScene: scene,
    });
    const layout = restored.nodes.find(node => node.id === id + '-cover-layout')!;
    expect(layout.referenceNodeIds).toContain(writerId);
    expect(coverLayoutPreview(layout, restored.nodes)).toMatchObject({ generated: true, url: imageUrl });
    const comparison = restored.nodes.find(node => node.id === id + '-cover-compare')!;
    expect(coverComparisonInputs(comparison, restored.nodes)).toMatchObject({ resultUrl: imageUrl, productUrl: undefined });
    const upload = restored.nodes.find(node => node.id === id + '-product')!;
    expect(upload.imageUrl).toBe('/storage/product.png');
    expect(restored.nodes.some(node => node.id === id + '-cover-check')).toBe(false);
    expect(restored.nodes.find(node => node.id === id + '-image')?.referenceNodeIds).toContain(upload.id);
    expect(restored.nodes.find(node => node.id === writerId)).toMatchObject({ x: 521, y: 140 });
    expect(restored.nodes.find(node => node.id === id + '-save')?.referenceNodeIds).toEqual([id + '-cover-review']);
  });
  it.each([undefined, '/storage/active.png'])('merges the saved upload and Excel card using the current single image (%s)', active => {
    const project = createNativeCommerceProject('poster', 'unified', 1);
    const scene = project.studioScene!;
    const product = scene.nodes.find(node => node.id === 'unified-product')!;
    const batch = { name: '封面.xlsx', ids: ['batch-result'], runId: 'current-run' };
    product.imageUrl = '/storage/old.png';
    product.assetId = 'old-asset';
    product.settings = { beikeCoverBatch: batch, _localCacheAssetId: 'old-asset' };
    const uploadId = 'unified-cover-check';
    scene.nodes.push({ id: uploadId, type: 'input-image', imageUrl: active,
      settings: { beikeCoverProductUpload: true, beikeOriginalFileName: active && 'active.png' } });
    scene.connections = scene.connections.map(edge => edge.from === product.id ? { ...edge, from: uploadId } : edge);
    const render = scene.nodes.find(node => node.id === 'unified-image')!;
    render.settings = { beikeRequiredInputs: [uploadId, 'unified-design'] };
    const restored = upgradeNativeCommerceProject({ ...project, ...studioSceneToCanvasGraph(scene), studioScene: scene });
    const merged = restored.studioScene!;
    expect(merged.nodes.some(node => node.id === uploadId)).toBe(false);
    expect(merged.nodes.find(node => node.id === product.id)).toMatchObject({
      imageUrl: active, settings: { beikeCoverBatch: batch, beikeOriginalFileName: active && 'active.png' },
    });
    for (const id of ['unified-image', 'unified-design']) {
      expect(merged.connections.filter(edge => edge.to === id && edge.from === product.id)).toHaveLength(1);
      expect(restored.nodes.find(node => node.id === id)?.referenceNodeIds).toContain(product.id);
    }
    expect(merged.nodes.find(node => node.id === render.id)?.settings).toMatchObject({
      beikeRequiredInputs: [product.id, 'unified-design'],
    });
    expect(upgradeNativeCommerceProject(restored)).toEqual(restored);
  });
  it('restores a saved split cover canvas without losing its workbook or result', () => {
    const project = createNativeCommerceProject('poster', 'poster-rollback', 1);
    const scene = project.studioScene!;
    const productId = project.id + '-product';
    const splitId = project.id + '-cover-batch';
    const resultId = 'cover-12345678-1234-1234-1234-123456789abc-2-render';
    const batch = { name: '封面.xlsx', ids: [resultId], runId: 'current-run' };
    const product = scene.nodes.find(node => node.id === productId)!;
    product.content = product.imageUrl = '/storage/single.png';
    scene.nodes.push(
      { id: splitId, type: 'text-node', settings: { beikeCoverBatch: batch } },
      { id: resultId, type: 'gen-image', content: '/storage/finished.png', imageUrl: '/storage/finished.png',
        beikeLastTaskId: 'finished-task', settings: { beikeLayerHidden: true, beikeCoverExportRunId: batch.runId } },
    );
    const restored = upgradeNativeCommerceProject({ ...project, ...studioSceneToCanvasGraph(scene), studioScene: scene });
    const roundTrip = syncCanvasGraphToStudioScene(restored);
    expect(roundTrip.nodes.some(node => node.id === splitId)).toBe(false);
    expect(roundTrip.nodes.find(node => node.id === productId)).toMatchObject({
      imageUrl: '/storage/single.png', settings: { beikeCoverBatch: batch },
    });
    expect(restored.nodes.find(node => node.id === resultId)).toMatchObject({ imageUrl: '/storage/finished.png', layerHidden: true });
    expect(roundTrip.nodes.find(node => node.id === resultId)).toMatchObject({
      beikeLastTaskId: 'finished-task', settings: { beikeCoverExportRunId: batch.runId },
    });
  });
  it('hides current and archived batch cards while keeping their records and connections', () => {
    const project = createNativeCommerceProject('poster', 'cover-cleanup', 1);
    const sourceId = project.id + '-product';
    const rows = [{ row: 2, title: '测试封面', ratio: '3:4' as const, url: '/storage/product.png' }];
    const previous = appendCoverBatch(project.studioScene!, sourceId, '旧批次.xlsx', rows);
    const previousRenderId = getCoverBatch(previous.nodes.find(node => node.id === sourceId))!.ids[0];
    const previousSaveId = previousRenderId.replace(/-2-render$/, '-save');
    const writerId = previousRenderId + '-writer';
    const refId = previousRenderId.replace(/-render$/, '-ref');
    const previousRender = previous.nodes.find(node => node.id === previousRenderId)!;
    previousRender.content = previousRender.imageUrl = '/storage/finished.png';
    previousRender.beikeLastTaskId = 'finished-task';
    previousRender.y = 40000;
    previous.nodes.push({ id: writerId, type: 'text-node', settings: { beikeBatchCoverWriter: true } },
      { id: previousSaveId, type: 'local-save' });
    previous.connections.push({ id: 'product-to-writer', from: refId, to: writerId });

    const imported = appendCoverBatch(previous, sourceId, '当前批次.xlsx', rows);
    const activeRenderId = getCoverBatch(imported.nodes.find(node => node.id === sourceId))!.ids[0];
    const activeSaveId = activeRenderId.replace(/-2-render$/, '-save');
    expect(imported.nodes.find(node => node.id === activeRenderId)?.settings).toMatchObject({ beikeLayerHidden: true });
    expect(imported.nodes.find(node => node.id === previousSaveId)?.settings).toMatchObject({ beikeLayerHidden: true });
    const legacy = { ...imported, nodes: imported.nodes.map(node => node.id === previousSaveId || node.id === writerId
      ? { ...node, settings: { ...node.settings as object, beikeLayerHidden: false } } : node) };
    const restored = upgradeNativeCommerceProject({ ...project, ...studioSceneToCanvasGraph(legacy), studioScene: legacy });
    const nodeById = new Map(restored.nodes.map(node => [node.id, node]));
    expect(nodeById.get(writerId)?.layerHidden).toBe(true);
    expect(nodeById.get(previousSaveId)?.layerHidden).toBe(true);
    expect(nodeById.has(activeSaveId)).toBe(false);
    expect(nodeById.get(project.id + '-design')?.layerHidden).toBeUndefined();
    expect(nodeById.get(previousRenderId)).toMatchObject({ imageUrl: '/storage/finished.png', taskId: 'finished-task' });
    expect(nodeById.get(previousRenderId)?.layerHidden).toBe(true);
    expect(nodeById.get(refId)?.layerHidden).toBe(true);
    expect(nodeById.get(activeRenderId)?.layerHidden).toBe(true);
    const roundTrip = syncCanvasGraphToStudioScene(restored);
    expect(roundTrip.connections).toEqual(expect.arrayContaining(legacy.connections));
    expect(resolveStudioInputs(roundTrip, writerId).refs).toMatchObject([{ nodeId: refId, url: '/storage/product.png' }]);
  });
  it('returns the viewport to the main workflow when a distant batch leaves the board', () => {
    const project = createNativeCommerceProject('poster', 'cover-map', 1);
    const sourceId = project.id + '-product';
    const rows = [{ row: 2, title: '当前封面', ratio: '3:4' as const, url: '/storage/product.png' }];
    const initial = appendCoverBatch(project.studioScene!, sourceId, '旧表.xlsx', rows);
    const archiveId = getCoverBatch(initial.nodes.find(node => node.id === sourceId))!.ids[0];
    const scene = appendCoverBatch(initial, sourceId, '当前表.xlsx', rows);
    const renderId = getCoverBatch(scene.nodes.find(node => node.id === sourceId))!.ids[0];
    const refId = renderId.replace(/-render$/, '-ref');
    const saveId = renderId.replace(/-2-render$/, '-save');
    const writerId = renderId + '-writer';
    scene.nodes.push({ id: writerId, type: 'text-node', y: 20010, settings: { beikeBatchCoverWriter: true } },
      { id: saveId, type: 'local-save' });
    for (const [id, y] of [[refId, 20000], [renderId, 20010], [saveId, 20030], [archiveId, 40000]] as const) {
      scene.nodes.find(node => node.id === id)!.y = y;
    }
    const render = scene.nodes.find(node => node.id === renderId)!;
    render.settings = { ...render.settings as object, beikeLayerHidden: false };
    render.content = render.imageUrl = '/storage/current.png';
    render.beikeLastTaskId = 'current-task';
    const graph = studioSceneToCanvasGraph(scene);
    const restored = upgradeNativeCommerceProject({ ...project, ...graph, studioScene: scene, viewport: { x: 0, y: -9950, zoom: 0.5 } });
    const nodes = new Map(restored.nodes.map(node => [node.id, node]));
    expect(nodes.get(renderId)).toMatchObject({ y: 20010, imageUrl: '/storage/current.png', taskId: 'current-task', layerHidden: true });
    expect(nodes.get(saveId)?.layerHidden).toBe(true);
    expect(nodes.get(writerId)?.layerHidden).toBe(true);
    expect(nodes.get(archiveId)).toMatchObject({ y: 40000, layerHidden: true });
    expect(restored.viewport).toEqual({ x: 40, y: 50, zoom: 0.5 });
    expect(upgradeNativeCommerceProject(restored).studioScene?.nodes).toEqual(restored.studioScene?.nodes);
  });
  it('blocks generation until the required analysis has really finished',()=>{
    const scene=createNativeCommerceProject('poster','a',1).studioScene!;
    scene.nodes.find(node=>node.id==='a-product')!.content='/storage/product.png';
    expect(()=>resolveStudioInputs(scene,'a-image')).toThrow('请先运行');
    scene.nodes.find(node=>node.id==='a-design')!.settings={beikeTextResultRequired:true,textNodeDisplayText:'完整封面设计'};
    expect(resolveStudioInputs(scene,'a-image')).toMatchObject({refs:[{url:'/storage/product.png'}]});
  });
  it('keeps old data and pending tasks during migration',()=>{
    const old: CanvasProject = {
      id: 'a',
      title: '商品短片画布',
      createdAt: 1,
      updatedAt: 1,
      draft: false,
      nodes: [],
      sales: { draftId: 'a', draft: { productName: '测试商品' } },
      studioScene: {
        nodes: [{ id: 'a-sales-product', type: 'text-node', nodeName: '1. 商品与卖点', x: 80, y: 80 }],
        connections: [],
        groups: [],
        strokes: [],
        textBoxes: [],
        view: { x: 30, y: 45, zoom: 0.8 },
      },
    };
    const migrated=upgradeNativeCommerceProject(old);
    expect(migrated.nativeCommerce?.legacyScene).toEqual(old.studioScene);
    expect(migrated.sales).toEqual(old.sales);
    expect(upgradeNativeCommerceProject(migrated)).toBe(migrated);
    old.studioScene!.nodes[0].isGenerating=true;
    expect(upgradeNativeCommerceProject(old).nativeCommerce?.legacyScene).toBe(old.studioScene);
  });
});

describe('studioSceneAdapter', () => {
  it('keeps a failed drawing prompt and its error separate across repeated scene conversions', () => {
    const project = createVideoWorkflowProject('w3-copy', 'failed-w3', 2000);
    const video = project.studioScene!.nodes.find(node => node.id === 'failed-w3-video')!;
    video.prompt = '【使用片段：01】';
    video.errorMsg = '请先运行 05 分镜分析';
    video.settings = { ...video.settings as object, error: video.errorMsg };
    const graph = studioSceneToCanvasGraph(project.studioScene!, 2000);
    const drawing = graph.nodes.find(node => node.id === video.id)!;
    expect(drawing).toMatchObject({ content: video.prompt, errorMessage: video.errorMsg, status: 'error' });
    const saved = syncCanvasGraphToStudioScene({ ...project, ...graph });
    expect(saved.nodes.find(node => node.id === video.id)).toMatchObject({
      prompt: video.prompt, errorMsg: video.errorMsg, settings: { error: video.errorMsg },
    });
    expect(studioSceneToCanvasGraph(saved).nodes.find(node => node.id === video.id)).toMatchObject({
      content: video.prompt, errorMessage: video.errorMsg,
    });
    drawing.content = '失败后修改的分镜提示词';
    const edited = syncCanvasGraphToStudioScene({ ...project, ...graph });
    expect(edited.nodes.find(node => node.id === video.id)).toMatchObject({
      prompt: drawing.content, errorMsg: video.errorMsg, settings: { error: video.errorMsg },
    });
    expect(studioSceneToCanvasGraph(edited).nodes.find(node => node.id === video.id)).toMatchObject({
      content: drawing.content, errorMessage: video.errorMsg, status: 'error',
    });
    drawing.status = 'success';
    const recovered = syncCanvasGraphToStudioScene({ ...project, ...graph }).nodes.find(node => node.id === video.id)!;
    expect(recovered.errorMsg).toBeUndefined();
    expect(recovered.settings).not.toHaveProperty('error');
  });

  it('converts nativeCommerce sales project to CanvasNode graph and back losslessly', () => {
    const project = createNativeCommerceProject('sales', 'proj-sales', 1000);
    expect(project.studioScene).toBeDefined();

    const graph = studioSceneToCanvasGraph(project.studioScene!, 1000);
    expect(graph.nodes.length).toBe(project.studioScene!.nodes.length);

    const productNode = graph.nodes.find((n) => n.id === 'proj-sales-product');
    expect(productNode?.type).toBe('file');
    expect(productNode?.title).toBe('商品参考图');

    const scriptNode = graph.nodes.find((n) => n.id === 'proj-sales-script');
    expect(scriptNode?.type).toBe('prompt');
    expect(scriptNode?.referenceNodeIds).toEqual(['proj-sales-product', 'proj-sales-brief']);

    const keyframeNode = graph.nodes.find((n) => n.id === 'proj-sales-keyframe');
    expect(keyframeNode?.type).toBe('drawing');
    expect(keyframeNode?.generationKind).toBe('image');

    const videoNode = graph.nodes.find((n) => n.id === 'proj-sales-video');
    expect(videoNode?.type).toBe('drawing');
    expect(videoNode?.generationKind).toBe('video');
    expect(videoNode?.drawing?.duration).toBe(5);

    const voiceNode = graph.nodes.find((n) => n.id === 'proj-sales-voice');
    expect(voiceNode?.type).toBe('audio');

    const hydrated = {
      ...project,
      nodes: graph.nodes,
      edges: graph.edges,
      viewport: graph.viewport,
    };
    const roundtrip = syncCanvasGraphToStudioScene(hydrated);
    expect(roundtrip.nodes.map((n) => n.id)).toEqual(
      project.studioScene!.nodes.map((n) => n.id),
    );
    expect(roundtrip.connections.length).toBe(project.studioScene!.connections.length);
  });

  it('preserves W3 workflow invariants and passes preflightW3Copy after media injection', () => {
    const project = createVideoWorkflowProject('w3-copy', 'proj-w3', 2000);
    const graph = studioSceneToCanvasGraph(project.studioScene!, 2000);

    const updatedNodes = graph.nodes.map((node) => {
      if (node.id === 'proj-w3-source') {
        return { ...node, type: 'video' as const, videoUrl: 'https://example.com/ref.mp4' };
      }
      if (['proj-w3-product', 'proj-w3-person', 'proj-w3-background'].includes(node.id)) {
        return { ...node, type: 'image' as const, imageUrl: `https://example.com/${node.id}.png` };
      }
      return node;
    });

    const syncedScene = syncCanvasGraphToStudioScene({
      ...project,
      nodes: updatedNodes,
      edges: graph.edges,
      viewport: graph.viewport,
    });

    const plan = preflightW3Copy(syncedScene);
    expect(plan.analysis.id).toBe('proj-w3-analysis');
    expect(plan.keyframe.id).toBe('proj-w3-keyframe');
    expect(plan.video.id).toBe('proj-w3-video');
    expect(w3CopyInputKey(syncedScene)).toContain('https://example.com/ref.mp4');
  });

  it('keeps a depth compiler route and segment instruction separate from its editable draft', () => {
    const project = createVideoWorkflowProject('depth-copy', 'proj-depth', 2000);
    const scene = project.studioScene!;
    const compiler = scene.nodes.find(node => node.id === 'proj-depth-prompt')!;
    const instruction = compiler.prompt;
    const route = 'beike:chat:configured-route';
    compiler.settings = { ...compiler.settings as object, textNodeChatModel: route, textNodeDraftPrompt: instruction };
    const graph = studioSceneToCanvasGraph(scene, 2000);
    const editable = graph.nodes.find(node => node.id === compiler.id)!;
    expect(editable.textModel).toBe('configured-route');
    expect(editable.textPrompt).toBeUndefined();
    const sync = () => syncCanvasGraphToStudioScene({ ...project, ...graph }).nodes.find(node => node.id === compiler.id)!;
    expect(sync()).toMatchObject({ prompt: instruction, settings: { textNodeChatModel: route } });
    expect(sync().settings).not.toHaveProperty('textNodeDraftPrompt');
    editable.textPrompt = '保留自然肤色';
    expect(sync()).toMatchObject({ prompt: instruction, settings: { textNodeDraftPrompt: '保留自然肤色' } });
  });


});
