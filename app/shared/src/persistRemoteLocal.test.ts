import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
vi.mock('./safeUrl',()=>({assertSafeRemoteUrl:vi.fn(async(url:string)=>new URL(url))}));
import {persistRemoteLocal} from './persistRemoteLocal';
const roots:string[]=[];
afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();await Promise.all(roots.splice(0).map(root=>fs.rm(root,{recursive:true,force:true})));});
it('saves downloaded media and reuses it without another network request',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'local-results-'));roots.push(root);vi.stubEnv('AZHUO_CACHE_DIR',root);
 const fetch=vi.fn(async()=>new Response('image-bytes',{headers:{'content-type':'image/png'}}));vi.stubGlobal('fetch',fetch);
 const [a,b]=await Promise.all([persistRemoteLocal('https://example.com/image.png',false),persistRemoteLocal('https://example.com/image.png',false)]);
 expect(a).toBe(b);expect(a).toMatch(/^\/storage\/generated\/images\/local\//);
 expect(await fs.readFile(path.join(root,a.slice('/storage/'.length)),'utf8')).toBe('image-bytes');
 expect(await persistRemoteLocal('https://example.com/image.png',false)).toBe(a);expect(fetch).toHaveBeenCalledTimes(1);
});
it('rejects HTML error pages without leaving a successful local asset',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'local-results-'));roots.push(root);vi.stubEnv('AZHUO_CACHE_DIR',root);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html/>',{headers:{'content-type':'text/html'}})));
 await expect(persistRemoteLocal('https://example.com/error',true)).rejects.toThrow('不是支持');
 expect(await fs.readdir(path.join(root,'generated/videos/local'))).toEqual([]);
});
