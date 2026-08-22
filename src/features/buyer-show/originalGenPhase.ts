import type { GenerationTask } from '@/store/useAppStore';

/** 原创 Step3 执行阶段（顶栏主 CTA 驱动） */
export type OriginalGenPhase =
  | 'need_shot1'
  | 'need_face_confirm'
  | 'ready_batch'
  | 'ready_export'
  | 'generating';

export function resolveOriginalGenPhase(params: {
  tasks: GenerationTask[];
  isBatchGenerating: boolean;
  sceneAnchorEnabled: boolean;
  modelPersona: string;
  anchorFaceImageUrl?: string | null;
  isAnchorFaceConfirmed: boolean;
}): OriginalGenPhase {
  const {
    tasks,
    isBatchGenerating,
    sceneAnchorEnabled,
    modelPersona,
    anchorFaceImageUrl,
    isAnchorFaceConfirmed,
  } = params;

  if (isBatchGenerating || tasks.some((t) => t.status === 'IN_PROGRESS')) {
    return 'generating';
  }

  const isNoModel =
    !modelPersona ||
    modelPersona.includes('无人物') ||
    modelPersona.includes('无需模特') ||
    modelPersona.includes('纯商品') ||
    modelPersona.includes('纯静物');
  const hasAnyHuman =
    !isNoModel &&
    tasks.some(
      (t) =>
        t.has_human === true ||
        (t.has_human !== false && (t.shot_type === 'model_shot' || !t.shot_type))
    );

  const first = tasks[0];
  const successCount = tasks.filter((t) => t.status === 'SUCCESS' && t.resultUrl).length;
  const allSuccess = tasks.length > 0 && tasks.every((t) => t.status === 'SUCCESS' && t.resultUrl);
  const sceneOn = sceneAnchorEnabled !== false;

  // 需要先出分镜 1：场景定桩开启，或人物模式尚未确认正脸且无上传正脸
  const needsSerialShot1 =
    (sceneOn && tasks.length > 1) ||
    (hasAnyHuman && !isAnchorFaceConfirmed && !anchorFaceImageUrl);

  if (needsSerialShot1 && (!first || first.status !== 'SUCCESS' || !first.resultUrl)) {
    return 'need_shot1';
  }

  if (hasAnyHuman && !isAnchorFaceConfirmed && !anchorFaceImageUrl) {
    return 'need_face_confirm';
  }

  if (allSuccess || (successCount > 0 && tasks.every((t) => t.status === 'SUCCESS' || t.status === 'FAILURE'))) {
    // 仍有未成功镜 → 可继续批；全部成功 → 导出
    const pending = tasks.filter((t) => t.prompt && t.status !== 'SUCCESS');
    if (pending.length === 0 && successCount > 0) return 'ready_export';
  }

  if (successCount > 0) {
    const pending = tasks.filter((t) => t.prompt && t.status !== 'SUCCESS');
    if (pending.length === 0) return 'ready_export';
    return 'ready_batch';
  }

  return 'ready_batch';
}

export function originalGenPhaseLabel(phase: OriginalGenPhase, opts?: { restCount?: number; successCount?: number }): string {
  switch (phase) {
    case 'need_shot1':
      return '生成分镜 1';
    case 'need_face_confirm':
      return '请先确认人脸';
    case 'ready_batch':
      return opts?.restCount && opts.restCount > 0
        ? `生成其余分镜 (${opts.restCount})`
        : '批量生图';
    case 'ready_export':
      return `下一步：导出 (${opts?.successCount || 0})`;
    case 'generating':
      return '生成中…';
    default:
      return '批量生图';
  }
}
