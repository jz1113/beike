import { Children, createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OutputReviewButtons } from './OutputReviewButtons';

describe('retained output review controls', () => {
  it('passes distinct acceptance, retry and rejection decisions to the caller', () => {
    const onDecide = vi.fn();
    let tree!: ReactElement<{ children?: React.ReactNode }>;
    function Harness() { tree = OutputReviewButtons({ onDecide }); return tree; }
    renderToStaticMarkup(createElement(Harness));
    const buttons = Children.toArray(tree.props.children).flatMap(child => Array.isArray(child) ? child : [child])
      .filter((child): child is ReactElement<{ onClick: () => void; children: string }> => isValidElement(child) && child.type === 'button');
    for (const label of ['采用', '重做', '淘汰']) {
      const button = buttons.find(child => child.props.children === label);
      expect(button).toBeDefined();
      button!.props.onClick();
    }
    expect(onDecide.mock.calls).toEqual([['accepted'], ['retry_requested'], ['rejected']]);
  });
});
