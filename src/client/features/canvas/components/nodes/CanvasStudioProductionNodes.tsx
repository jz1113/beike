import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Film, LayoutGrid, Magnet, Play, Plus, Scissors, Sparkles, Trash2 } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useCanvasStore } from '../../store/useCanvasStore';
import { editTimelineClip, snapTimelineTime, timelineRanges } from '../../model/canvasVideoFrame';
import type { CanvasNode, CanvasTimelineClip } from '../../model/types';

export function CanvasVideoTimelineNode({node, nodes, projectId, updateNode}: {
  node: CanvasNode; nodes: CanvasNode[]; projectId: string;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
}) {
  const connected = (node.referenceNodeIds || []).flatMap(id => {
    const source = nodes.find(item => item.id === id);
    return source?.videoUrl ? [source] : [];
  });
  const trimDrag = useRef<{id:string;edge:'in'|'out';x:number;rate:number;start:number;offset:number}|null>(null);
  const [trimGhost,setTrimGhost]=useState<number|null>(null);
  const metadata = useRef(new Map<string, number>());
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [time, setTime] = useState(0);
  const snap = node.timelineSnap !== false;
  const [preview, setPreview] = useState(false);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const clips = node.timelineClips ?? connected.flatMap(source => {
    const duration = durations[source.videoUrl!];
    return duration ? [{ id: source.id, nodeId: source.id, title: source.title, url: source.videoUrl!, duration }] : [];
  });
  const ranges = timelineRanges(clips);
  const duration = ranges.at(-1)?.finish ?? 0;
  const canvasSeconds = Math.max(20, duration);
  const position = Math.min(time, duration);
  const range = ranges.find(item => position >= item.offset && position < item.finish) || ranges.at(-1);
  const save = (next: CanvasTimelineClip[]) => updateNode(projectId, node.id, { timelineClips: next });
  const seekVideo = (element: HTMLVideoElement, seconds: number) => {
    if (element.readyState) { element.currentTime = seconds; pendingSeek.current = null; }
    else pendingSeek.current = seconds;
  };
  const seek = (requested: number) => {
    const next = Math.max(0, Math.min(requested, duration));
    const nextRange = ranges.find(item => next >= item.offset && next < item.finish) || ranges.at(-1);
    if (nextRange && video.current) {
      const seconds = nextRange.start + next - nextRange.offset;
      if (nextRange.clip.id === range?.clip.id) seekVideo(video.current, seconds);
      else pendingSeek.current = seconds;
    }
    setTime(next);
  };
  const edit = (operation: 'split'|'in'|'out') => {
    if(node.layerLocked)return;
    const next = editTimelineClip(clips, position, operation, operation === 'split' ? crypto.randomUUID() : undefined);
    if (next === clips) return;
    video.current?.pause();
    setPlaying(false);
    save(next);
  };
  const toggleSnap = () => updateNode(projectId,node.id,{timelineSnap:!snap});
  const togglePlay = () => {
    if (!duration) return;
    if (playing) { video.current?.pause(); setPlaying(false); return; }
    if(position>=duration)seek(0);
    setPreview(true);
    setPlaying(true);
  };
  useEffect(() => {
    if (preview && playing) void video.current?.play().catch(() => setPlaying(false));
  }, [preview, playing, range?.clip.id]);
  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.nativeEvent.isComposing || (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
    const key = event.key.toLowerCase(), command = event.ctrlKey || event.metaKey;
    const actions: Record<string, () => void> = {
      b:()=>edit('split'), c:()=>edit('split'), q:()=>edit('in'), i:()=>edit('in'),
      w:()=>edit('out'), o:()=>edit('out'), n:toggleSnap, ' ':togglePlay,
      arrowleft:()=>seek(position-1), arrowright:()=>seek(position+1),
    };
    if (!actions[key] || (command && key !== 'b')) return;
    if (key === ' ' && event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    event.stopPropagation();
    actions[key]();
  };
  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const target = (event.clientX - rect.left) / rect.width * canvasSeconds;
    seek(snapTimelineTime(target, [0, ...ranges.map(item=>item.finish)], rect.width / canvasSeconds, snap));
  };
  const trimPosition = (x:number) => {
    const drag=trimDrag.current;
    if(!drag)return null;
    return snapTimelineTime(drag.offset+(x-drag.x)/drag.rate,
      [position,0,...ranges.filter(item=>item.clip.id!==drag.id).flatMap(item=>[item.offset,item.finish])],drag.rate,snap);
  };
  const trimHandle = (item: typeof ranges[number], edge:'in'|'out') => (
    <button type="button" aria-label={edge==='in'?'拖动入点':'拖动出点'} disabled={node.layerLocked}
      className={`absolute inset-y-0 z-10 w-1.5 cursor-ew-resize bg-[#edb699]/70 disabled:hidden ${edge==='in'?'left-0':'right-0'}`}
      onPointerDown={event=>{
        if(event.button!==0 || node.layerLocked)return;
        event.preventDefault();event.stopPropagation();
        const track=event.currentTarget.closest('[data-testid="timeline-track"]')?.getBoundingClientRect();
        if(!track?.width)return;
        event.currentTarget.setPointerCapture(event.pointerId);
        video.current?.pause();setPlaying(false);
        trimDrag.current={id:item.clip.id,edge,x:event.clientX,rate:track.width/canvasSeconds,
          start:edge==='in'?item.start:item.end,offset:edge==='in'?item.offset:item.finish};
      }}
      onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))setTrimGhost(trimPosition(event.clientX));}}
      onPointerUp={event=>{
        const drag=trimDrag.current, target=trimPosition(event.clientX);
        if(!drag||target===null)return;
        trimDrag.current=null;setTrimGhost(null);
        const seconds=Math.round((drag.start+target-drag.offset)*1000)/1000;
        const next=drag.edge==='in'?Math.max(0,Math.min(item.end-1,seconds)):Math.min(item.clip.duration,Math.max(item.start+1,seconds));
        if(item.end-item.start>=1 && next!==drag.start)save(clips.map(clip=>clip.id!==drag.id?clip:drag.edge==='in'?{...clip,trimStart:next}:{...clip,trimEnd:next}));
      }}
      onLostPointerCapture={()=>{trimDrag.current=null;setTrimGhost(null);}}
    />
  );
  return <div tabIndex={0} aria-label="剪辑时间线" onKeyDown={keydown}
    className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white outline-none focus-visible:ring-1 focus-visible:ring-[#edb699] dark:border-white/[.06] dark:bg-[#1f1f1f]"
    style={{ width: node.width, height: node.height }}>
    {[...new Set(connected.map(source => source.videoUrl!))].filter(url=>!durations[url]).map(url=><video key={url} src={proxyMediaUrl(url)}
      preload="metadata" muted hidden onLoadedMetadata={event=>{
        const seconds=event.currentTarget.duration;
        if(!Number.isFinite(seconds) || seconds<=0 || metadata.current.get(url)===seconds)return;
        metadata.current.set(url,seconds);
        setDurations(previous=>({...previous,[url]:seconds}));
      }}/>)}
    <div className="flex flex-wrap items-center justify-between gap-1 border-b border-black/10 px-3 py-1.5 text-xs dark:border-white/10">
      <span className="inline-flex items-center gap-1.5"><Film size={14}/>剪辑时间线</span>
      <div className="flex gap-1">
        <button type="button" disabled={!range} aria-label={playing?'暂停':'播放'} onClick={togglePlay}><Play size={14}/></button>
        <button type="button" disabled={!range || node.layerLocked} aria-label="切片" onClick={()=>edit('split')}><Scissors size={14}/></button>
        <button type="button" disabled={!range || node.layerLocked} onClick={()=>edit('in')}>入点 Q</button>
        <button type="button" disabled={!range || node.layerLocked} onClick={()=>edit('out')}>出点 W</button>
        <button type="button" aria-label="吸附" aria-pressed={snap} onClick={toggleSnap}><Magnet size={14}/></button>
        {preview && <button type="button" onClick={()=>{setPreview(false);setPlaying(false);}}>关闭预览</button>}
      </div>
    </div>
    {preview && range && <video key={range.clip.id} ref={video} src={proxyMediaUrl(range.clip.url)} muted playsInline
      className="min-h-0 flex-1 bg-black object-contain" onLoadedMetadata={event=>seekVideo(event.currentTarget,pendingSeek.current ?? range.start + position - range.offset)}
      onTimeUpdate={event=>{
        if (!playing) return;
        if (event.currentTarget.currentTime < range.end - 0.015) {setTime(range.offset+Math.max(0,event.currentTarget.currentTime-range.start));return;}
        if (range.finish >= duration) {event.currentTarget.pause();setPlaying(false);}
        seek(range.finish);
      }} onEnded={()=>{if(range.finish<duration)seek(range.finish);else{setPlaying(false);seek(duration);}}}/>}
    <div className="relative min-h-12 flex-1 touch-none select-none bg-zinc-100 px-2 dark:bg-[#181818]" data-testid="timeline-track"
      onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.closest<HTMLElement>('[aria-label="剪辑时间线"]')?.focus();event.currentTarget.setPointerCapture(event.pointerId);video.current?.pause();setPlaying(false);scrub(event);}}
      onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))scrub(event);}}>
      <div aria-hidden="true" className="flex justify-between py-1 font-mono text-[10px] text-zinc-500">
        {Array.from({length:10},(_,index)=><span key={index}>{Math.round(canvasSeconds*index/10)}s</span>)}
      </div>
      {ranges.map(item=><span key={item.clip.id} data-testid="timeline-clip" data-in={item.start} data-out={item.end}
        className="absolute top-6 max-h-7 truncate rounded border border-[#edb699]/45 bg-[#edb699]/15 px-1.5 py-1 text-[11px]"
        style={{left:`${item.offset/canvasSeconds*100}%`,width:`${(item.finish-item.offset)/canvasSeconds*100}%`}}>{item.clip.title || '视频片段'}{trimHandle(item,'in')}{trimHandle(item,'out')}</span>)}
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-[#edb699]" style={{left:`${position/canvasSeconds*100}%`}}/>
      {trimGhost!==null && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-sky-400" style={{left:`${trimGhost/canvasSeconds*100}%`}}/>}
      {!ranges.length && <p className="text-center text-xs text-zinc-500">{connected.length?'正在读取视频时长…':'连接画布上的视频，加入剪辑时间线'}</p>}
    </div>
    <div className="flex items-center justify-between gap-2 border-t border-black/10 px-3 py-1.5 text-[10px] text-zinc-500 dark:border-white/10">
      <output aria-label="播放头">{position.toFixed(3)} / {duration.toFixed(3)} 秒</output>
      {node.timelineClips && connected.some(source=>!clips.some(clip=>clip.nodeId===source.id) && durations[source.videoUrl!]) &&
        <button type="button" disabled={node.layerLocked} onClick={()=>save([...clips,...connected.flatMap(source=>{
          const seconds=durations[source.videoUrl!];
          return seconds&&!clips.some(clip=>clip.nodeId===source.id)?[{id:source.id,nodeId:source.id,url:source.videoUrl!,duration:seconds,title:source.title}]:[];
        })])}>加入新连接视频</button>}
      <span>Space 播放 · Ctrl+B / C 切片 · Q/W 入出点 · N 吸附</span>
    </div>
  </div>;
}

export function CanvasStoryboardTableNode({
  node,
  projectId,
  updateNode,
}: {
  node: CanvasNode;
  projectId: string;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
}) {
  const shots = node.storyboardShots || [];
  const [layout, setLayout] = useState<'列表'|'宫格'|'表格'>('列表');

  const updateShots = (next: typeof shots) => {
    const summary = next.map((s) => `【${s.shotNumber}·${s.cameraAngle}·${s.movement}】${s.description}`).join('\n');
    updateNode(projectId, node.id, { storyboardShots: next, content: summary });
  };

  const spawnShotNodes = () => {
    const store = useCanvasStore.getState();
    shots.forEach((shot, idx) => {
      const targetId = crypto.randomUUID();
      store.addNode(projectId, {
        id: targetId,
        type: 'drawing',
        generationKind: 'video',
        title: `分镜 ${shot.shotNumber} · ${shot.cameraAngle}`,
        content: `${shot.cameraAngle}，${shot.movement}镜头：${shot.description}`,
        referenceNodeIds: [node.id],
        x: node.x + (node.width || 460) + 80,
        y: node.y + idx * 260,
        width: 400,
        height: 225,
      });
    });
  };

  return (
    <div
      className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1f1f1f]"
      style={{ width: node.width, height: node.height }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 px-3.5 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-zinc-100">
          <LayoutGrid size={14} className="text-indigo-500" />
          <span>分镜表</span>
        </span>
        <div className="flex items-center gap-1.5">
          {(['列表','宫格','表格'] as const).map(mode=><button type="button" key={mode} aria-pressed={layout===mode}
            className="rounded-md px-2 py-1 text-[11px] aria-pressed:bg-[#edb699]/20" onClick={()=>setLayout(mode)}>{mode}</button>)}
          <button
            type="button"
            onClick={() =>
              updateShots([
                ...shots,
                {
                  id: `shot-${Date.now()}`,
                  shotNumber: `S${shots.length + 1}`,
                  cameraAngle: '全景',
                  movement: '横移',
                  description: '',
                },
              ])
            }
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/15 px-2 py-1 text-[11px] text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <Plus size={12} />
            <span>添加空白镜头</span>
          </button>
          <button
            type="button"
            onClick={spawnShotNodes}
            disabled={!shots.length}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 cursor-pointer"
          >
            <Sparkles size={12} />
            <span>展开分镜流</span>
          </button>
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto p-2 ${layout==='宫格'?'grid grid-cols-2 content-start gap-2':'divide-y divide-slate-100 dark:divide-white/[0.06]'}`}>
        {!shots.length && <p className="col-span-2 p-8 text-center text-xs text-zinc-500">暂无分镜，请添加空白镜头</p>}
        {layout==='表格' && shots.length>0 && <div className="flex gap-2 px-1 pb-2 text-[11px] text-zinc-500"><span className="w-7">镜号</span><span className="w-14">景别</span><span className="w-14">运镜</span><span>画面描述</span></div>}
        {shots.map((shot, idx) => (
          <div key={shot.id} className={`flex items-start gap-1.5 py-1.5 text-xs ${layout==='宫格'?'flex-wrap rounded-xl border border-black/10 p-2 dark:border-white/10':''}`}>
            <span className="mt-1 w-7 shrink-0 text-center font-mono text-[11px] font-semibold text-indigo-500">
              {shot.shotNumber}
            </span>
            <input
              type="text"
              value={shot.cameraAngle}
              onChange={(e) => {
                const next = [...shots];
                next[idx] = { ...shot, cameraAngle: e.target.value };
                updateShots(next);
              }}
              className="w-14 shrink-0 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-1.5 py-1 text-center text-[11px] text-slate-700 dark:text-zinc-200 outline-none"
              placeholder="景别"
            />
            <input
              type="text"
              value={shot.movement}
              onChange={(e) => {
                const next = [...shots];
                next[idx] = { ...shot, movement: e.target.value };
                updateShots(next);
              }}
              className="w-14 shrink-0 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-1.5 py-1 text-center text-[11px] text-slate-700 dark:text-zinc-200 outline-none"
              placeholder="运镜"
            />
            <input
              type="text"
              value={shot.description}
              onChange={(e) => {
                const next = [...shots];
                next[idx] = { ...shot, description: e.target.value };
                updateShots(next);
              }}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-2 py-1 text-[11px] text-slate-700 dark:text-zinc-200 outline-none"
              placeholder="画面动作与台词描述…"
            />
            {shots.length > 0 && (
              <button
                type="button"
                onClick={() => updateShots(shots.filter((_, i) => i !== idx))}
                className="mt-1 rounded p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                title="删除此镜"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CanvasStoryboardChartNode({node, nodes, projectId, updateNode}: {
  node: CanvasNode; nodes: CanvasNode[]; projectId: string;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
}) {
  const layout = node.storyboardChart || { columns: 3, rowHeight: 96 };
  const upstream = (node.referenceNodeIds || []).flatMap(id => nodes.find(item=>item.id===id) || []);
  const shots = node.storyboardShots?.length ? node.storyboardShots : upstream.flatMap(item=>item.storyboardShots || []);
  const imageSources = upstream.filter(item=>item.imageUrl && !item.missingMedia);
  const count = Math.max(9, shots.length, imageSources.length);
  const prepareImage = (index: number) => {
    const shot = shots[index];
    if (!shot?.description.trim() || node.layerLocked) return;
    useCanvasStore.getState().addNode(projectId, {
      type:'drawing', generationKind:'image', title:`分镜 ${shot.shotNumber || index+1}`,
      content:[shot.cameraAngle,shot.movement,shot.description].filter(Boolean).join('，'),
      referenceImageUrl:imageSources[index]?.imageUrl, referenceNodeIds:[node.id],
      drawing:{model:'',quality:'medium',aspect:'1:1',count:1,references:imageSources[index]?.imageUrl?[imageSources[index].imageUrl!]:[]},
      x:node.x+node.width+60, y:node.y+index*280, width:250,height:250,
    });
  };
  return <div className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/[.06] dark:bg-[#1f1f1f]"
    style={{width:node.width,height:node.height}}>
    <div className="flex flex-wrap items-center gap-3 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
      <span className="mr-auto inline-flex items-center gap-1.5 font-medium"><LayoutGrid size={14}/>分镜图表</span>
      <label className="flex items-center gap-1">宫格<select value={layout.columns} disabled={node.layerLocked}
        onChange={event=>updateNode(projectId,node.id,{storyboardChart:{...layout,columns:Number(event.target.value)}})}>
        {[2,3,4,5].map(columns=><option value={columns} key={columns}>{columns} 列</option>)}
      </select></label>
      <label className="flex items-center gap-1">行高 <input type="range" min={72} max={160} value={layout.rowHeight} disabled={node.layerLocked}
        onChange={event=>updateNode(projectId,node.id,{storyboardChart:{...layout,rowHeight:Number(event.target.value)}})}
        className="w-20 accent-[#edb699]"/>{layout.rowHeight}px</label>
    </div>
    <div className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto p-2" style={{gridTemplateColumns:`repeat(${layout.columns},minmax(0,1fr))`}}>
      {Array.from({length:count},(_,index)=>{
        const shot=shots[index], image=imageSources[index];
        return <div key={index} className="group relative min-w-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-[#181818]" style={{height:layout.rowHeight}}>
          {image?.imageUrl && <img src={proxyMediaUrl(image.imageUrl)} alt="" className="absolute inset-0 size-full object-cover" loading="lazy"/>}
          <div className={`relative flex h-full flex-col justify-between p-1.5 text-[11px] ${image?'bg-black/40 text-white':'text-zinc-500'}`}>
            <span>{shot?.shotNumber || String(index+1).padStart(2,'0')}</span>
            {shot?.description && <span className="line-clamp-2" title={shot.description}>{shot.description}</span>}
            <button type="button" disabled={!shot?.description.trim() || node.layerLocked} onClick={()=>prepareImage(index)}
              className="ml-auto rounded-md border border-current/25 px-2 py-0.5 hover:bg-white/15 disabled:opacity-35">准备生成</button>
          </div>
        </div>;
      })}
    </div>
  </div>;
}
