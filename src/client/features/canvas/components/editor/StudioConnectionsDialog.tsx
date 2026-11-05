import { useState } from 'react';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { studioNodeLabel, type StudioConnectionChange } from '../../model/studioConnections';
import type { StudioScene } from '../../model/types';

export type StudioConnectionCommands = { read:()=>StudioScene; apply:(change:StudioConnectionChange)=>StudioScene };

export function StudioConnectionsDialog({commands,nodeId,direction,onSave,onClose}: {
  commands:StudioConnectionCommands; nodeId?:string; direction?:string; onSave:(scene:StudioScene)=>Promise<void>; onClose:()=>void;
}) {
  const [scene,setScene] = useState(()=>commands.read());
  const [from,setFrom] = useState(direction==='output'?nodeId||'':'');
  const [to,setTo] = useState(direction==='input'?nodeId||'':'');
  const [editing,setEditing] = useState('');
  const [error,setError] = useState('');
  const [unsaved,setUnsaved] = useState(false);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const dialog = useModalDialog(true,()=>{if(!busy)onClose();});
  async function save(value:StudioScene) {
    setBusy(true);setError('');
    try {await onSave(value);setUnsaved(false);setNotice('连线已保存');}
    catch(cause){setUnsaved(true);setError(cause instanceof Error?cause.message:'连线保存失败，请重试');}
    finally{setBusy(false);}
  }
  async function change(value:StudioConnectionChange) {
    try {
      const next=commands.apply(value);setScene(next);setEditing('');setNotice('');
      await save(next);
    } catch(cause){setError(cause instanceof Error?cause.message:'连线操作失败，请重试');}
  }
  const options = scene.nodes.map(node=><option key={node.id} value={node.id}>{studioNodeLabel(node)} · {node.id.slice(-6)}</option>);
  const label = (id:string)=>scene.nodes.find(node=>node.id===id) ? studioNodeLabel(scene.nodes.find(node=>node.id===id)!) : '已移除节点';
  return <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-2">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="连线与参考" tabIndex={-1}
      className="grid max-h-[90dvh] w-full max-w-lg gap-3 overflow-auto rounded-xl border border-white/20 bg-[#202023] p-4 text-sm text-stone-200">
      <h2 className="font-semibold">连线与参考</h2>
      <p className="text-xs text-stone-400">上游素材作为下游生成的参考。生成前需要先完成上游节点。</p>
      <form className="grid min-w-0 gap-2" onSubmit={event=>{event.preventDefault();if(!busy)void change({kind:editing?'reconnect':'add',id:editing||undefined,from,to});}}>
        <label className="grid min-w-0 gap-1">上游节点<select aria-label="上游节点" required value={from} onChange={event=>setFrom(event.target.value)} className="min-w-0 rounded border border-white/20 bg-[#202023] p-2"><option value="">选择上游节点</option>{options}</select></label>
        <label className="grid min-w-0 gap-1">下游节点<select aria-label="下游节点" required value={to} onChange={event=>setTo(event.target.value)} className="min-w-0 rounded border border-white/20 bg-[#202023] p-2"><option value="">选择下游节点</option>{options}</select></label>
        <button disabled={busy} className="rounded-lg border border-white/20 p-2" type="submit">{editing?'保存重连':'新增连线'}</button>
        {editing&&<button type="button" onClick={()=>setEditing('')}>取消重连</button>}
      </form>
      {error&&<p role="alert" className="break-words text-red-300">{error}</p>}
      {unsaved&&<button disabled={busy} className="rounded border border-white/30 p-2" onClick={()=>void save(commands.read())}>重试保存连线</button>}
      <p role="status" className="text-xs text-stone-400">{notice||`共 ${scene.connections.length} 条连线`}</p>
      <ul className="grid min-w-0 gap-2">
        {scene.connections.map(edge=><li key={edge.id} className="grid min-w-0 gap-2 rounded-lg border border-white/10 p-2">
          <span className="break-words">{label(edge.from)} → {label(edge.to)}{edge.fromGroupId?'（分组参考）':''}</span>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} className="rounded border border-white/20 px-3 py-2" aria-label={`重连 ${label(edge.from)} 到 ${label(edge.to)}`} onClick={()=>{setEditing(edge.id);setFrom(edge.from);setTo(edge.to);dialog.current?.querySelector<HTMLSelectElement>('select')?.focus();}}>重连</button>
            <button disabled={busy} className="rounded border border-white/20 px-3 py-2" aria-label={`断开 ${label(edge.from)} 到 ${label(edge.to)}`} onClick={()=>void change({kind:'remove',id:edge.id})}>断开</button>
          </div>
        </li>)}
      </ul>
      <button disabled={busy} className="rounded-lg p-2 hover:bg-white/10" onClick={onClose}>关闭</button>
    </div>
  </div>;
}
