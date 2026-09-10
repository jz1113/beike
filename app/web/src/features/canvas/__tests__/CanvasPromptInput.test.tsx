import { useRef, useState } from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {CanvasPromptInput, type CanvasPromptInputRef} from '../components/CanvasPromptInput';
afterEach(cleanup);
it('inserts a thumbnail pill through the click entry and serializes the reference', () => {
  function Harness() {
    const [value, setValue] = useState('');
    const ref = useRef<CanvasPromptInputRef>(null);
    return <><button onClick={() => ref.current?.insertReference(0)}>引用</button><output>{value}</output><CanvasPromptInput ref={ref} value={value} references={['/a.png']} onChange={setValue} onSubmit={vi.fn()} /></>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText('引用'));
  expect(screen.getByRole('textbox').querySelector('[data-mention-name="图片1"]')).not.toBeNull();
  expect(screen.getByRole('status').textContent).toContain('@图片1');
});
it('opens the @ menu and inserts a selected image pill', () => {
  const change = vi.fn();
  function Harness() {
    const [value, setValue] = useState('');
    return <CanvasPromptInput value={value} references={['/a.png']} onChange={next => {change(next); setValue(next);}} onSubmit={vi.fn()} />;
  }
  render(<Harness />);
  const input = screen.getByRole('textbox');
  input.textContent = '@';
  const range = document.createRange();
  range.setStart(input.firstChild!, 1); range.collapse(true);
  window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
  fireEvent.input(input);
  fireEvent.click(screen.getByRole('option', {name:'图片1'}));
  expect(input.querySelector('[data-mention-name="图片1"]')).not.toBeNull();
  expect(change.mock.calls.at(-1)?.[0]).toContain('@图片1');
});
it('keeps the caret on the second line when deleting a reference', () => {
  function Harness() {
    const [value,setValue]=useState('第一行\n第二行@图片1 后文');
    return <CanvasPromptInput value={value} references={['/a.png']} onChange={setValue} onSubmit={vi.fn()} />;
  }
  render(<Harness />);
  const editor=screen.getByRole('textbox'); editor.focus();
  const pill=editor.querySelector('[data-mention-name]')!;
  const range=document.createRange(); range.setStartAfter(pill);range.collapse(true);
  const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);
  fireEvent.keyDown(editor,{key:'Backspace'});
  expect(editor.querySelector('[data-mention-name]')).toBeNull();
  expect(editor.textContent).toBe('第一行\n第二行 后文');
  const before=document.createRange();before.selectNodeContents(editor);before.setEnd(selection.anchorNode!,selection.anchorOffset);
  expect(before.toString()).toBe('第一行\n第二行');
});
