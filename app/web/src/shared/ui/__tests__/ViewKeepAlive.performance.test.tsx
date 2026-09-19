import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ViewKeepAlivePanel } from '../ViewKeepAlive';
afterEach(cleanup);
it('retains hidden DOM without parent-driven renders and refreshes on activation', () => {
  let renders = 0;
  function Child({value}:{value:number}) { renders++; return <span>{value}</span>; }
  const {rerender, container} = render(<ViewKeepAlivePanel view="home" currentView="home"><Child value={1}/></ViewKeepAlivePanel>);
  const before = renders;
  rerender(<ViewKeepAlivePanel view="home" currentView="assets"><Child value={2}/></ViewKeepAlivePanel>);
  expect(renders).toBe(before);
  expect(container.textContent).toBe('1');
  rerender(<ViewKeepAlivePanel view="home" currentView="home"><Child value={3}/></ViewKeepAlivePanel>);
  expect(container.textContent).toBe('3');
});
it.each(['workshop', 'replicate'] as const)('retains %s session when visiting settings and another workspace', view => {
  const { rerender, container } = render(<ViewKeepAlivePanel view={view} currentView={view}><input defaultValue="批量工坊草稿" /></ViewKeepAlivePanel>);
  const originalInput = container.querySelector('input')!;
  originalInput.value = '已编辑且有任务';
  rerender(<ViewKeepAlivePanel view={view} currentView="settings"><input defaultValue="初始" /></ViewKeepAlivePanel>);
  expect(container.querySelector('input')).toBe(originalInput);
  rerender(<ViewKeepAlivePanel view={view} currentView={view}><input defaultValue="初始" /></ViewKeepAlivePanel>);
  expect(container.querySelector('input')?.value).toBe('已编辑且有任务');
});
