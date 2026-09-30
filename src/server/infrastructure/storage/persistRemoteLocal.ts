import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {resolveStorageRoot,toWorkspaceStorageKey} from './storagePaths';
import {assertSafeRemoteUrl} from '../network/safeUrl';
const pending=new Map<string,Promise<string>>();
/** Atomic, bounded local persistence; shared callers download the same URL only once. */
export function persistRemoteLocal(url:string,video:boolean):Promise<string> {
  if(url.startsWith('/storage/'))return Promise.resolve(url);
  const directory=toWorkspaceStorageKey(`generated/${video?'videos':'images'}/local`);
  const key=`${directory}:${url}`;
  const previous=pending.get(key);if(previous)return previous;
  const work=download(url,video,directory).finally(()=>pending.delete(key));pending.set(key,work);return work;
}
async function download(url:string,video:boolean,directory:string) {
  const digest=createHash('sha256').update(url).digest('hex');
  const root=resolveStorageRoot();
  await fs.mkdir(path.join(root,directory),{recursive:true});
  const existing=(await fs.readdir(path.join(root,directory))).find(name=>name.startsWith(digest+'..') && !name.endsWith('.part'));
  if(existing)return `/storage/${directory}/${existing}`;
  let remote=url,response:Response|undefined;
  const signal=AbortSignal.timeout(video?300000:60000);
  for(let redirects=0;redirects<=5;redirects++){
    await assertSafeRemoteUrl(remote);
    response=await fetch(remote,{redirect:'manual',signal});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');await response.body?.cancel();
      if(!location)throw new Error('媒体跳转地址缺失');remote=new URL(location,remote).href;continue;
    }
    break;
  }
  if(!response?.ok || !response.body)throw new Error('无法下载生成结果到本地');
  const mime=response.headers.get('content-type')?.split(';')[0].trim() || '';
  const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
  const ext=extensions[mime] || (mime==='application/octet-stream' || !mime ? (video?'mp4':'png') : '');
  if(!ext){await response.body.cancel();throw new Error('生成结果不是支持的图片或视频');}
  const limit=video?1024*1024*1024:100*1024*1024;
  if(Number(response.headers.get('content-length'))>limit){await response.body.cancel();throw new Error('生成文件超过本地保存大小限制');}
  const relative=`${directory}/${digest}.${ext}`;
  const destination=path.join(root,relative),temp=destination+`.${randomUUID()}.part`;
  const file=await fs.open(temp,'wx');const reader=response.body.getReader();let total=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit)throw new Error('生成文件超过本地保存大小限制');await file.writeFile(value);}
    if(!total)throw new Error('生成文件为空');
    await file.close();await fs.rename(temp,destination);
  }catch(error){await reader.cancel().catch(()=>{});await file.close().catch(()=>{});await fs.unlink(temp).catch(()=>{});throw error;}
  return `/storage/${relative}`;
}
