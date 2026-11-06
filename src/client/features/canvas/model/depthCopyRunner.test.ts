import {expect,it,vi} from 'vitest';
import {createDepthCopyRunner} from './depthCopyRunner';
import type {StudioScene} from './types';
import type {StudioTaskCommands} from './studioTaskState';
function fixture(){
 const scene:StudioScene={nodes:[],connections:[],groups:[],textBoxes:[],strokes:[],view:{x:0,y:0,zoom:1}};
 const add=(key:string,type:string,settings:Record<string,unknown>={})=>scene.nodes.push({id:'copy-'+key,type,nodeName:key,settings});
 for(const key of ['product','person','background'])add(key,'input-image',{mediaType:'image'});
 add('source','input-image',{mediaType:'video'});
 add('analysis','text-node');add('keyframe','gen-image');add('depth','gen-video',{beikeOperation:'depth-video'});
 add('video','gen-video');add('compose','gen-video',{beikeOperation:'compose-original'});
 for(const [from,to] of [['source','analysis'],['product','keyframe'],['person','keyframe'],['source','depth'],['keyframe','video'],['depth','video'],['video','compose']])
  scene.connections.push({id:from+'-'+to,from:'copy-'+from,to:'copy-'+to});
 const node=(key:string)=>scene.nodes.find(n=>n.id==='copy-'+key)!;
 for(const key of ['source','product','person','background'])node(key).content='/storage/'+key+(key==='source'?'.mp4':'.png');
 node('video').settings={...node('video').settings as object,model:'my-video-model',duration:'10s',beikeVideoMode:'omni'};
 const events:string[]=[];
 const commands:StudioTaskCommands={read:()=>scene,update:vi.fn(),stop:vi.fn(),
 runText:vi.fn(async()=>{events.push('analysis');node('analysis').settings={...node('analysis').settings as object,text:'已核对的分镜',_chatCompletedAt:1};}),
 run:vi.fn(async id=>{events.push(id);Object.assign(scene.nodes.find(n=>n.id===id)!,{content:'/storage/'+id+'.mp4',beikeLastTaskId:'new-'+id});return true;})};
 const save=vi.fn(async()=>{}),runner=createDepthCopyRunner({commands:()=>commands,save,stopTask:vi.fn()});
 return {scene,node,commands,runner,events,save};
}
it('runs depth copy in order using the selected model and preserves the source and graph',async()=>{
 const f=fixture(),edges=JSON.stringify(f.scene.connections);await f.runner.run(()=>{});
 expect(f.events).toEqual(['analysis','copy-keyframe','copy-depth','copy-video','copy-compose']);
 expect(f.node('video').settings).toMatchObject({model:'my-video-model',duration:'10s',beikeVideoMode:'omni'});
 expect(f.node('source').content).toBe('/storage/source.mp4');expect(JSON.stringify(f.scene.connections)).toBe(edges);
 expect(f.save).toHaveBeenCalledTimes(6);
});
it('stops on missing input, failed output or an altered model before submitting further stages',async()=>{
 const missing=fixture();missing.node('person').content='';await expect(missing.runner.run(()=>{})).rejects.toThrow('添加素材');expect(missing.commands.runText).not.toHaveBeenCalled();
 const failed=fixture();vi.mocked(failed.commands.run).mockResolvedValue(false);await expect(failed.runner.run(()=>{})).rejects.toThrow('未完成');expect(failed.commands.run).toHaveBeenCalledTimes(1);
 const changed=fixture();vi.mocked(changed.commands.runText!).mockImplementation(async()=>{Object.assign(changed.node('video').settings as object,{model:'new-choice'});});await expect(changed.runner.run(()=>{})).rejects.toThrow('已修改');expect(changed.commands.run).not.toHaveBeenCalled();
});
