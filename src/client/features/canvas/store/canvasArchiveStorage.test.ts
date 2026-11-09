import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasArchive } from '../model/canvasArchive';
import type { CanvasProject, StudioScene } from '../model/types';

const mocks = vi.hoisted(()=>({open:vi.fn(),write:vi.fn(),failed:false,readFailed:false,publish:vi.fn(),
  transaction:vi.fn(),put:vi.fn(),
  state:{projects:[] as {id:string}[]}}));
vi.mock('idb',()=>({openDB:mocks.open}));
vi.mock('./canvasProjectDefaults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./canvasProjectDefaults')>();
  return {
    ...actual,
    canvasProjectStorage: { setItem: mocks.write },
    hasCanvasReadFailure: () => mocks.readFailed,
    hasCanvasSaveFailure: () => mocks.failed,
  };
});
vi.mock('./useCanvasStore',()=>({useCanvasStore:{getState:()=>mocks.state,setState:mocks.publish,subscribe:vi.fn(()=>()=>{}),persist:{hasHydrated:()=>true}}}));
vi.mock('@client/shared/media/downloadMedia',()=>({fetchMediaBlob:vi.fn()}));
afterEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals();vi.resetModules();mocks.failed=false;mocks.readFailed=false;});
const archive = (): CanvasArchive => ({project:{id:'restored',title:'恢复项目',nodes:[],createdAt:1,updatedAt:1,studioScene:{nodes:[],connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}}},
  assets:[{id:'file',blob:new Blob(['photo'],{type:'image/png'})}]});

it('keeps the original project list intact when asset or project persistence fails, and reuses the same ID on retry', async()=>{
  mocks.state.projects=[{id:'original'}];
  const close=vi.fn(),abort=vi.fn();
  const put=vi.fn().mockRejectedValueOnce(new Error('素材无法写入')).mockResolvedValue(undefined);
  mocks.open.mockResolvedValue({transaction:()=>({store:{put},done:Promise.resolve(),abort}),close});
  const {restoreCanvasArchive}=await import('./canvasArchiveStorage');
  const prepared=archive();
  await expect(restoreCanvasArchive(prepared,()=>{})).rejects.toThrow('素材无法写入');
  expect(mocks.write).not.toHaveBeenCalled();expect(mocks.publish).not.toHaveBeenCalled();expect(close).toHaveBeenCalled();
  mocks.failed=true;
  await expect(restoreCanvasArchive(prepared,()=>{})).rejects.toThrow('恢复项目未保存');
  expect(mocks.publish).not.toHaveBeenCalled();expect(mocks.state.projects).toEqual([{id:'original'}]);
  mocks.failed=false;
  expect((await restoreCanvasArchive(prepared,()=>{})).id).toBe('restored');
  expect(mocks.publish).toHaveBeenCalledWith({projects:[prepared.project,{id:'original'}]});
});

it('hydrates repeated media references once, serializes persistent references, and revokes URLs on close', async()=>{
  vi.stubGlobal('indexedDB',{databases:async()=>[{name:'beike.studio.restored.QiaodoumayiAssetCache'}]});
  const blob=new Blob(['photo'],{type:'image/png'}),get=vi.fn(async()=>({blob}));
  mocks.open.mockResolvedValue({objectStoreNames:{contains:()=>true},get,close:vi.fn()});
  const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:runtime');
  const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  const {hydrateCanvasScene}=await import('./canvasArchiveStorage');
  const scene={nodes:[{id:'image',type:'gen-image',content:'local-asset://file',settings:{generationVersions:[{content:'local-asset://file'}]}}],
    connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}};
  const session=await hydrateCanvasScene('restored',scene);
  expect(create).toHaveBeenCalledTimes(1);expect(get).toHaveBeenCalledTimes(1);
  expect(session.scene?.nodes[0].content).toBe('blob:runtime');
  expect(session.serialize(session.scene!)).toEqual(scene);
  expect(session.assetRefs).toEqual([['blob:runtime','file']]);
  session.dispose();expect(revoke).toHaveBeenCalledWith('blob:runtime');
  create.mockRestore();revoke.mockRestore();
});

