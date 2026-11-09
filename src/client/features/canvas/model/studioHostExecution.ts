import { inheritStudioCompiler, studioVideoSettings } from './studioCompilerState';
import { resolveStudioInputs } from './studioConnections';
import { composeStudioVideo } from './studioCompose';
import { prepareStudioGeneration, submitStudioDepth, type StudioRequest } from './studioGeneration';
import {
  normalizeStudioNode,
  resolveStableStudioReference,
  selectStudioModelFor,
} from './studioHostRuntime';
import { studioOriginalVideo } from './studioPreview';
import {
  assertStudioPromptPreparation,
  optimizeStudioGeneration,
  recoverStudioVideoPromptOperation,
  reviewVideoPrompt,
  studioPromptContext,
  studioPromptPreparationKey,
} from './studioPromptOperation';
import { canvasSpeechRequest } from './studioSpeech';
import {
  restoreStudioTaskResult,
  studioGenerationFailure,
  studioMediaRunBlock,
  studioNodeTaskId,
  type StudioTaskCommands,
} from './studioTaskState';
import { recoverStudioTextRun, studioTextRequest } from './videoWorkflowRecovery';
import { useAppStore } from '@client/store';
import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import type { StudioScene } from './types';

export interface StudioHostExecutionOptions {
  projectId: string;
  projectTitle: string;
  commands: StudioTaskCommands;
  saveScene: (scene: StudioScene) => Promise<void>;
  loadAsset?: (url: string, localId: string | null) => Promise<Blob | undefined>;
  requestReview?: Parameters<typeof reviewVideoPrompt>[2];
}

const TASK_SETTING_KEYS = [
  'model',
  'ratio',
  'resolution',
  'duration',
  'gptImageQuality',
  'beikeOperation',
  'beikeOriginalNodeId',
  'beikeOptimizePrompt',
  'beikeVideoWorkflow',
  'beikeVideoMode',
  'beikeVideoAudio',
];

