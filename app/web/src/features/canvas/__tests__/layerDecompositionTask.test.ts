import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/apiClient',()=>({apiFetch:vi.fn()}));
import {apiFetch} from '@/lib/apiClient';
import {runLayerDecompositionTask} from '../layerDecompositionTask';
import {useCanvasStore} from '../store/useCanvasStore';
const source={id:'source',type:'image' as const,imageUrl:'/original.png',x:10,y:20,width:300,height:400,createdAt:1};
afterEach(()=>vi.clearAllMocks());
it('creates a linked pending node immediately and automatically fills all layers',async()=>{
 useCanvasStore.setState({projects:[{id:'p',title:'test',createdAt:1,updatedAt:1,nodes:[source]}]});
 let ready!:(s:string)=>void;
 vi.mocked(apiFetch).mockResolvedValue(Response.json({success:true,layers:[{url:'https://example.com/base.png',name:'底图',zIndex:0,width:600,height:800},{url:'https://example.com/layer.png',name:'人物',zIndex:1,width:200,height:300,bounds:[100,100,299,399]}]}));
 const work=runLayerDecompositionTask('p',source,()=>new Promise(r=>{ready=r;}),'拆分','test');
 expect(useCanvasStore.getState().projects[0].nodes[1]).toMatchObject({status:'generating',referenceNodeIds:['source'],x:390,y:20});
 ready('data:image/png;base64,AAAA');await work;
 const nodes=useCanvasStore.getState().projects[0].nodes;
 expect(nodes).toHaveLength(3);
 expect(nodes[1]).toMatchObject({status:'success',imageUrl:'https://example.com/base.png',referenceNodeIds:['source']});
 expect(nodes[2]).toMatchObject({title:'人物',x:440,y:70,width:100,height:150});
});
it('records preparation failures on the task instead of leaving it generating',async()=>{
 useCanvasStore.setState({projects:[{id:'p',title:'test',createdAt:1,updatedAt:1,nodes:[source]}]});
 await runLayerDecompositionTask('p',source,async()=>{throw new Error('原图失效');},'拆分','failed');
 expect(useCanvasStore.getState().projects[0].nodes[1]).toMatchObject({status:'error',content:'原图失效'});
 expect(apiFetch).not.toHaveBeenCalled();
});

it('places every coordinate-free gateway result on the canvas with source connections',async()=>{
 useCanvasStore.setState({projects:[{id:'p',title:'test',createdAt:1,updatedAt:1,nodes:[source]}]});
 vi.mocked(apiFetch).mockResolvedValue(Response.json({success:true,layers:[0,1,2].map(index=>({url:`https://example.com/${index}.png`,name:`图层 ${index+1}`,zIndex:index,width:0,height:0,placement:'separate'}))}));
 await runLayerDecompositionTask('p',source,async()=> 'data:image/png;base64,AAAA','拆分','gateway');
 const nodes=useCanvasStore.getState().projects[0].nodes.slice(1);
 expect(nodes).toHaveLength(3);
 nodes.forEach((node,index)=>expect(node).toMatchObject({status:'success',referenceNodeIds:['source'],imageUrl:`https://example.com/${index}.png`,x:390+index*340,y:20}));
 await runLayerDecompositionTask('p',source,async()=> 'unused','拆分','gateway');
 expect(apiFetch).toHaveBeenCalledTimes(1);
});
