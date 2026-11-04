import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import type { StoredSalesScript } from '@client/features/sales/api/salesScripts';
import { indexLibrary } from './mediaIndex';
import type { CanvasProject } from '@client/features/canvas/model/types';
import type { CustomAssetItem } from '@client/features/assets/model/customAssetStore';

const project: CanvasProject = {
  id:'p',title:'项目一',subtitle:'',createdAt:0,updatedAt:0,nodes:[],
  studioScene:{connections:[],strokes:[],textBoxes:[],groups:[],view:{x:0,y:0,zoom:1},nodes:[
    {id:'voice',type:'input-image',nodeName:'旁白',previewType:'audio',content:'/storage/narration',settings:{mediaType:'audio'}},
    {id:'image',type:'gen-image',nodeName:'场景',content:'/storage/scene.png',settings:{generatedImages:[{fullUrl:'/storage/scene.png'},{fullUrl:'/storage/alternate.png'}]}},
    {id:'text',type:'text-node',content:'https://example.com/reference'},
  ]},
};
const local:CustomAssetItem = {id:'l',name:'封面',category:'file',folder:'我的文件夹/参考',mediaKind:'image',mediaUrl:'/storage/scene.png',createdAt:0,updatedAt:0};

describe('统一素材索引',()=>{
  it('applies moved categories without creating extra cards or losing original sources',()=>{
    const original=indexLibrary([local],[],[],null,null);
    const placement:CustomAssetItem={id:'placement',category:'file',name:'封面',placementKey:'image|'+local.mediaUrl,
      placementFolders:['场景/室外'],createdAt:0,updatedAt:0};
    const moved=indexLibrary([local,placement],[],[],null,null);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toEqual({...original[0],folders:['场景/室外'],classificationMoved:true});
  });

  it('indexes each script once, including drafts and scripts without a playable video', () => {
    const source: StoredSalesScript = {
      id:'dance', title:'蓝天屋顶上的全身舞蹈', status:'verified', version:1, useCount:0, updatedAt:'',
      videoUrl:'/storage/dance.mp4', depthVideoUrl:'/storage/dance-depth.mp4', videoHash:'', model:'', promptVersion:'',
      script:normalizeScriptTemplate({durationSec:5, shots:[{beats:[{start:0,end:5,action:'跳舞'}]}]})!,
    };
    const draft = {...source, id:'draft', status:'draft' as const, depthVideoUrl:'', videoUrl:'/storage/draft.mp4'};
    const items = indexLibrary([],[],[],null,null,[source,draft]);
    expect(items).toHaveLength(2);
    expect(items.map(item=>item.url)).toEqual(['dance','draft']);
    expect(items[0]).toMatchObject({kind:'script',folders:['动作'],salesChoices:[{type:'script',id:source.id,title:source.title}],
      sources:[{type:'script',id:'dance'}]});
    const ref = {...local, mediaKind:undefined, mediaUrl:undefined, folder:'动作/舞蹈',scriptId:'dance'};
    const collected = indexLibrary([ref],[],[],null,null,[source]);
    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({kind:'script',folders:['动作','动作/舞蹈'],record:source});
    expect(items[1].salesChoices).toBeUndefined();
    const placement:CustomAssetItem={id:'move-script',category:'file',name:source.title,
      placementKey:'script|dance',placementFolders:['我的文件夹/动作参考'],createdAt:0,updatedAt:0};
    const moved=indexLibrary([placement],[],[],null,null,[source]);
    expect(moved[0]).toMatchObject({folders:['我的文件夹/动作参考'],record:source,salesChoices:items[0].salesChoices});
  });
  it('保留旧版本素材并把当前视频与历史中的相同结果合并', () => {
    const nodes = [{id:'movie', type:'gen-video', previewType:'video', content:'/storage/new.mp4', settings:{
      generatedImages:[{fullUrl:'/storage/new.mp4'}],
      generationVersions:[{originalUrl:'/storage/old.mp4', mediaType:'video'}, {originalUrl:'/storage/new.mp4', mediaType:'video'}],
    }}];
    const items = indexLibrary([], [], [{...project, studioScene:{...project.studioScene!, nodes}}], null, null);
    expect(items.map(item=>[item.kind,item.url])).toEqual([['video','/storage/new.mp4'],['video','/storage/old.mp4']]);
  });

  it('includes task reference images while excluding generation history results',()=>{
    const items = indexLibrary([], [{
      id:'task', title:'生成图片', prompt:'', model:'', size:'', quality:'', mediaType:'image',
      status:'SUCCESS', progress:'', useReferenceImage:true,
      resultUrl:'/storage/result.png', referenceImageUrl:'/storage/reference.png',
    }], [], null, null);
    expect(items.map(({url, folders}) => ({url, folders}))).toEqual([
      {url:'/storage/reference.png', folders:['任务/参考图片']},
    ]);
  });
  it('indexes shared scenes without adding outfit or prompt group covers and folders',()=>{
    const scene = {id:'scene', title:'室内场景', spatialType:'indoor', coverUrl:'/storage/scene.png'};
    const items = indexLibrary([], [], [], null, {
      personas:[], outfits:[{id:'outfit', coverUrl:'/storage/outfit.png'}, {id:'shared-cover', coverUrl:scene.coverUrl}], scenes:[scene], actions:[],
      fullPrompts:[{id:'prompt', coverUrl:'/storage/prompt.png'}, {id:'overlap', coverUrl:scene.coverUrl}],
      productCategories:[], lastUpdated:0, isLoaded:true,
    });
    expect(items.map(({url,folders}) => ({url,folders}))).toEqual([
      {url:scene.coverUrl, folders:['场景/室内']},
    ]);
  });
  it('groups overlapping scene records and older reference images under the classified scene',()=>{
    const main = '/storage/main.jpg', right = '/storage/right.jpg', extra = '/storage/extra.jpg';
    const scene = {id:'garden', title:'花园', coverUrl:main, spatialType:'outdoor', tags:'', category:'', description:'',
      lighting:'', suitableCategories:[], source:'scene_library', sourceImages:[right, extra, main],
      dimensions:JSON.stringify({sceneViews:{main, right}})};
    const items = indexLibrary([], [], [], {scenes:[scene], personas:[], actions:[], voices:[], bgms:[]}, {
      personas:[], outfits:[], scenes:[{...scene, coverUrl:right}], actions:[], fullPrompts:[], productCategories:[], lastUpdated:0, isLoaded:true,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({url:main, folders:['场景/室外'], views:[
      {label:'主图', url:main}, {label:'右侧视角', url:right}, {label:'参考图 1', url:extra},
    ]});
    const placement:CustomAssetItem={id:'move-scene',category:'file',name:scene.title,
      placementKey:'image|'+main,placementFolders:['我的文件夹/参考'],createdAt:0,updatedAt:0};
    const moved=indexLibrary([placement],[],[],{scenes:[scene],personas:[],actions:[],voices:[],bgms:[]},null);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({folders:['我的文件夹/参考'],views:items[0].views,salesChoices:items[0].salesChoices});

  });
  it('uses saved persona demographics when the shared cover has a generic title',()=>{
    const cover = '/storage/person.png';
    const person = {id:'p', name:'人物 1', tags:'', description:'', dimensions:JSON.stringify({audience:'adult_male',personaAge:'middle'}),
      sourceImages:[cover], avatarUrl:cover, faceUrl:cover, fullBodyUrl:cover, hasReferenceImage:true, source:'persona_library'};
    const items = indexLibrary([], [], [], {scenes:[], personas:[person], actions:[], voices:[], bgms:[]}, {
      personas:[{id:'p', title:'人物', coverUrl:cover}], outfits:[], scenes:[], actions:[], fullPrompts:[], productCategories:[], lastUpdated:0, isLoaded:true,
    });
    expect(items.map(item => item.folders)).toEqual([['人物/男/中年']]);
    expect(items[0].sources).toEqual([{type:'persona',id:'p',name:'人物 1',folder:'人物/男/中年'}]);
  });
  it('deduplicates media without losing its project, collection or search names',()=>{
    const items=indexLibrary([local],[],[project],null,null);
    expect(items.filter(i=>i.url==='/storage/scene.png')).toHaveLength(1);
    expect(items.find(i=>i.url==='/storage/scene.png')).toMatchObject({folders:['我的文件夹/参考','画布项目/项目一'],keywords:expect.arrayContaining(['场景'])});
  });
  it('keeps separate delete targets when a voice, a BGM and a local collection share audio',()=>{
    const url = '/storage/sample.wav';
    const items = indexLibrary([{...local, mediaKind:'audio', mediaUrl:url}], [], [], {
      personas:[], scenes:[], actions:[],
      voices:[{id:'v', name:'人声', sampleAudioUrl:url, gender:'female', voiceId:'', ttsVoice:'', promptText:'', tags:[], source:'voice_library'}],
      bgms:[{id:'b', title:'BGM', audioUrl:url, source:'custom_bgm', description:'', moodTags:[], bpm:90, durationSec:10, suitableCategories:[], license:''}],
    }, null);
    expect(items).toHaveLength(1);
    expect(items[0].sources?.map(({type,id,folder})=>[type,id,folder])).toEqual([
      ['local','l','我的文件夹/参考'],['sound','v','声音/人声'],['sound','b','声音/BGM'],
    ]);
  });
  it('preserves audio and alternate outputs and excludes text nodes containing web links',()=>{
    const items=indexLibrary([],[],[project],null,null);
    expect(items.map(i=>[i.kind,i.url])).toEqual([['audio','/storage/narration'],['image','/storage/scene.png'],['image','/storage/alternate.png']]);
  });
});