it('reopens inline replacement media as registered runtime URLs and persists the original source',async()=>{
  const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:replacement');
  const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  try {
    const {hydrateCanvasScene}=await import('./canvasArchiveStorage');
    const content='data:image/png;base64,cGhvdG8=';
    const scene={nodes:[{id:'ref',type:'input-image',content,settings:{mediaType:'image',generatedImages:[{fullUrl:content}]}}],
      connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}};
    const session=await hydrateCanvasScene('replacement',scene);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await (create.mock.calls[0][0] as Blob).text()).toBe('photo');
    expect(session.scene?.nodes[0].content).toBe('blob:replacement');
    expect(session.assetRefs).toEqual([['blob:replacement',expect.stringMatching(/^inline-/)]]);
    expect(session.serialize(session.scene!)).toEqual(scene);
    expect(mocks.open).not.toHaveBeenCalled();
    session.dispose();expect(revoke).toHaveBeenCalledWith('blob:replacement');
  } finally {create.mockRestore();revoke.mockRestore();}
});


it('restores the actual video kind when a legacy input still carries the default image kind',async()=>{
  const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:video-kind');
  const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  try {
    const {hydrateCanvasScene}=await import('./canvasArchiveStorage');
    const content='data:video/mp4;base64,dmlkZW8=';
    const scene={nodes:[{id:'legacy-video',type:'input-image',content,previewType:'video',settings:{mediaType:'image'}}],
      connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}};
    const session=await hydrateCanvasScene('legacy-video',scene);
    expect(session.scene?.nodes[0].settings).toMatchObject({mediaType:'video'});
    expect(session.serialize(session.scene!)).toMatchObject({nodes:[{content,settings:{mediaType:'video'}}]});
    expect(scene.nodes[0].settings.mediaType).toBe('image');
    session.dispose();
  } finally {create.mockRestore();revoke.mockRestore();}
});

it.each(['completion', 'edit', 'delete', 'another import'])('preserves a concurrent %s before publishing a restored project', async kind=>{
  mocks.state.projects=[{id:'original'}];
  const prepared=archive();prepared.assets=[];
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let started!:()=>void;
  const writing=new Promise<void>(resolve=>{started=resolve;});
  const latest = kind==='delete' ? [] : [{id:kind==='another import'?'other-restored':'original',
    title:kind==='edit'?'edited':'original',nodes:kind==='completion'?[{status:'success',imageUrl:'/storage/result.png'}]:[]}];
  mocks.write.mockImplementationOnce(async()=>{started();await gate;}).mockResolvedValue(undefined);
  const {restoreCanvasArchive}=await import('./canvasArchiveStorage');
  const restoring=restoreCanvasArchive(prepared,()=>{});
  await writing;
  mocks.state.projects=latest;
  release();
  await restoring;
  expect(mocks.publish).toHaveBeenCalledWith({projects:[prepared.project,...latest]});
  const saved=mocks.write.mock.calls.at(-1)![1];
  expect(saved.state.projects).toEqual([prepared.project,...latest]);
  expect(saved.state.projects.filter((item:{id:string})=>item.id==='restored')).toHaveLength(1);
});


it('does not publish the import when saving a fresh concurrent merge fails', async()=>{
  mocks.state.projects=[{id:'original'}];
  const prepared=archive();prepared.assets=[];
  const latest=[{id:'original',title:'concurrent edit'}];
  mocks.write.mockImplementationOnce(async()=>{mocks.state.projects=latest;})
    .mockImplementationOnce(async()=>{mocks.failed=true;});
  const {restoreCanvasArchive}=await import('./canvasArchiveStorage');
  await expect(restoreCanvasArchive(prepared,()=>{})).rejects.toThrow('恢复项目未保存');
  expect(mocks.write).toHaveBeenCalledTimes(2);
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.state.projects).toBe(latest);
});

