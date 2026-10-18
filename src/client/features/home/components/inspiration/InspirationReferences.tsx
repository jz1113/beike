import {useEffect,useRef,useState,useId} from 'react';
import {createPortal} from 'react-dom';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {isVideoMediaUrl} from '@client/shared/media/mediaHelper';

export function InspirationReferences({images,labels,mode}:{images:string[];labels?:string[];mode?:string}) {
  const [index,setIndex]=useState(0);
  const [position,setPosition]=useState<{left:number;top:number}|null>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const previewId=useId();
  const cancel=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}};
  const closeSoon=()=>{cancel();timer.current=setTimeout(()=>setPosition(null),160);};
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  useEffect(()=>{
    if(!position)return;
    const close=()=>setPosition(null);
    window.addEventListener('resize',close);
    window.addEventListener('scroll',close,true);
    return ()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};
  },[position]);
  if(!images.length)return null;
  const active=Math.min(index,images.length-1);
  const url=images[active];
  const label=labels?.[active] || (mode==='first_last_frame' && active<2 ? (active===0?'首帧':'尾帧') : `图片 ${active+1}`);
  const open=()=>{
    cancel();const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
    setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-232)),top:rect.top>=240?rect.top-232:Math.max(8,Math.min(rect.bottom+8,window.innerHeight-232))});
  };
  const media=(source:string,small=false)=>isVideoMediaUrl(source)
    ? <video src={source} muted playsInline preload="metadata" controls={!small} className={small?'h-5 w-6 rounded object-cover':'h-full w-full object-contain'} />
    : <img src={source} alt={small?'':label} loading={small?'lazy':'eager'} className={small?'h-5 w-6 rounded object-cover':'h-full w-full object-contain'} />;
  return <>
    <button ref={trigger} type="button" aria-expanded={!!position} aria-controls={position?previewId:undefined} aria-label={`查看参考素材，共 ${images.length} 个`} onMouseEnter={open} onMouseLeave={closeSoon} onFocus={open} onBlur={closeSoon} onClick={()=>position?setPosition(null):open()} onKeyDown={event=>{if(event.key==='Escape'){setPosition(null);event.stopPropagation();}}} className="flex shrink-0 items-center gap-1 rounded text-slate-600 hover:text-slate-900 focus-visible:outline-indigo-500 dark:hover:text-white dark:text-slate-300">
      {media(images[0],true)}<span>{mode==='first_last_frame'?'首尾帧参考':'全能参考'}</span>
    </button>
    {position && createPortal(<div id={previewId} role="region" aria-label="参考素材预览" onMouseEnter={cancel} onMouseLeave={closeSoon} onFocus={cancel} onBlur={closeSoon} onKeyDown={event=>{if(event.key==='Escape'){trigger.current?.focus();setPosition(null);event.stopPropagation();}}} className="fixed z-[10000] h-56 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#18191c]" style={position}>
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-white/90 px-3 py-2 text-[11px] text-slate-600 backdrop-blur-sm dark:text-slate-300 dark:bg-[#18191c]/95">
        <span className="min-w-0 flex-1 truncate" title={label}>{label}</span><span className="shrink-0">{active+1}/{images.length}</span>
        {images.length>1 && <div className="flex gap-1"><button type="button" aria-label="上一张参考素材" onClick={()=>setIndex((active+images.length-1)%images.length)} className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-white/10"><ChevronLeft size={14}/></button><button type="button" aria-label="下一张参考素材" onClick={()=>setIndex((active+1)%images.length)} className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-white/10"><ChevronRight size={14}/></button></div>}
      </div>
      <div className="h-full w-full pt-9 p-2">{media(url)}</div>
    </div>,document.body)}
  </>;
}
