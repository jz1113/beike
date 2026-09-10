import {expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';
import {CanvasLayersPanel} from '../components/CanvasLayersPanel';
import {useCanvasStore} from '../store/useCanvasStore';
import type {CanvasProject} from '../types';
vi.mock('@/lib/apiClient',()=>({proxyMediaUrl:(url:string)=>url,apiFetch:vi.fn()}));
afterEach(cleanup);
it('persists visibility, locking and paint order through panel controls',()=>{
 const project:CanvasProject={id:'p',title:'test',createdAt:1,updatedAt:1,nodes:[0,1].map(index=>({id:`l${index}`,type:'image',title:`层${index}`,imageUrl:'/a.png',layerGroupId:'g',layerOrder:index,x:0,y:0,width:100,height:100,createdAt:1}))};
 useCanvasStore.setState({projects:[project]});
 render(<CanvasLayersPanel project={project} selectedId="l0" onSelect={vi.fn()}/>);
 fireEvent.click(screen.getByLabelText('隐藏 层0'));
 expect(useCanvasStore.getState().projects[0].nodes[0].layerHidden).toBe(true);
 fireEvent.click(screen.getByLabelText('上移 层0'));
 expect(useCanvasStore.getState().projects[0].nodes.map(n=>n.layerOrder)).toEqual([1,0]);
 fireEvent.click(screen.getByLabelText('锁定 层0'));
 expect(useCanvasStore.getState().projects[0].nodes[0].layerLocked).toBe(true);
});