export async function executeStudioNodeGeneration(
  nodeId: string,
  options: StudioHostExecutionOptions,
  signal?: AbortSignal,
): Promise<boolean> {
  const { projectId, projectTitle, commands, saveScene, loadAsset, requestReview } = options;
  let node = commands.read().nodes.find((n) => n.id === nodeId);
  if (!node || (node.settings as Record<string, unknown> | undefined)?.beikeLayerLocked) return false;

  if (node.type === 'gen-video') {
    try {
      if (await recoverStudioVideoPromptOperation(projectId, node.id, commands, saveScene)) return false;
    } catch (error) {
      commands.update(node.id, studioNodeTaskId(node), {
        errorMsg: error instanceof Error ? error.message : '原优化结果待核对，请查询原操作',
      });
      return false;
    }
  }

  if (node.type !== 'gen-speech' && node.isGenerating && node.beikeTaskId) return false;
  if (node.type === 'gen-image' || node.type === 'gen-video') {
    const blocked = studioMediaRunBlock(node.beikeLastTaskId, Boolean(node.beikeTaskStopped && node.beikeTaskRecord));
    if (blocked) {
      commands.update(node.id, studioNodeTaskId(node), { errorMsg: blocked });
      return false;
    }
  }

  const previousSpeechId =
    (typeof node.beikeSpeechOperationId === 'string' && node.beikeSpeechOperationId) ||
    (node.type === 'gen-speech' ? studioNodeTaskId(node) : undefined);
  const speechRecovery = node.beikeSpeechRecoveryRequired === true || (node.type === 'gen-speech' && Boolean(node.isGenerating));
  let speechPrepared = false;
  let taskId = node.type === 'gen-speech' && speechRecovery && previousSpeechId ? previousSpeechId : `studio-${crypto.randomUUID()}`;

  const snapshot = commands.read();
  node = inheritStudioCompiler(node, snapshot);
  const rawSettings = (node.settings as Record<string, unknown>) || {};
  const settings: Record<string, unknown> = {
    ...(rawSettings.beikeCompilerSource ? rawSettings : (normalizeStudioNode(node).settings as Record<string, unknown>)),
  };

  try {
    const videoSettings = studioVideoSettings({ ...node, settings }, snapshot);
    if (videoSettings) {
      Object.assign(settings, {
        beikeVideoMode: videoSettings.beikeSelectedMode,
        ratio: videoSettings.selectedRatio,
        resolution: videoSettings.selectedResolution,
        duration: videoSettings.selectedDuration,
        ...(videoSettings.showAudio ? { beikeVideoAudio: videoSettings.audioEnabled } : {}),
      });
    }
    if (settings.beikeVideoWorkflow === 'w3-copy') {
      settings.beikeRawVideoUrl = undefined;
      settings.beikeSilentDelivery = false;
    }
    const taskSettings = Object.fromEntries(TASK_SETTING_KEYS.filter((k) => settings[k] !== undefined).map((k) => [k, settings[k]]));

    commands.update(node.id, studioNodeTaskId(node), {
      settings,
      beikeTaskId: taskId,
      beikeLastTaskId: taskId,
      beikeTaskStopped: false,
      beikePromptOptimizing: false,
      beikePromptReviewPending: false,
      beikeTaskRecord: undefined,
      beikeLastTaskPrompt: node.prompt,
      beikeLastTaskSettings: taskSettings,
      isGenerating: true,
      errorMsg: '',
    });

    if (node.type !== 'gen-speech' && !settings.beikeOperation && !settings.model) {
      throw new Error(
        settings.beikeVideoWorkflow === 'w3-copy'
          ? '请在模型设置中启用秘塔 MiniMax-H3 线路'
          : `贝壳云图暂无可用的${node.type === 'gen-video' ? '视频' : '图片'}模型`,
      );
    }

    const inputScene = commands.read();
    const canvasInputKey = node.type === 'gen-video' && !settings.beikeOperation ? studioPromptPreparationKey(inputScene, node.id) : undefined;
    const { prompt, refs: inputs, duration: storyboardDuration, audio: storyboardAudio } = resolveStudioInputs(inputScene, node.id);

    if (settings.beikeVideoWorkflow === 'w3-copy' || settings.beikeStoryboardKeyframe === true) {
      const upstream = new Set(inputScene.connections.filter(edge => edge.to === node!.id).map(edge => edge.from));
      const analysis = inputScene.nodes.find(item => upstream.has(item.id) && item.id.endsWith('-analysis'));
      const analysisSettings = analysis?.settings as Record<string, unknown> | undefined;
      const script = String(analysisSettings?.textNodeDisplayText || analysisSettings?.text || analysis?.content || '');
      if (storyboardDuration !== 15 || storyboardAudio !== false || [...script.matchAll(/【视频片段\s+\d+｜/g)].length !== 1)
        throw new Error('分镜必须是单条15秒且为静音，请检查05分镜');
      if (node.type === 'gen-video' && (settings.beikeVideoMode !== 'first_frame' || inputs.length !== 1 ||
          inputs[0].type !== 'image' || !inputs[0].nodeId.endsWith('-keyframe')))
        throw new Error('视频只允许提交本次目标首帧和分镜脚本');
    }

    if (settings.beikeVideoWorkflow === 'w3-copy') {
      settings.duration = `${storyboardDuration}s`;
      Object.assign(taskSettings, { duration: settings.duration, resolution: settings.resolution });
      commands.update(node.id, taskId, { settings, beikeLastTaskSettings: taskSettings });
    }

    if (node.type === 'gen-speech') {
      const url = await canvasSpeechRequest(
        String(settings.model || ''),
        prompt,
        String(settings.voice || settings.voiceId || '') || undefined,
        taskId,
        {
          projectId,
          nodeId: node.id,
          signal,
          previousOperationId: previousSpeechId,
          recoveryOnly: speechRecovery,
          onOperation: async (id) => {
            taskId = id;
            speechPrepared = true;
            commands.update(node!.id, undefined, {
              beikeTaskId: taskId,
              beikeLastTaskId: taskId,
              beikeSpeechOperationId: taskId,
              beikeSpeechRecoveryRequired: true,
            });
            await saveScene(commands.read());
          },
        },
      );
      commands.update(node.id, taskId, {
        content: url,
        settings: { ...settings, audioUrl: url, isGenerating: false },
        beikeSpeechRecoveryRequired: false,
        beikeTaskId: undefined,
        isGenerating: false,
        errorMsg: '',
      });
      await saveScene(commands.read());
      return true;
    }

    const refs = await Promise.all(inputs.map((item) => resolveStableStudioReference(item, loadAsset)));
    if (canvasInputKey) assertStudioPromptPreparation(commands.read(), node.id, taskId, canvasInputKey);

    if (settings.beikeOperation === 'compose-original') {
      const source = studioOriginalVideo(commands.read(), node.id);
      const original = await resolveStableStudioReference(source, loadAsset);
      const clips = refs.filter((ref, index) => ref.type === 'video' && inputs[index].nodeId !== source.nodeId);
      if (!clips.length) throw new Error('请先生成视频，再运行原声合成');
      const url = await composeStudioVideo([original.url, ...clips.map((ref) => ref.url)]);
      commands.update(node.id, taskId, {
        content: url,
        videoUrl: url,
        previewType: 'video',
        beikeTaskId: undefined,
        isGenerating: false,
        errorMsg: '',
      });
      await saveScene(commands.read());
      return true;
    }

    const compilerSource = typeof settings.beikeCompilerSource === 'string' ? inputScene.nodes.find((item) => item.id === settings.beikeCompilerSource) : undefined;
    const scriptOnly = settings.beikeScriptOnly === true || Boolean(compilerSource && (compilerSource.settings as Record<string, unknown>)?.beikeScriptOnly !== false);
    const explicitAudio = typeof settings.beikeVideoAudio === 'boolean' ? settings.beikeVideoAudio : undefined;

    const request: StudioRequest = {
      taskId,
      canvasInputKey,
      operation: typeof settings.beikeOperation === 'string' ? settings.beikeOperation : undefined,
      videoWorkflow: settings.beikeVideoWorkflow === 'w3-copy' ? 'w3-copy' : undefined,
      scriptOnly,
      videoMode: typeof settings.beikeVideoMode === 'string' ? settings.beikeVideoMode : undefined,
      audio:
        settings.beikeScriptOnly === true || settings.beikeCompilerSource
          ? storyboardAudio
          : settings.beikeVideoMode === 'first_frame'
            ? (storyboardAudio ?? explicitAudio)
            : (explicitAudio ?? storyboardAudio),
      model: String(settings.model || ''),
      prompt,
      refs,
      imageQuality: typeof settings.gptImageQuality === 'string' ? settings.gptImageQuality : undefined,
      ratio: typeof settings.ratio === 'string' ? settings.ratio : undefined,
      resolution: typeof settings.resolution === 'string' ? settings.resolution : undefined,
      duration: settings.beikeScriptOnly === true || settings.beikeCompilerSource ? storyboardDuration : parseFloat(String(settings.duration || '')) || undefined,
      optimizePrompt: settings.beikeOptimizePrompt !== false,
    };

    signal?.throwIfAborted();
    const executionSignal = signal ?? new AbortController().signal;

    let prepared = request.operation === 'depth-video' ? undefined : prepareStudioGeneration(request);
    if (request.operation !== 'depth-video' && !prepared) return false;
    if (prepared) {
      if (prepared.task.mediaType === 'video' && request.optimizePrompt !== false && requestReview) {
        const context = studioPromptContext(projectId, node.id, 'video', commands, saveScene, request.taskId);
        commands.update(node.id, request.taskId, { beikePromptOptimizing: true });
        const optimized = await optimizeStudioGeneration(prepared, request, executionSignal, node.beikePromptOptimization as VideoPromptOptimization | undefined, context);
        if ('optimization' in optimized && optimized.optimization) {
          let optimization = optimized.optimization;
          commands.update(node.id, request.taskId, {
            beikePromptOptimizing: false,
            beikePromptReviewPending: true,
            beikePromptRecoveryRequired: false,
            beikePromptOptimization: optimization,
          });
          await saveScene(commands.read());
          const approved = await reviewVideoPrompt(optimization, executionSignal, requestReview, (draft) => {
            optimization = { ...optimization, draft };
            commands.update(node!.id, request.taskId, { beikePromptOptimization: optimization });
          });
          commands.update(node.id, request.taskId, { beikePromptReviewPending: false });
          if (!approved) {
            commands.stop(node.id, request.taskId);
            await saveScene(commands.read());
            return false;
          }
          prepared = { ...optimized, task: { ...optimized.task, prompt: approved.submitted! } };
          commands.update(node.id, request.taskId, { beikePromptOptimization: approved });
        } else {
          prepared = optimized;
          commands.update(node.id, request.taskId, { beikePromptOptimizing: false, beikePromptOptimization: undefined });
        }
      }
      prepared.task = { ...prepared.task, canvasProjectId: projectId, sessionTitle: projectTitle };
      commands.update(node.id, request.taskId, {
        beikeTaskRecord: prepared.task,
        ...(prepared.settings ? { settings: { ...settings, ...prepared.settings } } : {}),
      });
    }
    const pendingScene = commands.read();
    const pendingInput = canvasInputKey ? studioPromptPreparationKey(pendingScene, node.id) : undefined;
    await saveScene(pendingScene);
    signal?.throwIfAborted();
    const live = commands.read().nodes.find(item => item.id === node!.id);
    if (!live?.isGenerating || live.beikeTaskStopped || live.beikeTaskId !== taskId) return false;
    if (pendingInput) assertStudioPromptPreparation(commands.read(), node.id, taskId, pendingInput);
    if (prepared) useAppStore.getState().addGenerationTask(prepared.task, false);
    else await submitStudioDepth(request, projectId, executionSignal);
    return true;
  } catch (error) {
    const current = commands.read().nodes.find((item) => item.id === node!.id) || node;
    if (current.beikeTaskStopped) return false;
    const message = error instanceof Error ? error.message : '生成提交失败';
    const isRejected = Boolean(error && typeof error === 'object' && 'submissionRejected' in error && (error as { submissionRejected?: boolean }).submissionRejected === true);
    commands.update(node.id, taskId, {
      ...studioGenerationFailure((current.settings as Record<string, unknown>) || settings, message),
      ...(node.type === 'gen-speech' && speechPrepared ? { beikeSpeechRecoveryRequired: !isRejected } : {}),
      content: restoreStudioTaskResult(current).content,
    });
    return false;
  }
}