it('keeps a failed native recovery unpublished and retries the same independent project with durable media', async()=>{
  mocks.state.projects=[{id:'original'}];
  const image=new Blob(['photo'],{type:'image/png'});
  const prepared:CanvasArchive={project:{id:'native-restored',title:'旧画布',createdAt:1,updatedAt:1,
    nodes:[{id:'image',type:'image',imageUrl:'local-asset://photo',x:0,y:0,width:200,height:200,createdAt:1}],viewport:{x:20,y:-30,zoom:1.4}},assets:[{id:'photo',blob:image}]};
  const {fetchMediaBlob}=await import('@client/shared/media/downloadMedia');
  vi.mocked(fetchMediaBlob).mockResolvedValue(image);
  const {restoreCanvasArchive}=await import('./canvasArchiveStorage');
  mocks.failed=true;
  await expect(restoreCanvasArchive(prepared,()=>{})).rejects.toThrow('恢复项目未保存');
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.state.projects).toEqual([{id:'original'}]);
  mocks.failed=false;
  const project=await restoreCanvasArchive(prepared,()=>{});
  expect(project.id).toBe('native-restored');
  expect(project.nodes[0].imageUrl).toMatch(/^data:image\/png;base64,/);
  expect(project.viewport).toEqual({x:20,y:-30,zoom:1.4});
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.publish).toHaveBeenCalledWith({projects:[project,{id:'original'}]});
});


it('rebuilds cached video and reference content before rendering instead of reusing previous-document blob URLs',async()=>{
  vi.stubGlobal('indexedDB',{databases:async()=>[{name:'beike.studio.reopened.QiaodoumayiAssetCache'}]});
  const blobs=new Map([['video-file',new Blob(['video'],{type:'video/mp4'})],['photo-file',new Blob(['photo'],{type:'image/png'})]]);
  const get=vi.fn(async(_store:string,id:string)=>({blob:blobs.get(id)}));
  mocks.open.mockResolvedValue({objectStoreNames:{contains:()=>true},get,close:vi.fn()});
  const create=vi.spyOn(URL,'createObjectURL').mockImplementation(blob=>`blob:new-${(blob as Blob).type}`);
  const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  try {
    const {hydrateCanvasScene}=await import('./canvasArchiveStorage');
    const scene={nodes:[{id:'video',type:'input-image',content:'blob:old-video',settings:{mediaType:'video',_localCacheAssetId:'video-file'}},
      {id:'photo',type:'input-image',content:'',settings:{mediaType:'image',_assetId:'photo-file'}},
      {id:'text',type:'text-node',content:'blob:literal-text'}],connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}};
    const session=await hydrateCanvasScene('reopened',scene);
    expect(session.scene!.nodes.map(node=>node.content)).toEqual(['blob:new-video/mp4','blob:new-image/png','blob:literal-text']);
    expect(session.assetRefs).toEqual(expect.arrayContaining([['blob:new-video/mp4','video-file'],['blob:new-image/png','photo-file']]));
    const stored=session.serialize(session.scene!);
    expect(stored.nodes.map(node=>node.content)).toEqual(['local-asset://video-file','local-asset://photo-file','blob:literal-text']);
    expect(scene.nodes[0].content).toBe('blob:old-video');
    expect(get).toHaveBeenCalledTimes(2);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    session.dispose();expect(revoke).toHaveBeenCalledTimes(2);
  } finally {create.mockRestore();revoke.mockRestore();}
});

