// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { expect, it, afterEach, vi } from 'vitest';
import ProductCardWidget from '../ProductCardWidget';
afterEach(cleanup);
it('按来源筛选后设置参考图，关闭弹窗释放完整图集', () => {
 const images=['https://images.test/a.jpg','https://images.test/b.jpg'];
 const reference=vi.fn();
 const preview=vi.fn();
 const {container}=render(<ProductCardWidget onSetAsReference={reference} onPreviewImage={preview} product={{itemId:'',title:'图集',platform:'xiaohongshu',allImages:images,mainImages:[],detailImages:[],skuImages:[],imageSources:[{url:images[0],label:'笔记 A'},{url:images[1],label:'笔记 B'}]}} />);
 fireEvent.click(screen.getByRole('button',{name:'选择参考图'}));
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'笔记 B'}});
 expect(container.querySelectorAll('dialog img')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'将素材 2 设为参考'}));
 expect(reference).toHaveBeenCalledWith(images[1]);
 fireEvent.click(screen.getByRole('button',{name:'关闭图集'}));
 expect(container.querySelectorAll('dialog img')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'预览素材 1'}));
 expect(preview).toHaveBeenCalledWith(images[0]);
});
it('216张素材每页仅挂载24张，翻页可访问后续素材', () => {
 const images=Array.from({length:216},(_,i)=>`https://images.test/${i}.jpg`);
 const {container}=render(<ProductCardWidget product={{itemId:'test',title:'采集图集',platform:'xiaohongshu',allImages:images,mainImages:images,detailImages:[],skuImages:[]}} />);
 expect(container.querySelectorAll('img')).toHaveLength(6);
 expect(screen.queryByText('下一页')).toBeNull();
 fireEvent.click(screen.getByRole('button', {name:'查看全部 216 张'}));
 expect(container.querySelectorAll('dialog img')).toHaveLength(24);
 expect(screen.getByText('第 1 / 9 页 · 共 216 张')).toBeTruthy();
 fireEvent.click(screen.getByText('下一页'));
 expect(container.querySelectorAll('dialog img')).toHaveLength(24);
 expect(screen.getByText('第 2 / 9 页 · 共 216 张')).toBeTruthy();
 expect(screen.getByAltText('素材 25')).toBeTruthy();
});
it('社媒面板显示明确选图入口，不展示电商参数和提示词按钮', () => {
 let selected=false;
 render(<ProductCardWidget onAnalyzeImages={()=>{selected=true}} product={{itemId:'',title:'图集',platform:'xiaohongshu',allImages:['https://images.test/1.jpg'],mainImages:['https://images.test/1.jpg'],detailImages:[],skuImages:[],props:{链接数量:'1'},apiUsed:'tool:internal'}} />);
 expect(screen.queryByText(/商品全量规格/)).toBeNull();
 expect(screen.queryByText(/tool:internal/)).toBeNull();
 expect(screen.queryByText(/一键为该商品/)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'帮我挑图'}));
 expect(selected).toBe(true);
});
