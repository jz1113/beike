import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssembledSalesPrompt, SalesScriptDomain } from '@shared/domain/sales';
import { prepareSalesProductionVideos } from '../api/salesDepthReference';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { resolveSalesVideoSettings } from '../model/salesVideoSettings';

interface Input {
  active: boolean;
  assembled: AssembledSalesPrompt;
  plan: SalesProductionPlanState;
  script: SalesScriptDomain;
}
interface Preparation {
  key: string;
  videos?: string[];
  error: string;
}

/** Review and validate the same prepared motion window that generation submits. */
export function useSalesDepthReferences({ active, assembled, plan, script }: Input) {
  const settings = resolveSalesVideoSettings(plan, script, assembled.references, assembled.audios || []);
  const sourceUrl = assembled.references.find((slot) => slot.kind === 'action' && slot.mediaType === 'video')?.url;
  const required = assembled.imitationMode === 'depth_imitation' && Boolean(sourceUrl) && script.durationSec > 0;
  const videosKey = JSON.stringify(settings.videos);
  const key = JSON.stringify([sourceUrl, script.durationSec, videosKey, plan.videoModel, settings.durationSec]);
  const cache = useRef(new Map<string, string[]>());
  const [state, setState] = useState<Preparation>({ key: '', error: '' });
  const [retryRevision, setRetryRevision] = useState(0);
  const validationError = required ? settings.validationError : '';
  const enabled = active && required && !validationError;

  useEffect(() => {
    if (!enabled || cache.current.has(key)) return;
    const controller = new AbortController();
    setState({ key, error: '' });
    void prepareSalesProductionVideos({ imitationMode: 'depth_imitation', sourceUrl, endSec: script.durationSec,
      videos: JSON.parse(videosKey) as string[], model: plan.videoModel, durationSec: settings.durationSec }, controller.signal, () => {})
      .then((videos) => {
        if (controller.signal.aborted) return;
        cache.current.set(key, videos);
        setState({ key, videos, error: '' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : '准备深度动作片段失败，请返回分镜检查后重试。' });
      });
    return () => controller.abort();
  }, [enabled, key, plan.videoModel, retryRevision, script.durationSec, settings.durationSec, sourceUrl, videosKey]);

  const videos = cache.current.get(key) || (state.key === key ? state.videos : undefined);
  const error = validationError || (enabled && state.key === key ? state.error : '');
  const preparing = enabled && !videos && !error;
  const retry = useCallback(() => {
    setState({ key, error: '' });
    setRetryRevision((revision) => revision + 1);
  }, [key]);
  const prepared = useMemo(() => {
    if (!required || !videos) return assembled;
    const originalVideos = JSON.parse(videosKey) as string[];
    const mapped = new Map(originalVideos.map((url, index) => [url, videos[index]]));
    return { ...assembled, references: assembled.references.map((slot) => slot.mediaType === 'video' && mapped.has(slot.url)
      ? { ...slot, url: mapped.get(slot.url)! } : slot) };
  }, [assembled, required, videos, videosKey]);
  return { assembled: prepared, preparing, error, retry, canRetry: enabled && Boolean(error) };
}
