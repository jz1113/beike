import { useEffect, useRef, useState } from 'react';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { CoverDeconstructError, deconstructCoverSample, fetchCoverMemory } from '../api/coverMemoryApi';
import {
  canStartCoverFeed,
  coverFeedPhase,
  reconcileCoverFeedJob,
  type CoverFeedJobStatus,
} from '../model/coverFeedState';
import { decodeCoverSample, importCoverSamples, releaseCoverSampleDrafts, type CoverSampleDraft } from '../model/coverSampleImport';

export interface CoverFeedJob extends CoverSampleDraft {
  status: CoverFeedJobStatus;
  requestKey?: string;
  selectionId?: string;
  effort?: ReasoningEffort;
  url?: string;
  error?: string;
  sampleId?: string;
}

export function useCoverSampleFeed(reloadMemory: () => Promise<unknown>) {
  const [jobs, setJobs] = useState<CoverFeedJob[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const jobsRef = useRef(jobs);
  const runningRef = useRef(false);
  jobsRef.current = jobs;

  useEffect(() => () => releaseCoverSampleDrafts(jobsRef.current), []);

  const patch = (id: string, next: Partial<CoverFeedJob>) => {
    jobsRef.current = jobsRef.current.map((job) => job.id === id ? { ...job, ...next } : job);
    setJobs(jobsRef.current);
  };

  const addFiles = async (files: File[]) => {
    const result = await importCoverSamples(files, decodeCoverSample, jobsRef.current.length);
    if (result.error) {
      releaseCoverSampleDrafts(result.drafts);
      setNotice(result.error);
      return;
    }
    setJobs((current) => [...current, ...result.drafts.map((draft) => ({ ...draft, status: 'queued' as const, requestKey: crypto.randomUUID() }))]);
    setNotice(result.skipped.length ? `已跳过 ${result.skipped.length} 个文件：${result.skipped[0]?.reason}` : null);
  };

  const removeJob = (id: string) => {
    const job = jobsRef.current.find((item) => item.id === id);
    if (job) releaseCoverSampleDrafts([job]);
    setJobs((current) => current.filter((item) => item.id !== id));
  };

  const clearJobs = () => {
    releaseCoverSampleDrafts(jobsRef.current);
    setJobs([]);
    setNotice(null);
  };

  const runJob = async (job: CoverFeedJob, selectionId: string, startedAt: string, effort?: ReasoningEffort) => {
    const requestKey = job.status === 'failed' ? crypto.randomUUID() : job.requestKey || crypto.randomUUID();
    patch(job.id, { requestKey, selectionId, effort, sampleId: undefined });
    let url = job.url;
    try {
      if (!url) {
        patch(job.id, { status: 'uploading', error: undefined });
        url = await uploadStudioFile(job.file, 'cover-memory');
        patch(job.id, { url });
      }
      patch(job.id, { status: 'analyzing' });
      const result = await deconstructCoverSample(url, selectionId, job.name.replace(/\.[^.]+$/, '') || '封面样张', effort, requestKey);
      patch(job.id, { status: 'done', sampleId: result.sampleId, error: undefined });
      return true;
    } catch (error) {
      const uncertain = error instanceof CoverDeconstructError && error.uncertain;
      const message = error instanceof Error ? error.message : '封面反推失败';
      if (!uncertain) {
        patch(job.id, { status: 'failed', error: message });
        return false;
      }
      try {
        const memory = await fetchCoverMemory();
        const reconciled = reconcileCoverFeedJob({ id: job.id, status: 'uncertain', url, requestKey, sampleId: error instanceof CoverDeconstructError ? error.sampleId : undefined }, memory.samples, startedAt);
        patch(job.id, reconciled);
        return reconciled.status === 'done';
      } catch {
        patch(job.id, { status: 'uncertain', requestKey, error: message, sampleId: error instanceof CoverDeconstructError ? error.sampleId : undefined });
        return false;
      }
    }
  };

  const start = async (selectionId: string, effort?: ReasoningEffort) => {
    if (runningRef.current || !selectionId || !canStartCoverFeed(jobsRef.current.map((job) => job.status))) return false;
    const pending = jobsRef.current.filter((job) => job.status === 'queued' || job.status === 'failed');
    if (pending.length === 0) return false;
    runningRef.current = true;
    setNotice(null);
    const startedAt = new Date(Date.now() - 2000).toISOString();
    let cursor = 0;
    let done = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const job = pending[cursor];
        cursor += 1;
        if (job && await runJob(job, selectionId, startedAt, effort)) done += 1;
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(2, pending.length) }, () => worker()));
      try {
        await reloadMemory();
      } catch {
        setNotice('反推结果需要重新读取，请打开封面记忆核对，不要重复投喂');
      }
      return done === pending.length;
    } finally {
      runningRef.current = false;
    }
  };

  const retryUncertain = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setNotice(null);
    try {
      const memory = await fetchCoverMemory();
      const startedAt = new Date(0).toISOString();
      for (const job of jobsRef.current.filter((candidate) => candidate.status === 'uncertain')) {
        const matched = memory.samples.find((sample) => sample.id === job.sampleId || Boolean(job.requestKey && sample.requestKey === job.requestKey));
        if (matched) patch(job.id, reconcileCoverFeedJob(job, memory.samples, startedAt));
        else if (job.requestKey && job.url && job.selectionId) {
          // Replay the exact request key: an existing operation can never dispatch twice.
          await runJob(job, job.selectionId, startedAt, job.effort);
        }
      }
      await reloadMemory();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '封面记忆读取失败');
    } finally { runningRef.current = false; }
  };

  const statuses = jobs.map((job) => job.status);
  return {
    jobs,
    notice,
    dragging,
    setDragging,
    phase: coverFeedPhase(statuses, dragging),
    busy: statuses.some((status) => status === 'uploading' || status === 'analyzing'),
    addFiles,
    removeJob,
    clearJobs,
    start,
    retryUncertain,
  };
}
