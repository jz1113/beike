import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { buildScriptStoryboard, storyboardStyle } from '@client/features/sales/model/salesScriptStoryboard';
import type { SalesLibraryChoice } from '@client/features/sales/model/salesWorkspace';
import { SalesStoryboardTable } from '@client/features/sales/components/SalesStoryboardTable';
import { MediaDeleteControl } from './MediaDeleteControl';
import type { ScriptEntry } from './mediaIndex';

export function ScriptDetail({ item, folder, onClose, onNotice, onSelectSales, collectionControls }: {
  item: ScriptEntry;
  folder:string;
  collectionControls?:ReactNode;
  onNotice: (value: string) => void;
  onClose: () => void;
  onSelectSales?: (choice: SalesLibraryChoice) => void;
}) {
  const { script, depthVideoUrl } = item.record;
  const shots = useMemo(() => buildScriptStoryboard(script), [script]);
  const [index, setIndex] = useState(0);
  const [failedUrl, setFailedUrl] = useState('');
  const player = useRef<HTMLVideoElement>(null);
  const dialogRef = useModalDialog(true, onClose, {initialFocusSelector:'[aria-label="关闭动作详情"]'});
  const playbackUrl = depthVideoUrl && proxyMediaUrl(depthVideoUrl, { asVideo: true });
  const shot = shots[index];

  function selectShot(next: number) {
    setIndex(next);
    if (player.current && player.current.readyState >= 1) {
      player.current.currentTime = shots[next].segments[0].beat.start;
    }
  }

  return <div ref={dialogRef} tabIndex={-1} className="bml-script-detail" role="dialog" aria-modal="true" aria-label="动作脚本详情">
    <div className="bml-script-heading"><div><small>动作 / 分镜脚本</small><h2>{item.name}</h2></div>
      {collectionControls}
      <div className="bml-detail-actions">{item.sources && <MediaDeleteControl sources={item.sources} folder={item.classificationMoved ? '' : folder} onDeleted={onClose} onNotice={onNotice}/>}
        <button onClick={onClose} aria-label="关闭动作详情"><X size={18}/></button></div>
    </div>
    <div className="bml-script-columns">
      <section className="bml-shot-player" aria-label="深度分镜视频">
        <h3>深度动作视频</h3>
        {playbackUrl && depthVideoUrl !== failedUrl ? <video key={depthVideoUrl} ref={player} controls playsInline preload="metadata" aria-label="深度动作视频"
          src={playbackUrl}
          onError={() => setFailedUrl(depthVideoUrl || '')}
          onLoadedMetadata={event => { if (shot) event.currentTarget.currentTime = shot.segments[0].beat.start; }}
          onTimeUpdate={event => {
            const time = event.currentTarget.currentTime;
            const next = shots.findIndex(({ segments: [{ beat }] }) => time >= beat.start && time < beat.end);
            if (next >= 0) setIndex(next);
          }}/> : depthVideoUrl ? <>
          <p role="status">深度视频加载失败。</p>
          <button type="button" onClick={() => setFailedUrl('')}>重新加载深度视频</button>
        </> : <p role="status">{item.record.depthTaskId ? '深度任务已提交，等待结果入库。' : '此脚本尚未关联深度视频。可在动作导入中选择同一文件，启用深度转换。'}</p>}
        {shot && <small>分镜 {shot.number} · {shot.range}</small>}
        {shot?.segments[0].beat.actionTemplate && <div className="bml-action-cue"><h4>本段复用动作</h4><p>{shot.segments[0].beat.actionTemplate}</p></div>}
      </section>
      <section className="bml-shot-document" aria-label="分镜表">
        <h3>分镜总览</h3>
        <p className="bml-shot-stats">全长 {script.durationSec} 秒 · {script.shots.length} 个镜头 · {shots.length} 段动作</p>
        <SalesStoryboardTable rows={shots} selected={index} onSelect={selectShot}/>
        {(script.overview || script.visualSpec.styleSummary || script.visualSpec.lighting) && <section className="bml-shot-context">
          <h3>全片概述与拍摄风格</h3><p>{script.overview}</p>
          {(script.visualSpec.styleSummary || script.visualSpec.lighting) && <p>{storyboardStyle(script)}</p>}
        </section>}
        {onSelectSales && item.salesChoices?.map(choice => <button key={choice.id} onClick={() => { onClose(); onSelectSales(choice); }}>用于视频制作</button>)}
      </section>
    </div>
  </div>;
}
