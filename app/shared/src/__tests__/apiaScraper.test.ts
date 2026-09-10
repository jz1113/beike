import { describe, expect, it } from 'vitest';
import { extractMediaFromApiaData } from '../apiaScraper';

describe('APIA Live 静态图片解析', () => {
  it('兼容文档中的 images/image，丢弃 videos/video', () => {
    const media = extractMediaFromApiaData({code:200,data:{type:'live',images:['https://cdn.test/1.jpg'],image:'https://cdn.test/2.jpg',videos:['https://cdn.test/1.mp4'],video:'https://cdn.test/live'}});
    expect(media.images).toEqual(['https://cdn.test/1.jpg','https://cdn.test/2.jpg']);
    expect(media.video).toBeNull();
  });
  it('嵌套 Live 对象优先静态图，支持 url_list 和数组型 data', () => {
    const media=extractMediaFromApiaData({type:'live',data:[{url:'https://cdn.test/stream',image:{url_list:['//cdn.test/1.jpg']}},{image:'https://cdn.test/2.jpg',video:'https://cdn.test/2.mp4'}]});
    expect(media.images).toEqual(['https://cdn.test/1.jpg','https://cdn.test/2.jpg']);
    expect(media.video).toBeNull();
  });
  it('不过度去重不同查询参数图片，过滤混入的视频', () => {
    const media=extractMediaFromApiaData({images:['https://cdn.test/image?id=1','https://cdn.test/image?id=2','https://cdn.test/image?id=1','https://cdn.test/live.mp4?x=1']});
    expect(media.images).toEqual(['https://cdn.test/image?id=1','https://cdn.test/image?id=2']);
  });
  it('普通视频仍保留视频，Live 缺图不会退回 Live 视频', () => {
    expect(extractMediaFromApiaData({cover:'https://cdn.test/cover.jpg',url:'https://cdn.test/normal.mp4'}).video).toBe('https://cdn.test/normal.mp4');
    const live=extractMediaFromApiaData({type:'live',video:'https://cdn.test/live.mp4'});
    expect(live.images).toEqual([]);
    expect(live.video).toBeNull();
  });
});
