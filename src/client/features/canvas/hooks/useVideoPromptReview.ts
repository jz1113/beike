import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import type { VideoPromptReview } from '../components/video/VideoPromptReviewDialog';

/** Resolving this gate requires an explicit UI confirmation; cancellation returns no prompt. */
export function useVideoPromptReview() {
  const [pending,setPending]=useState<VideoPromptReview[]>([]);
  const stops=useRef(new Set<()=>void>());
  useEffect(()=>()=>{for(const stop of stops.current)stop();},[]);
  const requestReview=useCallback((optimization:VideoPromptOptimization,signal:AbortSignal,onDraft?:(prompt:string)=>void)=>new Promise<string|undefined>(resolve=>{
    if(signal.aborted){resolve(undefined);return;}
    const id=crypto.randomUUID();let finished=false;
    const finish=(prompt?:string)=>{
      if(finished)return;finished=true;signal.removeEventListener('abort',cancel);stops.current.delete(cancel);
      setPending(items=>items.filter(item=>item.id!==id));resolve(signal.aborted?undefined:prompt);
    };
    const cancel=()=>finish();stops.current.add(cancel);signal.addEventListener('abort',cancel,{once:true});
    setPending(items=>[...items,{id,optimization,onDraft,confirm:finish,cancel}]);
  }),[]);
  return {requestReview,review:pending[0]};
}