it('restores selected preview media and video posters with their separate file identities',async()=>{
  vi.stubGlobal('indexedDB',{databases:async()=>[{name:'beike.studio.preview.QiaodoumayiAssetCache'}]});
  const get=vi.fn(async(_store:string,id:string)=>({blob:new Blob([id],{type:id==='video'?'video/mp4':'image/png'})}));
  mocks.open.mockResolvedValue({objectStoreNames:{contains:()=>true},get,close:vi.fn()});
  let index=0;
  const create=vi.spyOn(URL,'createObjectURL').mockImplementation(()=>`blob:preview-${++index}`);
  const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  try {
    const {hydrateCanvasScene}=await import('./canvasArchiveStorage');
    const scene={nodes:[{id:'preview',type:'preview',content:'/storage/video.mp4',previewType:'video',
      selectedPreviewVideo:'blob:old-video',_selectedVideoAssetId:'video',videoPosterUrl:'blob:old-poster',previewAssetId:'poster'}],
      connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}};
    const session=await hydrateCanvasScene('preview',scene);
    expect(session.serialize(session.scene!).nodes[0]).toMatchObject({content:'/storage/video.mp4',
      selectedPreviewVideo:'local-asset://video',videoPosterUrl:'local-asset://poster'});
    expect(create.mock.calls.map(([blob])=>(blob as Blob).type).sort()).toEqual(['image/png','video/mp4']);
    session.dispose();
  } finally {create.mockRestore();revoke.mockRestore();}
});

it('revokes media that finishes hydrating after a different missing file fails the open',async()=>{
  vi.stubGlobal('indexedDB',{databases:async()=>[{name:'beike.studio.partial.QiaodoumayiAssetCache'}]});
  let release!:(value:{blob:Blob})=>void;
  const waiting=new Promise<{blob:Blob}>(resolve=>{release=resolve;});
  const get=vi.fn(async(_store:string,id:string)=>id==='slow'?waiting:undefined);
  mocks.open.mockResolvedValue({objectStoreNames:{contains:()=>true},get,close:vi.fn()});
  let markCreated!:()=>void;
  const created=new Promise<void>(resolve=>{markCreated=resolve;});
  const create=vi.spyOn(URL,'createObjectURL').mockImplementation(()=>{markCreated();return 'blob:late';});
  const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  try {
    const {hydrateCanvasScene}=await import('./canvasArchiveStorage');
    const scene={nodes:[{id:'missing',type:'input-image',content:'local-asset://missing'},
      {id:'slow',type:'input-image',content:'local-asset://slow'}],
      connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}};
    const opening=hydrateCanvasScene('partial',scene).catch(error=>error);
    await new Promise(resolve=>setTimeout(resolve,0));
    release({blob:new Blob(['slow'],{type:'image/png'})});
    await created;
    expect(await opening).toBeInstanceOf(Error);
    expect(revoke).toHaveBeenCalledWith('blob:late');
  } finally {create.mockRestore();revoke.mockRestore();}
});

it('recovers each cached generation version independently and preserves durable remote results',async()=>{
  vi.stubGlobal('indexedDB',{databases:async()=>[{name:'beike.studio.versions.QiaodoumayiAssetCache'}]});
  const get=vi.fn(async(_store:string,id:string)=>id==='old-file'?{blob:new Blob(['old'],{type:'video/mp4'})}:undefined);
  mocks.open.mockResolvedValue({objectStoreNames:{contains:()=>true},get,close:vi.fn()});
  const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:new-version');
  const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  try {
    const {hydrateCanvasScene}=await import('./canvasArchiveStorage');
    const scene={nodes:[{id:'video',type:'gen-video',content:'/storage/current.mp4',settings:{_assetId:'missing-current',generationVersions:[
      {assetId:'old-file',content:'blob:old-version'},{assetId:'missing-version',content:'blob:unavailable'}]}}],
      connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}};
    const session=await hydrateCanvasScene('versions',scene);
    expect(session.scene!.nodes[0].content).toBe('/storage/current.mp4');
    expect(session.serialize(session.scene!).nodes[0].settings).toMatchObject({generationVersions:[
      {assetId:'old-file',content:'local-asset://old-file'},{assetId:'missing-version',content:'blob:unavailable'}]});
    session.dispose();
  } finally {create.mockRestore();revoke.mockRestore();}
});

