import { createRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VirtualAssetGrid } from './VirtualAssetGrid';
const state = vi.hoisted(() => ({offset:0}));
vi.mock('@tanstack/react-virtual', () => ({useVirtualizer: () => ({
  getTotalSize: () => 300, getVirtualItems: () => [{key:'a',index:0,start:state.offset}],
  measureElement: () => {}, measure: () => {}, scrollToOffset: () => {},
})}));
afterEach(cleanup);
it('reuses card content when only row position changes and refreshes changed data', () => {
  const renderItem = vi.fn((item:{id:string;title:string}) => <span>{item.title}</span>);
  const scrollRef=createRef<HTMLDivElement>();
  const items=[{id:'a',title:'original'}];
  const props={items,scrollRef,resetKey:'all',openItemId:null,renderItem};
  const {rerender,container}=render(<VirtualAssetGrid {...props}/>);
  const count=renderItem.mock.calls.length;
  state.offset=100;
  rerender(<VirtualAssetGrid {...props}/>);
  expect(renderItem).toHaveBeenCalledTimes(count);
  expect(container.querySelector('[data-index]')?.getAttribute('style')).toContain('100px');
  rerender(<VirtualAssetGrid {...props} items={[{id:'a',title:'updated'}]}/>);
  expect(container.textContent).toBe('updated');
});
