import type {StudioTaskCommands} from './studioTaskState';

interface TextRunner {run:()=>Promise<void>;cancel:()=>void;ready:()=>boolean}
interface TextHost {
  taskCommands:StudioTaskCommands;
  textRunners?:Map<string,TextRunner>;
  flushNodeUpdates?:()=>void;
}
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,50));

/** Await the native async analysis itself, not its fire-and-forget execute trigger. */
export async function runStudioTextNode(host:TextHost,nodeId:string,signal:AbortSignal):Promise<void> {
  signal.throwIfAborted();
  host.taskCommands.focus?.(nodeId);
  const started=Date.now();
  let runner:TextRunner|undefined;
  while(!(runner=host.textRunners?.get(nodeId))?.ready()) {
    signal.throwIfAborted();
    if(Date.now()-started>60_000)throw new Error('分镜节点或参考素材未加载完成，请检查四项素材后重试');
    await pause();
  }
  const read=()=>{host.flushNodeUpdates?.();return host.taskCommands.read().nodes.find(n=>n.id===nodeId);};
  const before=(read()?.settings as Record<string,unknown>|undefined)?._chatCompletedAt;
  const cancel=()=>runner?.cancel();
  signal.addEventListener('abort',cancel,{once:true});
  try {
    signal.throwIfAborted();await runner.run();signal.throwIfAborted();
    const finished=Date.now();
    while(true) {
      signal.throwIfAborted();
      const node=read(),settings=node?.settings as Record<string,unknown>|undefined;
      if(settings?.beikeTextRunError)throw new Error(String(settings.beikeTextRunError));
      if(settings?._chatCompletedAt&&settings._chatCompletedAt!==before&&!settings.textNodeIsAnalyzing)return;
      if(Date.now()-finished>2_000)throw new Error('分镜分析未成功完成，未继续生成首帧或视频，请检查05节点');
      await pause();
    }
  } finally {signal.removeEventListener('abort',cancel);}
}