describe('canvasPersistence & canvasProjectDefaults', () => {
  const baseScene: StudioScene = { nodes: [], connections: [], groups: [], textBoxes: [], strokes: [], view: { x: 0, y: 0, zoom: 1 } };
  const draft: CanvasProject = { id: 'draft', title: '未命名项目', nodes: [], createdAt: 0, updatedAt: 0, draft: true };

  it('保留仅有笔迹或文本框的草稿，按最后修改时间排列', async () => {
    vi.doUnmock('./canvasProjectDefaults');
    vi.resetModules();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { search: '', pathname: '/' } }));
    const { visibleCanvasProjects } = await import('./canvasProjectDefaults');
    const strokes = { ...draft, id: 'draw', updatedAt: 1, studioScene: { ...baseScene, strokes: [{}] } };
    const text = { ...draft, id: 'text', updatedAt: 2, studioScene: { ...baseScene, textBoxes: [{}] } };
    expect(visibleCanvasProjects([draft, strokes, text]).map(p => p.id)).toEqual(['text', 'draw']);
  });

  it('跳过临时地址及音视频正文，使用后续可恢复的图片', async () => {
    vi.doUnmock('./canvasProjectDefaults');
    vi.resetModules();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { search: '', pathname: '/' } }));
    const { studioCover } = await import('./canvasProjectDefaults');
    const nodes = [
      { id: 'v', type: 'preview', previewType: 'video', content: '/storage/clip.mp4', settings: { generatedImages: [{ fullUrl: '/storage/clip.mp4' }] } },
      { id: 'i', type: 'gen-image', generatedImages: [{ fullUrl: 'blob:temporary' }, { fullUrl: '/storage/cover.png' }] },
    ];
    expect(studioCover({ ...baseScene, nodes })).toBe('/storage/cover.png');
  });

  it('只显示新版电商视频演示，并保留旧演示的数据及同名普通项目', async () => {
    vi.doUnmock('./canvasProjectDefaults');
    vi.resetModules();
    const { normalizeCanvasProjects, visibleCanvasProjects, withBuiltInCanvasProjects } = await import('./canvasProjectDefaults');
    const legacy = { ...draft, id: 'canvas-proj-0ce0a1ff-d832-4e8c-bdbc-4958e0173073', title: '电商视频', draft: false };
    const ordinary = { ...legacy, id: 'ordinary' };
    const projects = withBuiltInCanvasProjects([legacy, ordinary]);
    const visible = visibleCanvasProjects(projects);

    expect(visible.map(project => project.id)).not.toContain(legacy.id);
    expect(visible.map(project => project.title)).toContain('电商视频 · 新版');
    expect(visible).toContainEqual(ordinary);
    expect(normalizeCanvasProjects(projects).map(project => project.id)).toContain(legacy.id);
  });

  it('saves an ordinary project when another tab already initialized the same demos', async () => {
    vi.doUnmock('./canvasProjectDefaults');
    vi.resetModules();
    const { canvasProjectStorage, finishCanvasHydration, withBuiltInCanvasProjects, hasCanvasSaveFailure } = await import('./canvasProjectDefaults');
    const demos = withBuiltInCanvasProjects([]);
    finishCanvasHydration(demos);
    const ids = demos.map(project => project.id);
    const revisions = Object.fromEntries(ids.map(id => [id, 'other-tab']));
    const store = { get: vi.fn(async () => ({ ids, revisions })), put: mocks.put.mockResolvedValue(undefined) };
    mocks.open.mockResolvedValue({ transaction: () => ({ objectStore: () => store, done: Promise.resolve() }) });
    const project = { id: 'ordinary', title: '我的项目', nodes: [], createdAt: 1, updatedAt: 1 };

    await canvasProjectStorage.setItem('projects', { state: { projects: [...demos, project] } });

    expect(hasCanvasSaveFailure()).toBe(false);
    expect(mocks.put).toHaveBeenCalledWith(project, project.id);
    for (const id of ids) expect(mocks.put).not.toHaveBeenCalledWith(expect.anything(), id);

    const changed = { ...demos[0], title: '本窗口修改' };
    await canvasProjectStorage.setItem('projects', { state: { projects: [changed, ...demos.slice(1), project] } });
    expect(hasCanvasSaveFailure()).toBe(true);
    expect(mocks.put).not.toHaveBeenCalledWith(changed, changed.id);
  });

  it('reports repeated save failures and saves the latest project snapshot on retry', async () => {
    vi.doUnmock('./canvasProjectDefaults');
    vi.resetModules();
    const events = Object.assign(new EventTarget(), { location: { search: '', pathname: '/' } });
    vi.stubGlobal('window', events);
    const failed = vi.fn(), completed = vi.fn();
    events.addEventListener('canvas-save-error', failed);
    events.addEventListener('canvas-save-complete', completed);
    const store = { get: vi.fn(async () => undefined), put: mocks.put.mockResolvedValue(undefined), delete: vi.fn() };
    mocks.open.mockResolvedValue({ transaction: mocks.transaction });
    mocks.transaction
      .mockImplementationOnce(() => { throw new Error('磁盘已满'); })
      .mockImplementationOnce(() => { throw new Error('磁盘仍然已满'); })
      .mockImplementation(() => ({ objectStore: () => store, done: Promise.resolve() }));
    const { canvasProjectStorage, finishCanvasHydration, hasCanvasSaveFailure } = await import('./canvasProjectDefaults');
    finishCanvasHydration();
    const snapshot = (title: string) => ({ version: 0, state: { projects: [{ id: 'project', title, nodes: [], createdAt: 1, updatedAt: 1, studioScene: { ...baseScene, nodes: [{ id: 'result', type: 'gen-image', content: '/storage/result.png' }], connections: [{ id: 'edge', from: 'input', to: 'result' }] } }] } });
    await canvasProjectStorage.setItem('projects', snapshot('第一次名称'));
    await canvasProjectStorage.setItem('projects', snapshot('最新名称'));
    expect(failed).toHaveBeenCalledTimes(2);
    expect(hasCanvasSaveFailure()).toBe(true);
    await canvasProjectStorage.setItem('projects', snapshot('最新名称'));
    expect(hasCanvasSaveFailure()).toBe(false);
    expect(completed).toHaveBeenCalledOnce();
    expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ title: '最新名称', studioScene: expect.objectContaining({ connections: [{ id: 'edge', from: 'input', to: 'result' }] }) }), 'project');
  });

  it('blocks writes after a failed read until the original database has been recovered', async () => {
    vi.doUnmock('./canvasProjectDefaults');
    vi.resetModules();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { search: '', pathname: '/' } }));
    const backup = vi.fn(() => JSON.stringify({ state: { projects: [{ id: 'obsolete-backup', nodes: [] }] } }));
    vi.stubGlobal('localStorage', { getItem: backup });
    const get = vi.fn()
      .mockRejectedValueOnce(new Error('暂时无法读取'))
      .mockResolvedValueOnce({ ids: ['original'], version: 0 })
      .mockResolvedValueOnce({ id: 'original', title: '已保存的项目', nodes: [] });
    mocks.open.mockResolvedValue({ transaction: (_stores: unknown, mode: string) => mode === 'readonly'
      ? { objectStore: () => ({ get }), done: Promise.resolve() } : mocks.transaction() });
    const { canvasProjectStorage, finishCanvasHydration, hasCanvasReadFailure } = await import('./canvasProjectDefaults');
    backup.mockClear();
    expect(await canvasProjectStorage.getItem('projects')).toBeNull();
    expect(hasCanvasReadFailure()).toBe(true);
    finishCanvasHydration();
    await canvasProjectStorage.setItem('projects', { state: { projects: [] }, version: 0 });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(backup).not.toHaveBeenCalled();
    const recovered = (await canvasProjectStorage.getItem('projects'))!;
    expect(recovered.state.projects[0].id).toBe('original');
    expect(hasCanvasReadFailure()).toBe(false);
  });

  it('does not acknowledge a superseded explicit save before the newer queued snapshot is durable', async () => {
    vi.doUnmock('./canvasProjectDefaults');
    vi.resetModules();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { search: '', pathname: '/' } }));
    let releaseOld!: () => void, releaseLatest!: () => void;
    const oldDone = new Promise<void>(resolve => { releaseOld = resolve; });
    const latestDone = new Promise<void>(resolve => { releaseLatest = resolve; });
    let manifest: unknown;
    const store = { get: vi.fn(async () => manifest), put: mocks.put.mockImplementation(async (value, key) => {
      if (key === 'projects') manifest = value;
    }), delete: vi.fn() };
    mocks.open.mockResolvedValue({ transaction: mocks.transaction });
    mocks.transaction
      .mockImplementationOnce(() => ({ objectStore: () => store, done: oldDone }))
      .mockImplementation(() => ({ objectStore: () => store, done: latestDone }));
    const { canvasProjectStorage, finishCanvasHydration } = await import('./canvasProjectDefaults');
    finishCanvasHydration();
    const snapshot = (title: string) => ({ version: 0, state: { projects: [{ id: 'project', title, nodes: [], createdAt: 1, updatedAt: 1 }] } });
    const old = canvasProjectStorage.setItem('projects', snapshot('before'));
    await vi.waitFor(() => expect(mocks.transaction).toHaveBeenCalledOnce());
    let acknowledged = false;
    const explicit = Promise.resolve(canvasProjectStorage.setItem('projects', snapshot('explicit'))).then(() => { acknowledged = true; });
    const latest = canvasProjectStorage.setItem('projects', snapshot('latest task input'));
    releaseOld();
    await vi.waitFor(() => expect(mocks.transaction).toHaveBeenCalledTimes(2));
    expect(acknowledged).toBe(false);
    expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ title: 'latest task input' }), 'project');
    releaseLatest();
    await Promise.all([old, explicit, latest]);
    expect(acknowledged).toBe(true);
  });

  it('checks a shared legacy Blob only once and preserves unrelated media references', async () => {
    vi.doUnmock('./canvasProjectDefaults');
    vi.resetModules();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { search: '', pathname: '/' } }));
    const projects = [{
      id: 'legacy',
      nodes: [
        { imageUrl: 'blob:expired' }, { videoUrl: 'blob:expired' }, { audioUrl: 'blob:live' }, { imageUrl: '/storage/stable.png' },
      ],
    }];
    const cancel = vi.fn(async () => {});
    const fetch = vi.fn(async (url: string) => ({ ok: url === 'blob:live', body: { cancel } }));
    vi.stubGlobal('fetch', fetch);
    const get = vi.fn().mockResolvedValueOnce({ ids: ['legacy'], version: 0 }).mockResolvedValueOnce(projects[0]);
    mocks.open.mockResolvedValue({ transaction: () => ({ objectStore: () => ({ get }), done: Promise.resolve() }) });
    const { canvasProjectStorage } = await import('./canvasProjectDefaults');
    const restored = (await canvasProjectStorage.getItem('projects'))!;
    expect(fetch.mock.calls).toEqual([['blob:expired'], ['blob:live']]);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(restored.state.projects[0].nodes.map((node: { missingMedia?: boolean }) => node.missingMedia)).toEqual([true, true, undefined, undefined]);
  });
});
