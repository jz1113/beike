/*
 * Swipe motion adapted from React Bits SwipeToast (David Haz, 2026):
 * https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Micro/SwipeToast
 * Installed with jsrepo in a temporary directory. Adapted for persistent jobs:
 * no timeout fuse; only terminal cards can be dismissed, active jobs stay visible.
 * MIT + Commons Clause License Condition v1.0
 * Copyright (c) 2026 David Haz
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, and distribute the Software as part of an
 * application, website, or product, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * Commons Clause Restriction: You may use this Software, including for any
 * commercial purpose, so long as you do not sell, sublicense, or redistribute
 * the components themselves—whether alone, in a bundle, or as a ported version.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { useRef, useState, type PointerEvent } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { Check, ChevronDown, ChevronRight, CircleAlert, Clock3, LoaderCircle, Sparkles, Square, X } from 'lucide-react';
import type { DeconstructJobSnapshot, DeconstructJobStatus } from '@shared/contracts/deconstructJobs';
import '../deconstruct-job-notifications.css';

export type DeconstructJobNotificationsProps = {
  jobs: DeconstructJobSnapshot[];
  connectionError?: string | null;
  onStop: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
  onView: (jobId: string) => void;
};

const EASE_OUT: [number, number, number, number] = [.23, 1, .32, 1];
const statusLabels: Record<DeconstructJobStatus, string> = {
  queued: '排队中', running: '反推中', stopping: '正在收尾', completed: '已完成',
  failed: '有失败项', stopped: '已停止', interrupted: '已中断',
};
const itemLabels = { queued: '等待派发', running: '正在处理', done: '已完成', error: '失败', stopped: '已停止', interrupted: '结果待确认' };
const isActive = (status: DeconstructJobStatus) => status === 'queued' || status === 'running' || status === 'stopping';
const rubberband = (over: number, dim = 24, c = .55) => (over * dim * c) / (dim + c * Math.abs(over));
const counts = (job: DeconstructJobSnapshot) => ({
  done: job.items.filter(item => item.status === 'done').length,
  problems: job.items.filter(item => item.status === 'error' || item.status === 'interrupted' || (item.result?.ok && item.result.partial)).length,
  settled: job.items.filter(item => !['queued', 'running'].includes(item.status)).length,
});
const jobLabel = (job: DeconstructJobSnapshot) => job.status === 'failed'
  ? job.items.some(item => item.status === 'done') ? '部分失败' : '全部失败'
  : statusLabels[job.status];

function JobMark({ status }: { status: DeconstructJobStatus }) {
  if (status === 'running' || status === 'stopping') return <LoaderCircle className="deconstruct-job-spinner" />;
  if (status === 'queued') return <Clock3 />;
  if (status === 'completed') return <Check />;
  if (status === 'failed' || status === 'interrupted') return <CircleAlert />;
  return <Square />;
}

function JobCard({ job, onStop, onDismiss, onView }: Pick<DeconstructJobNotificationsProps, 'onStop' | 'onDismiss' | 'onView'> & { job: DeconstructJobSnapshot }) {
  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; startY: number; grab: number | null; hist: [number, number][] } | null>(null);
  const leaving = useRef(false);
  const y = useMotionValue(0);
  const fade = useMotionValue(1);
  const transform = useTransform(y, value => `translateY(${value}px)`);
  const active = isActive(job.status);
  const { done, settled, problems } = counts(job);
  const percent = job.items.length ? settled / job.items.length * 100 : 0;
  const progress = job.items.find(item => item.status === 'running' && item.progress?.message)?.progress?.message;
  const title = job.items.length === 1 ? job.items[0].name : `${job.items[0]?.name || '参考图集'} 等 ${job.items.length} 套`;

  const dismiss = (swiped = false) => {
    if (active || leaving.current) return;
    leaving.current = true;
    if (!reduce && swiped) animate(y, y.get() + (cardRef.current?.offsetHeight || 120), { type: 'spring', duration: .3, bounce: 0 });
    void animate(fade, 0, { duration: reduce ? 0 : .18, ease: EASE_OUT }).then(() => onDismiss(job.jobId));
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (active || event.button !== 0 || drag.current || leaving.current || (event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    y.stop();
    drag.current = { id: event.pointerId, startY: event.clientY, grab: null, hist: [[performance.now(), y.get()]] };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    if (d.grab === null) {
      if (Math.abs(event.clientY - d.startY) < 3) return;
      d.grab = event.clientY - y.get();
    }
    const raw = event.clientY - d.grab;
    const next = raw >= 0 ? raw : rubberband(raw);
    y.set(next);
    d.hist.push([performance.now(), next]);
    if (d.hist.length > 4) d.hist.shift();
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const [t0, y0] = d.hist[0];
    const [t1, y1] = d.hist[d.hist.length - 1];
    const velocity = performance.now() - t1 > 100 ? 0 : (y1 - y0) / Math.max(1, t1 - t0);
    if (!cancelled && y.get() > 0 && (velocity > .11 || (y.get() >= 40 && velocity >= 0))) dismiss(true);
    else animate(y, 0, reduce ? { duration: 0 } : { type: 'spring', duration: .45, bounce: .15, velocity: velocity * 1000 });
  };

  return (
    <motion.div ref={cardRef} className="deconstruct-job-card" data-status={job.status} data-attention={problems > 0} style={{ transform, opacity: fade }}>
      <div className="deconstruct-job-card-head" data-dismissible={!active}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)}>
        <span className="deconstruct-job-mark">{job.status === 'completed' && problems > 0 ? <CircleAlert /> : <JobMark status={job.status} />}</span>
        <div className="deconstruct-job-card-title">
          <strong title={title}>{title}</strong>
          <span>{jobLabel(job)} · 成功 {done}/{job.items.length} 套{problems > 0 ? ` · ${problems} 套需查看` : ''}</span>
        </div>
        {!active && <button type="button" className="deconstruct-job-icon-button" aria-label={`移除通知：${title}`} title="移除这条通知，不删除图集结果" onClick={() => dismiss()}><X /></button>}
      </div>
      <div className="deconstruct-job-progress" role="progressbar" aria-label="图集处理进度" aria-valuemin={0} aria-valuemax={job.items.length} aria-valuenow={settled}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="deconstruct-job-description">
        {job.status === 'stopping' ? '停止待派发图集，已派发请求继续收尾。'
          : job.status === 'interrupted' ? '服务曾中断，未自动重发。请确认已派发图集的结果。'
            : job.error || progress || (active ? '可继续使用页面，任务会在后台处理。' : '结果已保留，可查看图集与问题详情。')}
      </p>
      <div className="deconstruct-job-actions">
        <button type="button" className="deconstruct-job-view" onClick={() => onView(job.jobId)}>查看图集<ChevronRight /></button>
        {active && <button type="button" className="deconstruct-job-stop" onClick={() => onStop(job.jobId)} disabled={job.status === 'stopping'}
          title="只取消待派发图集，已派发请求继续收尾"><Square />{job.status === 'stopping' ? '收尾中' : '停止待派发'}</button>}
      </div>
      <details className="deconstruct-job-details">
        <summary>逐套进度{problems > 0 ? `与问题 (${problems})` : ''}<ChevronDown /></summary>
        <ul>
          {job.items.map(item => {
            const issue = item.error || (item.result && !item.result.ok ? item.result.error : '');
            return <li key={item.id} data-status={item.status}>
              <div><strong title={item.name}>{item.name}</strong><span>{itemLabels[item.status]}</span></div>
              <p>{issue || (item.result?.ok && item.result.partial ? '部分图片未成功反推，请核对结果。' : item.progress?.message || `${item.images.length} 张参考图片`)}</p>
            </li>;
          })}
        </ul>
      </details>
    </motion.div>
  );
}

export function DeconstructJobNotifications({ jobs, connectionError, onStop, onDismiss, onView }: DeconstructJobNotificationsProps) {
  const [expanded, setExpanded] = useState(false);
  const activeJobs = jobs.filter(job => isActive(job.status));
  const focusJob = activeJobs[0] || jobs[0];
  const needsAttention = jobs.filter(job => job.status === 'failed' || job.status === 'interrupted' || counts(job).problems > 0).length;
  const completedJobs = jobs.filter(job => job.status === 'completed').length;
  const summary = activeJobs.length ? `后台反推 · ${activeJobs.length} 个任务`
    : needsAttention ? `${needsAttention} 个任务需要查看` : jobs.length ? '后台反推已结束' : '任务连接暂时中断';
  const subtitle = focusJob ? `${counts(focusJob).done}/${focusJob.items.length} 套成功 · ${jobLabel(focusJob)}` : '连接恢复后继续同步进度';
  const updates = activeJobs.length ? needsAttention ? `${needsAttention} 个需查看` : completedJobs ? `${completedJobs} 个已完成` : '' : '';
  if (!jobs.length && !connectionError) return null;

  return (
    <aside className="deconstruct-job-dock" aria-label="后台图集反推任务">
      <div className="deconstruct-job-dock-surface" data-expanded={expanded}>
        <button type="button" className="deconstruct-job-toggle" aria-expanded={expanded} aria-controls="deconstruct-job-notification-list" onClick={() => setExpanded(value => !value)}>
          <span className="deconstruct-job-dock-mark" data-attention={Boolean(connectionError) || needsAttention > 0}>
            {activeJobs.length ? <LoaderCircle className="deconstruct-job-spinner" /> : needsAttention || connectionError ? <CircleAlert /> : <Sparkles />}
          </span>
          <span className="deconstruct-job-dock-title"><strong>{summary}</strong><span>{subtitle}{updates && <b className="deconstruct-job-update-badge" data-attention={needsAttention > 0}>{updates}</b>}{!expanded && connectionError ? ' · 连接异常' : ''}</span></span>
          <ChevronDown className="deconstruct-job-toggle-chevron" />
        </button>
        <p className="deconstruct-job-live-status" role="status" aria-live="polite" aria-atomic="true">{summary}，{subtitle}{connectionError ? '，连接异常' : ''}</p>
        {expanded && <div id="deconstruct-job-notification-list" className="deconstruct-job-list">
          {connectionError && <div className="deconstruct-job-connection-error" role="alert"><CircleAlert /><span>暂时无法同步进度。{connectionError}</span></div>}
          {jobs.map(job => <JobCard key={job.jobId} job={job} onStop={onStop} onDismiss={onDismiss} onView={onView} />)}
        </div>}
      </div>
    </aside>
  );
}
