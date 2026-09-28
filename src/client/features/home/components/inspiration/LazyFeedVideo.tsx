import {useEffect,useRef,useState} from 'react';
import {videoPlaybackManager} from '@client/shared/media/videoPlaybackManager';
import {FeedImage} from './FeedImage';
interface Props {src:string;poster?:string;className?:string;onAspectRatio?:(ratio:number)=>void;}
/** Feed previews stay still until the pointer enters. */
export function LazyFeedVideo({src,poster,className,onAspectRatio}:Props) {
  const videoRef=useRef<HTMLVideoElement>(null);
  const hovered=useRef(false);
  const hoverTimer=useRef<number | null>(null);
  const [playing,setPlaying]=useState(false);
  const [hasError,setHasError]=useState(false);
  const [mediaReady,setMediaReady]=useState(!poster);
  const [posterFailed,setPosterFailed]=useState(false);
  const stop=()=>{
    hovered.current=false;setPlaying(false);
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    const video=videoRef.current;
    if(video){videoPlaybackManager.safePause(video);try{video.currentTime=0;}catch{}}
  };
  useEffect(()=>{
    hovered.current=false;setPlaying(false);setHasError(false);setMediaReady(!poster);setPosterFailed(false);
    const video=videoRef.current;
    const hide=()=>{if(document.hidden)stop();};
    const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{if(!entries[0]?.isIntersecting)stop();}):null;
    if(video)observer?.observe(video);
    document.addEventListener('visibilitychange',hide);
    return ()=>{hovered.current=false;if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);observer?.disconnect();document.removeEventListener('visibilitychange',hide);if(video)videoPlaybackManager.safePause(video);};
  },[src,poster]);
  const reveal=()=>{
    hovered.current=true;
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    // A short intent delay prevents incidental pointer sweeps across the feed from
    // creating several video decoders and network requests at once.
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      setMediaReady(true);
      const video=videoRef.current;if(!video || hasError)return;
      void videoPlaybackManager.safePlay(video).then(ok=>{if(!hovered.current){videoPlaybackManager.safePause(video);return;}setPlaying(ok);});
    }, 140);
  };
  return <div className="relative w-full h-full overflow-hidden" onMouseLeave={stop} onMouseEnter={reveal}>
    <video ref={videoRef} key={src} src={mediaReady?src:undefined} poster={poster} loop muted playsInline preload={mediaReady?'metadata':'none'} onLoadedMetadata={event=>onAspectRatio?.(event.currentTarget.videoWidth/event.currentTarget.videoHeight)} onPlaying={()=>{if(!hovered.current){if(videoRef.current)videoPlaybackManager.safePause(videoRef.current);}else setPlaying(true);}} onError={()=>{setHasError(true);setPlaying(false);}} className={className}/>
    {poster && !posterFailed && (!playing || hasError) && <FeedImage src={poster} alt="" className={`absolute inset-0 pointer-events-none ${className || 'w-full h-full object-contain'}`} onAspectRatio={onAspectRatio} onUnavailable={()=>{setPosterFailed(true);setMediaReady(true);}}/>}
  </div>;
}
