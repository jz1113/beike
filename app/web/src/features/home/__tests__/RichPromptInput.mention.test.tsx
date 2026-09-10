// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { RichPromptInput } from '../components/prompt-bar/RichPromptInput';

describe('RichPromptInput — @ 菜单自动触发与删除 @ 自动关闭机制', () => {
  beforeEach(() => {
    cleanup();
  });

  it('输入 @ 时应触发 onTriggerAtMenu；当删除 @ 时应自动触发 onCloseAtMenu', () => {
    const handleTrigger = vi.fn();
    const handleClose = vi.fn();
    const handleChange = vi.fn();

    const { container } = render(
      <RichPromptInput
        value=""
        onChange={handleChange}
        allSubjects={[]}
        quickRefImages={[]}
        onTriggerAtMenu={handleTrigger}
        onCloseAtMenu={handleClose}
      />
    );

    const editable = container.querySelector('.rich-mention-contenteditable') as HTMLDivElement;
    expect(editable).toBeTruthy();

    // 1. 模拟输入 "@"
    editable.textContent = '@';
    const textNode = editable.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 1);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    fireEvent.input(editable);
    expect(handleTrigger).toHaveBeenCalled();

    // 2. 模拟删除 "@"（光标前无 @）
    editable.textContent = '';
    sel?.removeAllRanges();

    fireEvent.input(editable);
    expect(handleClose).toHaveBeenCalled();
  });

  it('按下 Escape 键时应自动触发 onCloseAtMenu', () => {
    const handleClose = vi.fn();

    const { container } = render(
      <RichPromptInput
        value="@"
        onChange={vi.fn()}
        allSubjects={[]}
        quickRefImages={[]}
        onCloseAtMenu={handleClose}
      />
    );

    const editable = container.querySelector('.rich-mention-contenteditable') as HTMLDivElement;
    expect(editable).toBeTruthy();

    fireEvent.keyDown(editable, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('多行富文本输入时：输入框具备自适应容器属性与平齐对齐排版，避免 float 环绕破坏文本规整性', () => {
    const { container } = render(
      <RichPromptInput
        value="制作制作制作制作制作制作"
        onChange={vi.fn()}
        allSubjects={[]}
        quickRefImages={[]}
        variant="composer"
      />
    );

    const editable = container.querySelector('.rich-mention-contenteditable') as HTMLElement;
    expect(editable).toBeTruthy();
    expect(editable.className).toContain('flex-1');
    expect(editable.className).toContain('overflow-y-auto');
    expect(editable.className).toContain('whitespace-pre-wrap');
    expect(editable.className).toContain('break-words');
    expect(editable.className).not.toContain('float-left');
  });
});


it.each(['text', 'root', 'empty'])('Backspace removes a mention across its spacer (%s caret)', position => {
  cleanup();
  const onChange = vi.fn();
  const {container} = render(<RichPromptInput value="@图片1" onChange={onChange} allSubjects={[]} quickRefImages={['https://example.com/a.png']} />);
  const editor = container.querySelector('.rich-mention-contenteditable') as HTMLDivElement;
  const pill = editor.querySelector('.inline-mention-pill')!;
  editor.replaceChildren(pill);
  const spacer = document.createTextNode('\u00a0');
  editor.append(spacer);
  const empty = document.createTextNode('');
  editor.append(empty);
  const range = document.createRange();
  if (position === 'root') range.setStart(editor, 3);
  else range.setStart(position === 'empty' ? empty : spacer, position === 'empty' ? 0 : 1);
  range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  fireEvent.keyDown(editor, {key:'Backspace'});
  expect(editor.querySelector('.inline-mention-pill')).toBeNull();
  expect(onChange).toHaveBeenLastCalledWith('');
});

it('keeps the mention when normal text is between it and the caret', () => {
  cleanup();
  const onChange=vi.fn();
  const {container}=render(<RichPromptInput value="@图片1" onChange={onChange} allSubjects={[]} quickRefImages={['https://example.com/a.png']}/>);
  const editor=container.querySelector('.rich-mention-contenteditable') as HTMLDivElement;
  const text=document.createTextNode('abc'); editor.append(text);
  const range=document.createRange(); range.setStart(text,3); range.collapse(true);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);
  fireEvent.keyDown(editor,{key:'Backspace'});
  expect(editor.querySelector('.inline-mention-pill')).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});
