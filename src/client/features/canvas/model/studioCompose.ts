import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';

/** Browser-only original-audio assembly. No video model submissions or paid retries. */
export async function composeStudioVideo(urls:string[]):Promise<string> {
  if(urls.length<2) throw new Error('请连接原视频和至少一段生成视频');
  if(typeof MediaRecorder === 'undefined') throw new Error('当前浏览器不支持视频合成，请使用 Chrome');
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus'].find(v=>MediaRecorder.isTypeSupported(v));
  if(!mime) throw new Error('当前浏览器不支持 WebM 合成，请使用 Chrome');
  const resources=new Map<HTMLVideoElement,string>();
  const release=(video:HTMLVideoElement)=>{
    video.onloadedmetadata=null;video.onended=null;video.onerror=null;
    video.pause();video.removeAttribute('src');video.load();
    const object=resources.get(video);
    if(object){URL.revokeObjectURL(object);resources.delete(video);}
  };
  const load=async(url:string)=>{
    const blob=await fetchMediaBlob(url);
    const object=URL.createObjectURL(blob);
    const video=document.createElement('video'); video.playsInline=true;video.preload='auto';
    resources.set(video,object);
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('素材读取超时，请重新导入视频')),30_000);
      const cleanup=()=>{clearTimeout(timer);video.onloadedmetadata=null;video.onerror=null;};
      video.onloadedmetadata=()=>{cleanup();resolve();};
      video.onerror=()=>{cleanup();reject(new Error('合成素材无法解码'));};
      video.src=object;
    });
    if(!Number.isFinite(video.duration)||video.duration<=0) throw new Error('素材时长无效');
    return video;
  };
  let audio:AudioContext|undefined;
  let recorder:MediaRecorder|undefined;
  let stream:MediaStream|undefined;
  let soundtrack:AudioBufferSourceNode|undefined;
  let frame=0;
  try {
    audio=new AudioContext();await audio.resume();
    const original=await fetchMediaBlob(urls[0]);
    let sound:AudioBuffer;
    try {sound=await audio.decodeAudioData(await original.arrayBuffer());}
    catch {throw new Error('参考视频音轨无法解码，请使用含有效音轨的原片，或直接下载生成视频');}
    let clip=await load(urls[1]);
    if(!clip.videoWidth || !clip.videoHeight) throw new Error('生成片段没有可用的视频画面');
    const canvas=document.createElement('canvas');canvas.width=clip.videoWidth;canvas.height=clip.videoHeight;
    const context=canvas.getContext('2d');if(!context) throw new Error('浏览器无法创建合成画面');
    stream=canvas.captureStream(30);
    const destination=audio.createMediaStreamDestination();
    destination.stream.getAudioTracks().forEach(track=>stream!.addTrack(track));
    // Let the audio track produce its first samples before starting the recorder.
    // Otherwise Chromium can timestamp the first audio packet hundreds of ms after video.
    const priming=audio.createBufferSource();
    priming.buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate/10),audio.sampleRate);
    priming.connect(destination);
    await new Promise<void>(resolve=>{priming.onended=()=>resolve();priming.start();});
    priming.disconnect();
    const parts:Blob[]=[];
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8_000_000});
    const finished=new Promise<Blob>((resolve,reject)=>{
      recorder!.ondataavailable=event=>{if(event.data.size)parts.push(event.data);};
      recorder!.onstop=()=>resolve(new Blob(parts,{type:'video/webm'}));
      recorder!.onerror=()=>reject(new Error('浏览器合成录制失败'));
    });
    // Attach a rejection handler while clips play, before awaiting the final output.
    void finished.catch(()=>{});
    let soundOffset=0;
    for(let index=1;index<urls.length;index++) {
      if(index>1)clip=await load(urls[index]);
      if(!clip.videoWidth || !clip.videoHeight) throw new Error('生成片段没有可用的视频画面');
      clip.muted=true;
      const draw=()=>{
        context.fillStyle='#000';context.fillRect(0,0,canvas.width,canvas.height);
        const ratio=Math.min(canvas.width/clip.videoWidth,canvas.height/clip.videoHeight);
        const w=clip.videoWidth*ratio,h=clip.videoHeight*ratio;
        context.drawImage(clip,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
        frame=requestAnimationFrame(draw);
      };
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('播放合成超时，请保持页面可见后重试')), (clip.duration+30)*1000);
        clip.onended=()=>{clearTimeout(timer);resolve();};
        clip.onerror=()=>{clearTimeout(timer);reject(new Error('片段播放失败'));};
        void clip.play().then(()=>{
          draw();
          if(recorder!.state==='inactive')recorder!.start(1000);
          else recorder!.resume();
          if(soundOffset<sound.duration) {
            soundtrack=audio!.createBufferSource();soundtrack.buffer=sound;soundtrack.connect(destination);
            soundtrack.start(0,soundOffset,Math.min(clip.duration,sound.duration-soundOffset));
          }
        }).catch(error=>{clearTimeout(timer);reject(error);});
      });
      cancelAnimationFrame(frame);
      // Loading the next file must not record frozen frames or consume its original audio.
      recorder.pause();soundtrack?.stop();soundtrack?.disconnect();soundtrack=undefined;
      soundOffset+=clip.duration;release(clip);
    }
    recorder.stop();
    const blob=await finished;
    if(!blob.size) throw new Error('合成结果为空');
    return await uploadStudioFile(new File([blob],'canvas-original-audio.webm',{type:'video/webm'}),'videos');
  } finally {
    cancelAnimationFrame(frame);
    soundtrack?.stop();soundtrack?.disconnect();
    for(const video of resources.keys())release(video);
    if(recorder && recorder.state!=='inactive') recorder.stop();
    stream?.getTracks().forEach(track=>track.stop());
    await audio?.close();
  }
}
