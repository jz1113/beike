import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasStore } from '../store/useCanvasStore';
import { useAppStore } from '@/store';
import { apiFetch } from '@/shared/api/apiClient';
import { persistCanvasMedia } from '../canvasMediaImport';
import { assetRoleLabels, buildProductionNodes, newShot, parseProductionText } from '../canvasProduction';
import { getVideoModelById } from '@beike/domain/video';
import { getEnabledVideoModelsFromSettings, readWorkflowModelsFromStorage } from '@beike/domain/workflowModels';
import type { CanvasAssetRole, CanvasProductionDraft, CanvasShotDraft } from '../types';

const emptyDraft: CanvasProductionDraft = { source: '', aspect: '9:16', shots: [] };
const field = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm w-full';
export function CanvasProductionPanel({ projectId, onLocate }: { projectId: string; onLocate?: () => void }) {
  const project = useCanvasStore(s => s.projects.find(p => p.id === projectId));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<CanvasAssetRole>('product');
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const draft = project?.productionDraft || emptyDraft;
  const updateDraft = (patch: Partial<CanvasProductionDraft>) => {
    const current = useCanvasStore.getState().projects.find(p => p.id === projectId);
    if (current) useCanvasStore.getState().setProductionDraft(projectId, { ...(current.productionDraft || emptyDraft), ...patch });
  };
  const updateShot = (id: string, patch: Partial<CanvasShotDraft>) => updateDraft({ shots: draft.shots.map(shot => shot.id === id ? { ...shot, ...patch } : shot) });
  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!lock.current) setOpen(false); }
      if (e.key === 'Tab') {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') || []);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); trigger.current?.focus(); };
  }, [open]);
  if (!project) return null;
  const media = project.nodes.filter(n => n.imageUrl || n.videoUrl || n.audioUrl);
  const imageOptions = media.filter(n => n.imageUrl && n.generationKind !== 'video' && n.type !== 'video' && !n.missingMedia && n.status !== 'generating');
  const videoOptions = media.filter(n => n.videoUrl && !n.missingMedia && n.status !== 'generating');
  const upload = async (files: File[]) => {
    if (lock.current || !files.length) return;
    if (files.length > 40) { setMessage('每批最多 40 份素材，请分批上传'); return; }
    lock.current = true; setBusy(true); const errors: string[] = []; let saved = 0;
    const baseY = project.nodes.reduce((max, item) => Math.max(max, item.y + item.height), 0) + 60;
    try {
      for (const [index, file] of files.entries()) {
        setMessage(`保存素材 ${index + 1}/${files.length}：${file.name}`);
        try {
          const node = await persistCanvasMedia(file, 0, 0);
          const current = useCanvasStore.getState().projects.find(p => p.id === projectId);
          if (!current) throw new Error('项目已删除');
          useCanvasStore.getState().addNode(projectId, { ...node, x: 80 + (index % 3) * 332, y: baseY + Math.floor(index / 3) * 520, assetRole: node.type === 'audio' ? 'audio' : node.type === 'video' ? (role === 'reference' ? 'reference' : 'clip') : role === 'audio' || role === 'clip' ? 'reference' : role });
          saved++;
        } catch (error) { errors.push(`${file.name}：${error instanceof Error ? error.message : '保存失败'}`); }
      }
      setMessage(`已保存 ${saved}/${files.length} 份素材${errors.length ? `；${errors.join('；')}` : '，可在下方绑定分镜'}`);
    } finally { lock.current = false; setBusy(false); }
  };
  const readDocument = async (file?: File) => {
    if (!file || lock.current) return;
    if (file.size > 15 * 1024 * 1024) { setMessage('制作方案请控制在 15 MB 以内'); return; }
    lock.current = true; setBusy(true); setMessage('正在读取制作方案…');
    try {
      const form = new FormData(); form.append('file', file);
      const response = await apiFetch('/api/assistant/extract-document', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok || !data.success || typeof data.text !== 'string') throw new Error(data.error || '文档读取失败');
      updateDraft({ source: data.text });
      setMessage(data.truncated ? '文档已截断，请分段导入并核对遗漏分镜' : '已读取方案。点击“提取分镜草稿”后核对内容；此步骤不调用模型');
    } catch (error) { setMessage(error instanceof Error ? error.message : '读取失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  const extract = () => {
    try {
      const shots = parseProductionText(draft.source);
      if (!shots.length) { setMessage('未识别到分镜。请按示例整理，或点击“添加分镜”逐镜填写；原文已保留'); return; }
      if (draft.shots.length && !window.confirm('替换当前分镜草稿？已经创建的画布节点仍会保留。')) return;
      updateDraft({ shots }); setMessage(`提取 ${shots.length} 镜草稿，请核对提示词、动作和时长后创建节点`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '提取失败'); }
  };
  const create = () => {
    if (lock.current) return;
    try {
      const current = useCanvasStore.getState().projects.find(p => p.id === projectId);
      if (!current) throw new Error('项目不存在');
      const config = useAppStore.getState();
      const videos = getEnabledVideoModelsFromSettings(readWorkflowModelsFromStorage());
      const selected = videos.find(model => model.id === config.quickVideoModel) || videos[0];
      const videoId = typeof selected?.id === 'string' ? selected.id : '';
      const rawDurations = selected?.supportedDurations;
      const durations = Array.isArray(rawDurations) && rawDurations.length
        ? rawDurations.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0).sort((a,b) => a-b)
        : getVideoModelById(videoId)?.supportedDurations || [4,5,6,7,8,9,10,11,12,13,14,15];
      const resolutions = selected?.supportedResolutions;
      const nodes = buildProductionNodes(draft, current.nodes, { image: config.quickModel || '', video: videoId, videoDurations: durations, videoQuality: Array.isArray(resolutions) && typeof resolutions[0] === 'string' ? resolutions[0] : '720P', videoAspect: draft.aspect });
      useCanvasStore.getState().addNodes(projectId, nodes);
      setMessage(`已创建 ${nodes.length} 个节点。返回画布检查模型参数，先生成关键帧，再生成视频；已有视频直接复用。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '创建失败'); }
  };
  return <>
    <button ref={trigger} type="button" className="absolute right-6 top-14 z-40 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm" onMouseDown={e => e.stopPropagation()} onClick={() => setOpen(true)}>素材与分镜</button>
    {open && createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/35 p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="素材与分镜" tabIndex={-1} className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white text-slate-800" onKeyDown={e => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">素材与分镜</h2><p className="mt-1 text-xs text-slate-500">提交已有素材，核对制作方案，再创建关联节点。创建节点不会自动生成或扣费。</p></div><button type="button" aria-label="关闭素材与分镜" disabled={busy} onClick={() => setOpen(false)}>关闭</button></header>
        <div className="overflow-y-auto p-4 space-y-6">
          <section><h3 className="mb-2 font-medium">1. 已有素材</h3><p className="mb-3 text-xs text-slate-500">可批量上传或直接拖进画布；也可用左侧资产库导入已有生成结果。文件按当前存储设置保存，单文件不超过 90 MB。音频暂作为项目素材保存。</p>
            <div className="flex flex-wrap items-center gap-3"><select aria-label="上传素材用途" className={field + ' max-w-48'} value={role} onChange={e => setRole(e.target.value as CanvasAssetRole)}>{Object.entries(assetRoleLabels).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select>
            <label className="cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 focus-within:ring-2 focus-within:ring-indigo-400">批量选择素材<input className="sr-only" aria-label="批量提交已有素材" type="file" accept="image/*,video/*,audio/*" multiple disabled={busy} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; void upload(files); }} /></label></div>
            <div className="mt-3 max-h-48 overflow-y-auto divide-y">{media.map(node => <div key={node.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="truncate">{node.title || node.id}{node.missingMedia ? '（文件缺失）' : ''}</span><select aria-label={`${node.title || node.id}用途`} className={field + ' max-w-48'} value={node.assetRole || 'reference'} onChange={e => useCanvasStore.getState().updateNode(projectId, node.id, { assetRole: e.target.value as CanvasAssetRole })}>{Object.entries(assetRoleLabels).filter(([id]) => node.audioUrl ? id === 'audio' || id === 'reference' : node.videoUrl ? id === 'clip' || id === 'reference' : id !== 'clip' && id !== 'audio').map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></div>)}</div>
          </section>
          <section><h3 className="mb-2 font-medium">2. 制作方案</h3><label className="inline-block cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-indigo-400">导入已有文档<input className="sr-only" aria-label="导入制作方案" type="file" accept=".txt,.md,.docx,.pdf" disabled={busy} onChange={e => { void readDocument(e.target.files?.[0]); e.target.value = ''; }} /></label>
            <textarea aria-label="制作方案原文" className={field + ' mt-3 h-28'} disabled={busy} value={draft.source} onChange={e => updateDraft({ source: e.target.value })} placeholder={'每行：镜头标题 | 成片秒数 | 图片提示词 | 视频动作\n开盒 | 2 | 桌面上打开汉堡包装的近景 | 双手缓慢打开盒盖，镜头轻推\n也支持：0–2秒：外卖到手（动作需补充）'} />
            <div className="mt-2 flex gap-3"><button type="button" className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700 disabled:opacity-40" disabled={busy} onClick={extract}>提取分镜草稿</button><button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40" disabled={busy || draft.shots.length >= 40} onClick={() => updateDraft({ shots: [...draft.shots, newShot()] })}>添加分镜</button><select className="rounded-lg border border-slate-200 px-2 text-sm" aria-label="成片比例" value={draft.aspect} onChange={e => updateDraft({ aspect: e.target.value as CanvasProductionDraft['aspect'] })}><option>9:16</option><option>16:9</option><option>1:1</option></select></div>
          </section>
          {draft.shots.length > 0 && <section><h3 className="mb-2 font-medium">3. 核对分镜 · {draft.shots.length} 镜 · 合计 {Number(draft.shots.reduce((n,s) => n + (Number.isFinite(s.seconds) ? s.seconds : 0), 0).toFixed(2))} 秒</h3><p className="text-xs text-slate-500 mb-3">已有视频优先复用；已有关键帧只生成视频。创建后在画布编辑节点。成片时长仅用于剪辑规划，本轮不执行自动剪辑。</p>
            {draft.shots.map((shot,index) => {
              const created = project.nodes.some(n => n.productionShotId === shot.id);
              return <fieldset key={shot.id} disabled={created || busy} className="mb-4 rounded-xl border p-3"><legend className="px-2 text-sm">分镜 {index+1}{created ? ' · 已创建' : ''}</legend>
                <div className="grid grid-cols-[1fr_100px_auto] gap-2"><input aria-label={`分镜${index+1}标题`} className={field} value={shot.title} onChange={e => updateShot(shot.id, { title: e.target.value })} placeholder="镜头标题" /><label className="text-xs">成片秒数<input aria-label={`分镜${index+1}时长`} className={field} type="number" min="0.1" max="120" step="0.1" value={shot.seconds} onChange={e => updateShot(shot.id, { seconds: Number(e.target.value) })} /></label><button type="button" onClick={() => updateDraft({ shots: draft.shots.filter(s => s.id !== shot.id) })}>移除</button></div>
                <div className="mt-2 grid sm:grid-cols-2 gap-2"><select aria-label={`分镜${index+1}已有关键帧`} className={field} value={shot.imageNodeId || ''} onChange={e => updateShot(shot.id, { imageNodeId: e.target.value })}><option value="">生成新关键帧</option>{imageOptions.map(n => <option key={n.id} value={n.id}>{n.title || n.id}</option>)}</select><select aria-label={`分镜${index+1}已有视频`} className={field} value={shot.videoNodeId || ''} onChange={e => updateShot(shot.id, { videoNodeId: e.target.value })}><option value="">生成新视频</option>{videoOptions.map(n => <option key={n.id} value={n.id}>{n.title || n.id}</option>)}</select>
                <textarea aria-label={`分镜${index+1}图片提示词`} className={field} value={shot.imagePrompt} onChange={e => updateShot(shot.id, { imagePrompt: e.target.value })} placeholder="图片提示词；商品 / 人物 / 场景素材自动关联到新关键帧" /><textarea aria-label={`分镜${index+1}视频动作`} className={field} value={shot.videoPrompt} onChange={e => updateShot(shot.id, { videoPrompt: e.target.value })} placeholder="视频动作、运镜；不会把成片秒数当作模型生成时长" /></div>
              </fieldset>;
            })}
          </section>}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t p-4"><p role="status" className="text-xs text-slate-600 whitespace-pre-wrap">{message || '分镜草稿和素材用途会随画布保存'}</p>{onLocate && project.nodes.length > 0 && <button type="button" className="shrink-0 text-sm text-indigo-600" disabled={busy} onClick={() => { setOpen(false); onLocate(); }}>返回画布定位</button>}<button type="button" className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-white disabled:opacity-40" disabled={busy || !draft.shots.length} onClick={create}>创建分镜节点</button></footer>
      </div>
    </div>, document.body)}
  </>;
}