export async function executeStudioTextNodeAnalysis(
  projectId: string,
  nodeId: string,
  commands: StudioTaskCommands,
  saveScene: (scene: StudioScene) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  if (await recoverStudioTextRun(projectId, nodeId, commands, saveScene)) return;
  const scene = commands.read();
  const node = scene.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error('文本节点不存在');
  const settings = (node.settings as Record<string, unknown>) || {};
  const inputs = resolveStudioInputs(scene, nodeId);
  const model = selectStudioModelFor('text-node', settings.textNodeChatModel);
  if (!model) throw new Error('请先在渠道管理中启用文本模型');

  commands.update(nodeId, studioNodeTaskId(node), {
    errorMsg: undefined,
    settings: { ...settings, textNodeIsAnalyzing: true, beikeTextRunError: undefined },
  });

  try {
    const contentParts: Array<Record<string, unknown>> = [{ type: 'text', text: inputs.prompt }];
    for (const ref of inputs.refs) {
      if (ref.type === 'image') contentParts.push({ type: 'image_url', image_url: { url: ref.url } });
      else if (ref.type === 'video') contentParts.push({ type: 'video_url', video_url: { url: ref.url } });
    }
    const payload: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: contentParts }],
      beikeTextContext: {
        nodeId,
        runId: crypto.randomUUID(),
        previousOperationId: typeof node.beikeTextOperationId === 'string' ? node.beikeTextOperationId : undefined,
        recoveryOnly: node.beikeTextRecoveryRequired === true,
      },
      beikeStoryboardAnalysis: Boolean(settings.beikeTextResultRequired),
    };
    const response = await studioTextRequest(projectId, payload, signal, commands, saveScene);
    const data = await response.json();
    const choices = data.choices as Array<{ message?: { content?: unknown } }> | undefined;
    const resultText = typeof data.text === 'string' ? data.text : String(choices?.[0]?.message?.content || '');
    if (!resultText.trim()) throw new Error('文本模型返回内容为空');
    const latest = commands.read().nodes.find((n) => n.id === nodeId);
    const latestSettings = (latest?.settings as Record<string, unknown>) || settings;
    commands.update(nodeId, latest ? studioNodeTaskId(latest) : undefined, {
      content: resultText,
      beikeTextRecoveryRequired: false,
      isGenerating: false,
      errorMsg: undefined,
      settings: {
        ...latestSettings,
        text: resultText,
        textNodeDisplayText: resultText,
        aiGenerated: true,
        _chatCompletedAt: Date.now(),
        textNodeIsAnalyzing: false,
        isGenerating: false,
        beikeTextRunError: undefined,
      },
    });
    await saveScene(commands.read());
  } catch (error) {
    const message = error instanceof Error ? error.message : '文本分析失败';
    const latest = commands.read().nodes.find((n) => n.id === nodeId);
    const latestSettings = (latest?.settings as Record<string, unknown>) || settings;
    commands.update(nodeId, latest ? studioNodeTaskId(latest) : undefined, {
      errorMsg: message,
      isGenerating: false,
      settings: { ...latestSettings, isGenerating: false, textNodeIsAnalyzing: false, beikeTextRunError: message },
    });
    throw error;
  }
}
