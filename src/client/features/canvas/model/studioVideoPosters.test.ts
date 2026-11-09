import { afterEach,expect,it,vi } from 'vitest';
import { createStudioVideoPosterQueue,extractStudioVideoPoster } from './studioVideoPosters';

vi.mock('@client/shared/api/apiClient',()=>({proxyMediaUrl:(url:string)=>url}));
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

function deferred<T>() {
  let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

it('shares one extraction per URL and never runs two video decoders at once',async()=>{
  const first=deferred<string>(),second=deferred<string>();
  const extract=vi.fn((url:string)=>url==='first'?first.promise:second.promise);
  const queue=createStudioVideoPosterQueue({extract});
  const one=queue.request('first'),duplicate=queue.request('first'),two=queue.request('second');
  await vi.waitFor(()=>expect(extract).toHaveBeenCalledTimes(1));
  first.resolve('data:first');
  expect(await one).toBe('data:first');expect(await duplicate).toBe('data:first');
  await vi.waitFor(()=>expect(extract).toHaveBeenCalledTimes(2));
  second.resolve('data:second');expect(await two).toBe('data:second');
  expect(await queue.request('first')).toBe('data:first');expect(extract).toHaveBeenCalledTimes(2);
  queue.dispose();
});

it('removes offscreen queued work and keeps a shared extraction alive while another node still needs it',async()=>{
  const first=deferred<string>(),extract=vi.fn<(url:string,signal:AbortSignal)=>Promise<string>>(()=>first.promise);
  const queue=createStudioVideoPosterQueue({extract});
  const firstSignal=new AbortController(),queuedSignal=new AbortController();
  const canceledFirst=queue.request('first',firstSignal.signal).catch(error=>error);
  const retainedFirst=queue.request('first');
  const canceledQueued=queue.request('offscreen',queuedSignal.signal).catch(error=>error);
  await vi.waitFor(()=>expect(extract).toHaveBeenCalledTimes(1));
  firstSignal.abort();queuedSignal.abort();
  expect((await canceledFirst).name).toBe('AbortError');expect((await canceledQueued).name).toBe('AbortError');
  expect(extract.mock.calls[0][1].aborted).toBe(false);
  first.resolve('data:retained');expect(await retainedFirst).toBe('data:retained');
  expect(extract).toHaveBeenCalledTimes(1);queue.dispose();
});

it('aborts an unneeded active decoder and all remaining work when the project closes',async()=>{
  const extract=vi.fn((_url:string,signal:AbortSignal)=>new Promise<string>((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});
  }));
  const queue=createStudioVideoPosterQueue({extract});
  const controller=new AbortController();
  const first=queue.request('first',controller.signal).catch(error=>error);
  const second=queue.request('second').catch(error=>error);
  await vi.waitFor(()=>expect(extract).toHaveBeenCalledTimes(1));
  controller.abort();expect((await first).name).toBe('AbortError');
  await vi.waitFor(()=>expect(extract).toHaveBeenCalledTimes(2));
  queue.dispose();expect((await second).name).toBe('AbortError');
  expect(extract.mock.calls.every(([,signal])=>signal.aborted)).toBe(true);
  await expect(queue.request('after-close')).rejects.toMatchObject({name:'AbortError'});
});

it('evicts the least recently used still and allows retry after a decode failure',async()=>{
  const extract=vi.fn(async(url:string)=>`data:${url}`);
  const queue=createStudioVideoPosterQueue({extract,cacheLimit:2});
  await queue.request('one');await queue.request('two');await queue.request('one');await queue.request('three');
  await queue.request('one');expect(extract).toHaveBeenCalledTimes(3);
  await queue.request('two');expect(extract).toHaveBeenCalledTimes(4);
  extract.mockRejectedValueOnce(new Error('broken'));
  await expect(queue.request('retry')).rejects.toThrow('broken');
  expect(await queue.request('retry')).toBe('data:retry');queue.dispose();
});

it('can request the same URL immediately after settling when caching is disabled',async()=>{
  const extract=vi.fn(async()=> 'data:still');
  const queue=createStudioVideoPosterQueue({extract,cacheLimit:0});
  expect(await queue.request('same').then(()=>queue.request('same'))).toBe('data:still');
  expect(extract).toHaveBeenCalledTimes(2);queue.dispose();
});

class PosterVideo extends EventTarget {
  crossOrigin='';muted=false;playsInline=false;preload='';src='';currentTime=0;duration=21;
  readyState=2;videoWidth=3840;videoHeight=2160;
  pause=vi.fn();load=vi.fn();removeAttribute=vi.fn();
}
function posterDOM() {
  const video=new PosterVideo();
  const drawImage=vi.fn(),canvas={width:0,height:0,getContext:()=>({drawImage}),toDataURL:vi.fn(()=> 'data:image/jpeg;base64,frame')};
  vi.stubGlobal('document',{createElement:(tag:string)=>tag==='video'?video:canvas});
  return {video,canvas,drawImage};
}

it.each(['blob:video','data:video/mp4;base64,clip','https://example.test/clip.mp4'])(
  'captures a bounded JPEG from %s without playing audio and releases the decoder',async url=>{
    const {video,canvas,drawImage}=posterDOM();
    const poster=extractStudioVideoPoster(url,new AbortController().signal);
    expect(video.src).toBe(url);expect(video.muted).toBe(true);expect(video.playsInline).toBe(true);
    video.dispatchEvent(new Event('loadedmetadata'));video.dispatchEvent(new Event('seeked'));
    expect(await poster).toBe('data:image/jpeg;base64,frame');
    expect(drawImage).toHaveBeenCalledWith(video,0,0,360,203);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg',0.72);
    expect(video.pause).toHaveBeenCalledTimes(1);expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalledTimes(2);expect(canvas.width).toBe(0);
  });

it.each(['error','abort','timeout'])('releases the decoder on %s and settles only once',async mode=>{
  vi.useFakeTimers();
  const {video}=posterDOM(),controller=new AbortController();
  const opening=extractStudioVideoPoster('blob:video',controller.signal).catch(error=>error);
  if (mode==='error') video.dispatchEvent(new Event('error'));
  else if (mode==='abort') controller.abort();
  else await vi.advanceTimersByTimeAsync(12000);
  expect(await opening).toBeInstanceOf(Error);
  video.dispatchEvent(new Event('error'));video.dispatchEvent(new Event('seeked'));controller.abort();
  expect(video.pause).toHaveBeenCalledTimes(1);expect(video.removeAttribute).toHaveBeenCalledWith('src');
  expect(video.load).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
});
