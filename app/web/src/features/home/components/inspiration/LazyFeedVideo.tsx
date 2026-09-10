import {useEffect,useRef,useState} from 'react';
import {videoPlaybackManager} from '@/lib/videoPlaybackManager';
interface Props {src:string;poster?:string;className?:string;onAspectRatio?:(ratio:number)=>void;}
/** Feed previews stay still until the pointer enters. */
export function LazyFeedVideo({src,poster,className,onAspectRatio}:Props) {
  const videoRef=useRef<HTMLVideoElement>(null);
  const hovered=useRef(false);
  const [playing,setPlaying]=useState(false);
  const [hasError,setHasError]=useState(false);
  const stop=()=>{
    hovered.current=false;setPlaying(false);
    const video=videoRef.current;
    if(video){videoPlaybackManager.safePause(video);try{video.currentTime=0;}catch{}}
  };
  useEffect(()=>{
    hovered.current=false;setPlaying(false);setHasError(false);
    const video=videoRef.current;
    const hide=()=>{if(document.hidden)stop();};
    const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{if(!entries[0]?.isIntersecting)stop();}):null;
    if(video)observer?.observe(video);
    document.addEventListener('visibilitychange',hide);
    return ()=>{hovered.current=false;observer?.disconnect();document.removeEventListener('visibilitychange',hide);if(video)videoPlaybackManager.safePause(video);};
  },[src]);
  return <div className="relative w-full h-full overflow-hidden" onMouseLeave={stop} onMouseEnter={()=>{
    hovered.current=true;const video=videoRef.current;if(!video || hasError)return;
    void videoPlaybackManager.safePlay(video).then(ok=>{if(!hovered.current){videoPlaybackManager.safePause(video);return;}setPlaying(ok);});
  }}>
    <video ref={videoRef} key={src} src={src} poster={poster} loop muted playsInline preload="metadata" onLoadedMetadata={event=>onAspectRatio?.(event.currentTarget.videoWidth/event.currentTarget.videoHeight)} onPlaying={()=>{if(!hovered.current){if(videoRef.current)videoPlaybackManager.safePause(videoRef.current);}else setPlaying(true);}} onError={()=>{setHasError(true);setPlaying(false);}} className={className}/>
    {poster && (!playing || hasError) && <img src={poster} alt="" onLoad={event=>onAspectRatio?.(event.currentTarget.naturalWidth/event.currentTarget.naturalHeight)} loading="lazy" className={`absolute inset-0 pointer-events-none ${className || 'w-full h-full object-contain'}`}/>}
  </div>;
}
