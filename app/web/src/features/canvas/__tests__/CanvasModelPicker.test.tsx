import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasModelPicker } from '../components/CanvasModelPicker';
afterEach(cleanup);
const models = [{id:'model-a',name:'模型 A'}, {id:'model-b',name:'模型 B'}];
it('lists configured models without search, selects actual id and restores trigger focus', () => {
  const change = vi.fn();
  render(<CanvasModelPicker models={models} value="model-a" onChange={change} />);
  const trigger = screen.getByRole('button', {name:'绘图模型'});
  fireEvent.click(trigger);
  expect(screen.getByRole('button', {name:/模型 A/}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', {name:/模型 B/}));
  expect(change).toHaveBeenCalledWith('model-b');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('supports arrow navigation and Escape', () => {
  render(<CanvasModelPicker models={models} value="model-a" onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button',{name:'绘图模型'}));
  fireEvent.keyDown(screen.getByRole('button', {name:/模型 A/}), {key:'ArrowDown'});
  expect(document.activeElement).toBe(screen.getByRole('button', {name:/模型 B/}));
  fireEvent.keyDown(screen.getByRole('dialog'), {key:'Escape'});
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('anchors the menu bottom above its trigger regardless of filtered list height', () => {
  render(<CanvasModelPicker models={models} value="model-a" onChange={vi.fn()} />);
  const trigger = screen.getByRole('button',{name:'绘图模型'});
  const rect = vi.spyOn(trigger,'getBoundingClientRect').mockReturnValue({left:100,right:240,top:600,bottom:632,width:140,height:32,x:100,y:600,toJSON:()=>({})});
  fireEvent.click(trigger);
  const menu = screen.getByRole('dialog');
  expect(menu.style.bottom).toBe(`${window.innerHeight - 600 + 8}px`);
  expect(menu.style.top).toBe('');
  expect(menu.style.bottom).toBe(`${window.innerHeight - 600 + 8}px`);
  rect.mockRestore();
});
