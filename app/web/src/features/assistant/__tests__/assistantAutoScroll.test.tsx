// @vitest-environment happy-dom
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAssistantAutoScroll } from '../hooks/useAssistantAutoScroll';

function Chat({ open = true, session = 'a', content = 'hello' }) {
  const { scrollRef, onScroll } = useAssistantAutoScroll(open, session, content);
  return <div ref={scrollRef} onScroll={onScroll} data-testid="scroll">{content}</div>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup() {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
}
describe('助手会话滚动', () => {
  it('打开与重新打开都定位最新消息', () => {
    setup();
    const view = render(<Chat />);
    const box = view.getByTestId('scroll');
    expect(box.scrollTop).toBe(1000);
    box.scrollTop = 10;
    fireEvent.scroll(box);
    view.rerender(<Chat open={false} />);
    view.rerender(<Chat open />);
    expect(box.scrollTop).toBe(1000);
  });
  it('阅读历史不被新回复拉走，切换会话仍定位底部', () => {
    setup();
    const view = render(<Chat />);
    const box = view.getByTestId('scroll');
    box.scrollTop = 100;
    fireEvent.scroll(box);
    view.rerender(<Chat content="new reply" />);
    expect(box.scrollTop).toBe(100);
    view.rerender(<Chat session="b" content="another conversation" />);
    expect(box.scrollTop).toBe(1000);
  });
  it('接近底部时继续跟随新消息', () => {
    setup();
    const view = render(<Chat />);
    const box = view.getByTestId('scroll');
    box.scrollTop = 790;
    fireEvent.scroll(box);
    view.rerender(<Chat content="streamed reply" />);
    expect(box.scrollTop).toBe(1000);
  });
});
