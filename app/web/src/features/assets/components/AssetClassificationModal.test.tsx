import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AssetClassificationModal from './AssetClassificationModal';
afterEach(cleanup);
it('submits multiple applicable categories and universal independently', () => {
  const save = vi.fn(async()=>{});
  render(<AssetClassificationModal categories={[{id:'a',name:'首饰',parentId:null,position:0},{id:'b',name:'服饰',parentId:null,position:1}]} fullPrompt={false} count={1} initialIds={['a']} initialUniversal={false} busy={false} onSave={save} onClose={()=>{}}/>);
  fireEvent.click(screen.getByLabelText('服饰'));
  fireEvent.click(screen.getByLabelText('通用素材（适用所有品类）'));
  fireEvent.click(screen.getByRole('button',{name:'保存'}));
  expect(save).toHaveBeenCalledWith(['a','b'],true);
});
