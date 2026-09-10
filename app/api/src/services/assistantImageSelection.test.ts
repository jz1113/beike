import { expect, it, vi } from 'vitest';
import { shortlistImages } from './assistantImageSelection';
it('完整分批查看所有图片，最后一批也进入候选，保持来源覆盖', async () => {
 const images=Array.from({length:37},(_,i)=>({url:`https://img.test/${i}.jpg`,label:`素材${i+1}`,sourceUrl:`https://source.test/${i%3}`}));
 const fetcher=vi.fn(async (_url, init) => {
  const blocks=JSON.parse(String(init.body)).messages[1].content;
  const ids=blocks.filter((b: any)=>b.type==='text' && b.text.startsWith('id=')).map((b: any)=>Number(b.text.match(/id=(\d+)/)[1]));
  expect(blocks.filter((b:any)=>b.type==='image_url').length).toBeLessThanOrEqual(12);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(ids.map((id:number)=>({id,score:id,reason:'适合封面',readable:true})))}}]}));
 });
 const result=await shortlistImages({images,requirement:'旅行封面',model:'test',baseUrl:'https://model.test',apiKey:'test',onProgress:vi.fn(),fetcher:fetcher as typeof fetch});
 expect(fetcher).toHaveBeenCalledTimes(4);
 expect(result.images).toHaveLength(24);
 expect(result.images.some((image)=>image.label==='素材37')).toBe(true);
 expect(new Set(result.images.map((image)=>image.sourceUrl)).size).toBe(3);
 expect(result.report).toContain('37 张');
});
it('模型漏返回图片时拒绝把部分结果冒充完整分析', async () => {
 const fetcher=vi.fn(async ()=>new Response(JSON.stringify({choices:[{message:{content:'[]'}}]})));
 await expect(shortlistImages({images:Array.from({length:25},()=>({url:'https://img.test/a.jpg',label:'素材'})),requirement:'封面',model:'test',baseUrl:'https://model.test',apiKey:'test',onProgress:vi.fn(),fetcher:fetcher as typeof fetch})).rejects.toThrow('完整');
 expect(fetcher).toHaveBeenCalledTimes(2);
});

it('失败后即使更换模型和接口也从磁盘恢复，不重复请求前12张', async () => {
 const {mkdtemp,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'selection-resume-'));
 const images=Array.from({length:25},(_,i)=>({url:`https://img.test/${i}.jpg`,label:`素材${i+1}`}));
 const requested:number[][]=[];
 let fail=true;
 const fetcher=vi.fn(async (_url,init)=>{
  const content=JSON.parse(String(init.body)).messages[1].content;
  const ids=content.filter((p:any)=>p.type==='text'&&p.text.startsWith('id=')).map((p:any)=>Number(p.text.match(/id=(\d+)/)[1]));
  requested.push(ids);
  if (fail&&ids[0]===13) return new Response('{}',{status:401});
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(ids.map((id:number)=>({id,score:80,reason:'适合',readable:true})))}}]}));
 });
 const options={images,requirement:'选封面',model:'test',baseUrl:'https://model.test',apiKey:'test',onProgress:vi.fn(),checkpointScope:'session',checkpointDir:dir,fetcher:fetcher as typeof fetch};
 try {
  await expect(shortlistImages(options)).rejects.toThrow('已保存 12/25');
  fail=false; requested.length=0;
  const progress=vi.fn();
  await shortlistImages({...options,model:'replacement-model',baseUrl:'https://replacement.test',onProgress:progress});
  expect(progress).toHaveBeenCalledWith('已恢复 12/25 张筛选结果，将用当前模型继续处理剩余图片');
  expect(requested[0][0]).toBe(13);
  expect(requested.flat()).not.toContain(1);
  // 改变需求不能沿用旧评分。
  requested.length=0;
  await shortlistImages({...options,requirement:'选择酒店内景'});
  expect(requested[0][0]).toBe(1);
 } finally {await rm(dir,{recursive:true,force:true});}
});

it('HTTP 400 自动缩小批次，所有图片仍经过检查', async () => {
 const images=Array.from({length:25},(_,i)=>({url:`https://img.test/${i}.jpg`,label:`素材${i+1}`}));
 const seen:number[]=[];
 const fetcher=vi.fn(async (_url,init)=>{
  const content=JSON.parse(String(init.body)).messages[1].content;
  const ids=content.filter((p:any)=>p.type==='text'&&p.text.startsWith('id=')).map((p:any)=>Number(p.text.match(/id=(\d+)/)[1]));
  if(ids.length>6) return new Response('{}',{status:400});
  seen.push(...ids);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(ids.map((id:number)=>({id,score:80,readable:true,reason:'适合'})))}}]}));
 });
 await shortlistImages({images,requirement:'选图',model:'test',baseUrl:'https://model.test',apiKey:'test',onProgress:vi.fn(),fetcher:fetcher as typeof fetch});
 expect(seen).toEqual(Array.from({length:25},(_,i)=>i+1));
});
