import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {CanvasLayerDecomposition} from '../components/CanvasLayerDecomposition';
afterEach(cleanup);
it('opens the image workspace with selection controls and dismisses without submitting',()=>{
 render(<div className="canvas-node-card"><CanvasLayerDecomposition projectId="p" node={{id:'image',type:'image',imageUrl:'/sample.png',x:0,y:0,width:300,height:200,createdAt:1}} /></div>);
 fireEvent.click(screen.getByRole('button',{name:'图层分离'}));
 expect(screen.queryByRole('img',{name:'待拆分原图'})).toBeNull();
 expect(screen.getByRole('region',{name:'图层分离'}).closest('.canvas-node-card')).not.toBeNull();
 expect(screen.getByLabelText('框选拆分区域')).toBeTruthy();
 expect(screen.getByRole('button',{name:'撤销框选'}).hasAttribute('disabled')).toBe(true);
 expect(screen.getByRole('button',{name:'重做框选'}).hasAttribute('disabled')).toBe(true);
 expect(screen.getByRole('textbox',{name:'拆分要求'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'取消'}));
 expect(screen.queryByRole('region',{name:'图层分离'})).toBeNull();
});
