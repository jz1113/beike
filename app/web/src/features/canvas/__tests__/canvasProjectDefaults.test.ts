import {expect,it} from 'vitest';
import {normalizeCanvasProjects,visibleCanvasProjects} from '../store/canvasProjectDefaults';
import {useCanvasStore} from '../store/useCanvasStore';
import type {CanvasProject} from '../types';
const project:CanvasProject={id:'p',title:'未命名项目',nodes:[],createdAt:1,updatedAt:1};
it('hides empty legacy drafts while retaining their state and names populated projects',()=>{
 expect(visibleCanvasProjects([project])).toEqual([]);
 expect(normalizeCanvasProjects([project])).toHaveLength(1);
 const populated={...project,nodes:[{id:'image',type:'image' as const,title:'番茄牛腩',x:0,y:0,width:100,height:100,createdAt:1}]};
 expect(visibleCanvasProjects([populated])[0].title).toBe('番茄牛腩');
 expect(visibleCanvasProjects([{...project,title:'手动命名'}])).toHaveLength(1);
});
it('removes only unchanged demo content and preserves edited preset projects',()=>{
 const demo:CanvasProject={...project,id:'project-preset-2',nodes:[{id:'node-3',type:'image',title:'三视图设定稿',imageUrl:'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=80',x:140,y:100,width:380,height:260,createdAt:1}]};
 expect(normalizeCanvasProjects([demo])).toEqual([]);
 expect(normalizeCanvasProjects([{...demo,nodes:[{...demo.nodes[0],x:200}]}])).toHaveLength(1);
 expect(normalizeCanvasProjects([{...demo,title:'保留这个项目'}])).toHaveLength(1);
});
it('reuses blank drafts and publishes with the first content title',()=>{
 useCanvasStore.setState({projects:[],activeProjectId:null});
 const store=useCanvasStore.getState();const first=store.createProject();const second=store.createProject();
 expect(first.id).toBe(second.id);
 expect(visibleCanvasProjects(useCanvasStore.getState().projects)).toHaveLength(0);
 store.addNode(first.id,{type:'image',title:'产品海报',x:0,y:0,width:100,height:100});
 expect(visibleCanvasProjects(useCanvasStore.getState().projects)[0].title).toBe('产品海报');
 expect(store.createProject().id).not.toBe(first.id);
});
