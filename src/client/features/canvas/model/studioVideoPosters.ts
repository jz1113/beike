import { proxyMediaUrl } from '@client/shared/api/apiClient';

type ExtractPoster = (url:string,signal:AbortSignal)=>Promise<string>;
const canceled = () => new DOMException('已取消视频封面读取','AbortError');

/** Decode one small still without starting playback or retaining a video decoder. */
export function extractStudioVideoPoster(url:string,signal:AbortSignal):Promise<string> {
  if (signal.aborted) return Promise.reject(canceled());
  return new Promise((resolve,reject)=>{
    const video=document.createElement('video');
    video.crossOrigin='anonymous';video.muted=true;video.playsInline=true;video.preload='auto';
    let settled=false,seeking=false;
    const cleanup=()=>{
      clearTimeout(timeout);
      signal.removeEventListener('abort',abort);
      video.removeEventListener('loadedmetadata',metadata);
      video.removeEventListener('loadeddata',loaded);
      video.removeEventListener('seeked',seeked);
      video.removeEventListener('error',error);
      video.pause();video.removeAttribute('src');video.load();
    };
    const finish=(failure?:unknown,poster?:string)=>{
      if (settled) return;
      settled=true;cleanup();
      if (failure) reject(failure);else resolve(poster!);
    };
    const abort=()=>finish(canceled());
    const error=()=>finish(new Error('视频封面解码失败'));
    const capture=()=>{
      if (settled || seeking || video.readyState<2) return;
      try {
        const width=video.videoWidth,height=video.videoHeight;
        if (!width || !height) throw new Error('视频尺寸不可读取');
        const scale=Math.min(1,360/Math.max(width,height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
        const context=canvas.getContext('2d');
        if (!context) throw new Error('无法创建视频封面');
        context.drawImage(video,0,0,canvas.width,canvas.height);
        const poster=canvas.toDataURL('image/jpeg',0.72);
        canvas.width=canvas.height=0;
        finish(undefined,poster);
      } catch (failure) { finish(failure); }
    };
    const metadata=()=>{
      const target=Number.isFinite(video.duration)?Math.min(0.1,Math.max(0,video.duration-0.01)):0;
      if (target>0 && Math.abs(video.currentTime-target)>0.001) {
        seeking=true;
        try { video.currentTime=target; } catch (failure) { finish(failure); }
      } else capture();
    };
    const loaded=()=>capture();
    const seeked=()=>{seeking=false;capture();};
    const timeout=setTimeout(()=>finish(new Error('视频封面读取超时')),12000);
    signal.addEventListener('abort',abort,{once:true});
    video.addEventListener('loadedmetadata',metadata);
    video.addEventListener('loadeddata',loaded);
    video.addEventListener('seeked',seeked);
    video.addEventListener('error',error);
    try { video.src=proxyMediaUrl(url,{asVideo:true});video.load(); }
    catch (failure) { finish(failure); }
  });
}

interface Waiter { resolve:(poster:string)=>void;reject:(error:unknown)=>void;cleanup:()=>void }
interface PosterJob { url:string;controller:AbortController;waiters:Set<Waiter>;started:boolean }

/** The caller requests visible nodes only; this queue owns one decoder and at most 48 cached stills. */
export function createStudioVideoPosterQueue(options:{extract?:ExtractPoster;cacheLimit?:number}={}) {
  const extract=options.extract || extractStudioVideoPoster;
  const cacheLimit=Math.min(48,Math.max(0,Math.floor(options.cacheLimit ?? 48)));
  const cache=new Map<string,string>(),jobs=new Map<string,PosterJob>();
  const pending:PosterJob[]=[];
  let active:PosterJob|undefined,disposed=false;
  function settle(job:PosterJob,error?:unknown,poster?:string) {
    for (const waiter of job.waiters) {
      waiter.cleanup();
      if (error) waiter.reject(error);else waiter.resolve(poster!);
    }
    job.waiters.clear();
  }
  function pump() {
    if (active || disposed) return;
    const job=pending.shift();
    if (!job) return;
    if (!job.waiters.size) { pump();return; }
    active=job;job.started=true;
    void Promise.resolve().then(()=>{
      if (job.controller.signal.aborted) throw canceled();
      return extract(job.url,job.controller.signal);
    }).then(poster=>{
      if (disposed || job.controller.signal.aborted) return;
      if (cacheLimit) {
        cache.delete(job.url);cache.set(job.url,poster);
        if (cache.size>cacheLimit) cache.delete(cache.keys().next().value!);
      }
      if (jobs.get(job.url)===job) jobs.delete(job.url);
      settle(job,undefined,poster);
    },error=>{
      if (jobs.get(job.url)===job) jobs.delete(job.url);
      settle(job,error);
    }).finally(()=>{
      if (jobs.get(job.url)===job) jobs.delete(job.url);
      active=undefined;pump();
    });
  }
  return {
    request(url:string,signal?:AbortSignal):Promise<string> {
      if (disposed || signal?.aborted) return Promise.reject(canceled());
      const cached=cache.get(url);
      if (cached!==undefined) { cache.delete(url);cache.set(url,cached);return Promise.resolve(cached); }
      let job=jobs.get(url);
      if (!job || job.controller.signal.aborted) {
        job={url,controller:new AbortController(),waiters:new Set(),started:false};
        jobs.set(url,job);pending.push(job);
      }
      const target=job;
      return new Promise((resolve,reject)=>{
        const cancel=()=>{
          target.waiters.delete(waiter);waiter.cleanup();reject(canceled());
          if (!target.waiters.size) {
            target.controller.abort();
            if (!target.started) {
              const index=pending.indexOf(target);
              if (index>=0) pending.splice(index,1);
              if (jobs.get(url)===target) jobs.delete(url);
            }
          }
        };
        const waiter:Waiter={resolve,reject,cleanup:()=>signal?.removeEventListener('abort',cancel)};
        target.waiters.add(waiter);signal?.addEventListener('abort',cancel,{once:true});pump();
      });
    },
    dispose() {
      disposed=true;
      for (const job of jobs.values()) { job.controller.abort();settle(job,canceled()); }
      jobs.clear();pending.length=0;cache.clear();
    },
  };
}
