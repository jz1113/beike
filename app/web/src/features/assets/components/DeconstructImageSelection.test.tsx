import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import DeconstructImageSelection from './DeconstructImageSelection';
afterEach(cleanup);
it('defaults to all selected, excludes individual images, cancels and restores a whole set', () => {
  function Preview() {
    const [excludedImageIndices, setExcluded] = useState<number[]>([]);
    return <DeconstructImageSelection item={{id:'a',name:'album',images:['a','b','c'],status:'pending',excludedImageIndices}} disabled={false} onChange={setExcluded}/>;
  }
  render(<Preview/>);
  expect(screen.getByText(/已选 3 \/ 3/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText('选择第 2 张图片'));
  expect(screen.getByText(/已选 2 \/ 3/)).toBeTruthy();
  fireEvent.click(screen.getByText('取消整套'));
  expect(screen.getByText(/已选 0 \/ 3/)).toBeTruthy();
  fireEvent.click(screen.getByText('全选本套'));
  expect(screen.getByText(/已选 3 \/ 3/)).toBeTruthy();
});
