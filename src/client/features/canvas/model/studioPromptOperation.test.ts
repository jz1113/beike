import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { optimizeVideoPrompt, recoverVideoPromptOptimization, type VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import { apiFetch } from '@client/shared/api/apiClient';
import { videoPromptProfiles, videoPromptSkill } from '@shared/domain/assistant/skills/videoPromptSkills';
import { listApprovedModels } from '@shared/domain/models/modelCatalog';
import { cloneCanvasProject } from './creativeWorkflowProjects';
import {
  compilerSettings,
  saveStudioCompilerApproval,
  saveStudioCompilerDraft,
  studioCompilerKey,
  studioVideoPromptPreview,
  studioVideoSettings,
} from './studioCompilerState';
import { resolveStudioInputs } from './studioConnections';
import { studioChannels, type prepareStudioGeneration, type StudioRequest } from './studioGeneration';
import {
  approveVideoPrompt,
  assertStudioPromptPreparation,
  optimizeStudioGeneration,
  recoverStudioCompilerOperation,
  recoverStudioPromptOperationNode,
  reusableVideoPromptDraft,
  reviewVideoPrompt,
  runStudioCompiler,
  studioPromptBadge,
  studioPromptContext,
  studioPromptPreparationKey,
  studioPromptSkill,
  videoPromptReviewKey,
} from './studioPromptOperation';
import type { StudioTaskCommands } from './studioTaskState';
import type { StudioScene } from './types';
import { buildVideoWorkflowProject as createVideoWorkflowProject } from './videoWorkflowProjects';

const actualOptimizer = vi.hoisted(() => ({
  optimizeVideoPrompt: undefined as unknown as typeof optimizeVideoPrompt,
  recoverVideoPromptOptimization: undefined as unknown as typeof recoverVideoPromptOptimization,
}));

vi.mock('@client/shared/agent/videoPromptOptimizer', async importOriginal => {
  const actual = await importOriginal<typeof import('@client/shared/agent/videoPromptOptimizer')>();
  actualOptimizer.optimizeVideoPrompt = actual.optimizeVideoPrompt;
  actualOptimizer.recoverVideoPromptOptimization = actual.recoverVideoPromptOptimization;
  return {
    ...actual,
    recoverVideoPromptOptimization: vi.fn(actual.recoverVideoPromptOptimization),
    optimizeVideoPrompt: vi.fn(actual.optimizeVideoPrompt),
  };
});
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getMultimodalClientOverrides: () => ({}), getGatewayClientBaseUrl: () => undefined }));
vi.mock('@client/shared/utils/modelUsage', async importOriginal => ({ ...await importOriginal<typeof import('@client/shared/utils/modelUsage')>(), recordChatTokens: vi.fn() }));
vi.mock('@client/store', () => ({ useAppStore: { getState: () => ({ assistantModel: 'text-route' }) } }));
vi.mock('@shared/domain/models/modalityStorage', () => ({ modalityPickerSelections: () => [{ id: 'text-route', modelId: 'text' }] }));
vi.mock('./studioGeneration', async importOriginal => ({
  ...await importOriginal<typeof import('./studioGeneration')>(),
  studioChannels: vi.fn(() => [{ id: 'route', kind: 'video', modelId: 'doubao-seedance-2.5' }]),
}));
vi.mock('react-dom', () => ({ createPortal: (child: unknown) => child }));
vi.mock('@client/shared/hooks/useModalDialog', () => ({ useModalDialog: () => null }));

describe('studioPromptOperation recovery and compiler stage', () => {
  function fixture() {
    const project = createVideoWorkflowProject('depth-copy', 'project', 1);
    let scene = project.studioScene!;
    for (const suffix of ['keyframe', 'product', 'person', 'background']) scene.nodes.find(n => n.id === `project-${suffix}`)!.content = `/storage/${suffix}.png`;
    scene.nodes.find(n => n.id === 'project-analysis')!.settings = { textNodeDisplayText: '【全片一致性】戴圆框眼镜的蓝衣人物，沙发、画框与地毯，正面漫射柔光。【声音模式：静音】【全片一致性结束】\n【视频片段 01｜时长 5 秒】\n开场画面：沙发前居中站立\n本地时间轴：0至5秒抬手\n结束状态：停稳\n【视频片段结束】', beikeTextResultRequired: true };
    const id = 'project-prompt', node = () => scene.nodes.find(n => n.id === id)!;
    node().settings = { ...compilerSettings(node()), model: 'route', duration: '5s' };
    const input = { model: 'doubao-seedance-2.5', mode: 'omni', prompt: resolveStudioInputs(scene, id).prompt, scriptOnly: true, duration: 5, audio: false, images: 4, videos: 0 };
    const key = studioCompilerKey(node(), resolveStudioInputs(scene, id));
    const save = vi.fn(async () => {});
    const commands: StudioTaskCommands = { read: () => scene, run: vi.fn(), stop: vi.fn(), update: (id, _expected, patch) => { const n = scene.nodes.find(n => n.id === id)!; Object.assign(n, { ...patch, settings: { ...compilerSettings(n), ...patch.settings as object } }); } };
    const context = (run = 'original') => ({ ...studioPromptContext('project', id, 'compiler', commands, save, run), inputKey: key });
    return { project, node, id, input, key, save, commands, context, reload: () => { scene = { ...scene, nodes: JSON.parse(JSON.stringify(scene.nodes)).map(recoverStudioPromptOperationNode) }; } };
  }
  const result = () => Response.json({ operationKey: 'original', choices: [{ finish_reason: 'stop', message: { content: '开场画面：趴在木桌上，百叶窗硬光。' } }] });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(optimizeVideoPrompt).mockImplementation(actualOptimizer.optimizeVideoPrompt);
    vi.mocked(recoverVideoPromptOptimization).mockImplementation(actualOptimizer.recoverVideoPromptOptimization);
    vi.mocked(studioChannels).mockReturnValue([{ id: 'route', kind: 'video', modelId: 'doubao-seedance-2.5', name: 'route', route: 'route', metasoH3: false, preferred: false }]);
    const rows = new Map<string, string>();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => rows.set(key, value) });
    const locks = new Map<string, Promise<unknown>>();
    vi.stubGlobal('navigator', { locks: { request: (key: string, _opts: unknown, fn: () => unknown) => { const next = (locks.get(key) || Promise.resolve()).catch(() => {}).then(fn); locks.set(key, next); return next; } } });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('S12 07 refresh resumes the original stage, saves a reviewable draft and never enqueues video', async () => {
    const f = fixture(); vi.mocked(apiFetch).mockImplementationOnce(async () => { expect(f.node().beikePromptOperationId).toBe('original'); expect(f.save).toHaveBeenCalled(); throw Error('lost'); });
    await expect(optimizeVideoPrompt(f.input, new AbortController().signal, f.context())).rejects.toThrow(); f.reload();
    expect(f.node()).toMatchObject({ beikePromptOperationId: 'original', beikePromptRecoveryRequired: true, isGenerating: false });
    vi.mocked(apiFetch).mockResolvedValueOnce(result());
    const recovered = await recoverStudioCompilerOperation(f.context('after-refresh'), f.commands, f.save, new AbortController().signal);
    expect(recovered?.value).toMatchObject({ compiler: true, optimized: expect.stringContaining('正面漫射柔光'), warning: expect.stringContaining('恢复完整原稿'), original: f.input.prompt });
    expect(f.node()).toMatchObject({ beikePromptRecoveryRequired: false, beikePromptOptimization: { draft: expect.stringContaining('沙发前居中站立') } });
    expect(compilerSettings(f.node()).beikeCompilerApproved).toBeUndefined(); expect(f.commands.run).not.toHaveBeenCalled();
    expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST', 'GET']);
  });
  it('S12 a recovered old draft cannot be relabelled after configuration/input changes', async () => {
    const f = fixture(); vi.mocked(apiFetch).mockRejectedValueOnce(Error('lost')); await expect(optimizeVideoPrompt(f.input, new AbortController().signal, f.context())).rejects.toThrow();
    f.node().settings = { ...compilerSettings(f.node()), duration: '10s' }; vi.mocked(apiFetch).mockResolvedValueOnce(result());
    await expect(recoverStudioCompilerOperation(f.context('changed'), f.commands, f.save, new AbortController().signal)).rejects.toThrow('原稿已保留');
    expect(f.node().beikePromptOptimization).toBeUndefined(); expect(f.node().beikePromptRecoveryRequired).toBe(false);
    expect(vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('S12 an unusable current model/upstream does not prevent querying the original stage', async () => {
    const f = fixture(); vi.mocked(apiFetch).mockRejectedValueOnce(Error('lost')); await expect(optimizeVideoPrompt(f.input, new AbortController().signal, f.context())).rejects.toThrow();
    f.node().settings = { ...compilerSettings(f.node()), model: 'removed-route' }; f.commands.read().connections = []; vi.mocked(apiFetch).mockResolvedValueOnce(result());
    await expect(recoverStudioCompilerOperation(f.context('removed'), f.commands, f.save, new AbortController().signal)).rejects.toThrow('原稿已保留');
    expect(vi.mocked(apiFetch).mock.calls.at(-1)?.[0]).toBe('/api/generate/canvas-text?operationKey=original');
  });
  it('S12 a failed recovered-draft save reopens the completed stage without another model call', async () => {
    const f = fixture(); vi.mocked(apiFetch).mockResolvedValueOnce(result()); const value = await optimizeVideoPrompt(f.input, new AbortController().signal, f.context());
    f.save.mockRejectedValueOnce(Error('scene full'));
    await expect(saveStudioCompilerDraft(f.commands, f.id, { value: value!, key: f.key, input: f.input }, '完整优化原稿', f.save)).rejects.toThrow('scene full');
    expect(f.node().beikePromptRecoveryRequired).toBe(true);
    const recovered = await recoverStudioCompilerOperation(f.context('reopened'), f.commands, f.save, new AbortController().signal);
    expect(recovered?.value.optimized).toBe(value!.optimized); expect(apiFetch).toHaveBeenCalledOnce();
  });
  it('S12 legacy interrupted optimization with no operation identity blocks generation after refresh', async () => {
    const f = fixture(); Object.assign(f.node(), { beikePromptOptimizing: true, isGenerating: true }); f.reload();
    await expect(recoverStudioCompilerOperation(f.context('legacy'), f.commands, f.save, new AbortController().signal)).rejects.toMatchObject({ recoveryRequired: true }); expect(apiFetch).not.toHaveBeenCalled();
  });
  it('S12 copied projects and nodes do not inherit another optimization stage', () => {
    const f = fixture(); Object.assign(f.node(), { beikePromptOperationId: 'source', beikePromptRecoveryRequired: true, beikePromptOptimizing: true });
    f.project.studioScene = f.commands.read();
    expect(cloneCanvasProject(f.project, 'copy').studioScene!.nodes.find(n => n.id === f.id)).toMatchObject({ beikePromptOperationId: undefined, beikePromptRecoveryRequired: undefined, beikePromptOptimizing: false });
  });
  it('S12 pre-video recovery restores the original draft before any current model/reference preparation', async () => {
    const f = fixture(), nodeId = 'project-video', node = () => f.commands.read().nodes.find(n => n.id === nodeId)!;
    const { recoverStudioVideoPromptOperation } = await import('./studioPromptOperation');
    const context = { ...studioPromptContext('project', nodeId, 'video', f.commands, f.save, 'original'), inputKey: 'original-video-binding' };
    vi.mocked(apiFetch).mockRejectedValueOnce(Error('lost'));
    await expect(optimizeVideoPrompt(f.input, new AbortController().signal, context)).rejects.toThrow();
    node().settings = { model: 'removed-route' }; f.commands.read().connections = []; vi.mocked(apiFetch).mockResolvedValueOnce(result());
    expect(await recoverStudioVideoPromptOperation('project', nodeId, f.commands, f.save)).toBe(true);
    expect(node()).toMatchObject({ beikePromptRecoveryRequired: false, beikePromptOptimization: { inputKey: 'original-video-binding', original: f.input.prompt } });
    expect(f.commands.run).not.toHaveBeenCalled(); expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST', 'GET']);
  });
  it('07 submission queries an existing receipt even when the selected models disappear', async () => {
    const f = fixture(); vi.mocked(apiFetch).mockRejectedValueOnce(Error('lost'));
    await expect(optimizeVideoPrompt(f.input, new AbortController().signal, f.context())).rejects.toThrow();
    vi.mocked(studioChannels).mockReturnValue([]);
    vi.mocked(apiFetch).mockResolvedValueOnce(result());
    const preview = await runStudioCompiler({ projectId: 'project', nodeId: f.id, commands: f.commands, onSave: f.save, signal: new AbortController().signal });
    expect(preview.value.optimized).toContain('正面漫射柔光');
    expect(preview.value.optimized).not.toContain('木桌');
    expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST', 'GET']);
  });
  it('07 submission uses inline video parameters and opens review without authorizing video', async () => {
    const f = fixture();
    vi.mocked(studioChannels).mockReturnValue([
      { id: 'route', kind: 'video', modelId: 'doubao-seedance-2.5', name: '已选视频线路', route: 'video-route', metasoH3: false, preferred: false },
      { id: 'chat-current', kind: 'chat', modelId: 'claude', name: '本次选择的优化模型', route: 'text-route', preferred: false },
    ]);
    const submit = () => runStudioCompiler({ projectId: 'project', nodeId: f.id, textModel: 'chat-current', commands: f.commands, onSave: f.save, signal: new AbortController().signal });
    f.node().settings = { ...compilerSettings(f.node()), duration: '10', beikeCompilerDurationEdited: true, resolution: '720P', beikeVideoAudio: false };
    await expect(submit()).rejects.toThrow('时长必须');
    expect(apiFetch).not.toHaveBeenCalled();
    f.node().settings = { ...compilerSettings(f.node()), duration: '5' };
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: 'stop', message: { content: '完整优化稿' } }] }));
    const preview = await submit();
    expect(preview.input).toMatchObject({ duration: 5, resolution: '720P', audio: false, model: 'doubao-seedance-2.5' });
    expect(preview.value).toMatchObject({ optimized: expect.stringContaining('沙发前居中站立'), textModel: 'text-route' });
    expect(() => resolveStudioInputs(f.commands.read(), 'project-video')).toThrow('尚未确认');
    const scene = f.commands.read(), video = scene.nodes.find(n => n.id === 'project-video')!;
    video.settings = { ...compilerSettings(video), model: 'old-route', resolution: '480P', duration: '15s', beikeVideoAudio: true };
    expect(studioVideoSettings(video, scene)?.confirmedAudio).toBeUndefined();
    await saveStudioCompilerApproval({ commands: f.commands, nodeId: f.id, key: preview.key, input: preview.input, optimization: preview.value, edited: preview.value.optimized, save: f.save });
    expect(studioVideoPromptPreview(scene, video.id)).toMatchObject({ ready: true, prompt: expect.stringContaining('正面漫射柔光') });
    expect(studioVideoSettings(video, scene)).toMatchObject({ inheritedFrom: f.id, selectedResolution: '720P', selectedDuration: '5s', confirmedAudio: false });
    expect(resolveStudioInputs(scene, video.id)).toMatchObject({ duration: 5, audio: false });
    expect(f.commands.run).not.toHaveBeenCalled();
  });

  it('blocks the wood table script before any optimization request, naming the draft or connected node', async () => {
    const f = fixture(), old = '开场画面：趴在木桌上，百叶窗硬光。\n0–1秒：看窗户。\n1–5秒：蹲姿收尾。';
    vi.mocked(studioChannels).mockReturnValue([
      { id: 'route', kind: 'video', modelId: 'doubao-seedance-2.5', name: '视频线路', route: 'video-route', metasoH3: false, preferred: false },
      { id: 'chat-current', kind: 'chat', modelId: 'claude', name: '优化模型', route: 'text-route', preferred: false },
    ]);
    const run = () => runStudioCompiler({ projectId: 'project', nodeId: f.id, textModel: 'chat-current', commands: f.commands, onSave: f.save, signal: new AbortController().signal });
    f.node().settings = { ...compilerSettings(f.node()), textNodeDraftPrompt: old };
    await expect(run()).rejects.toThrow(/07草稿.*第二套/);
    f.node().settings = { ...compilerSettings(f.node()), textNodeDraftPrompt: '' };
    const scene = f.commands.read();
    scene.nodes.push({ ...scene.nodes.find(n => n.id === 'project-analysis')!, id: 'old-script', nodeName: '旧木桌脚本', settings: { text: old } });
    scene.connections.push({ id: 'old-edge', from: 'old-script', to: f.id });
    await expect(run()).rejects.toThrow(/旧木桌脚本.*第二套/);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('Studio optimization before durable submission', () => {
  const context = { projectId: 'project', nodeId: 'node', stage: 'video' as const, runId: 'run' };
  const request: StudioRequest = { taskId: 'task', model: 'beike:video:channel', prompt: '原文', duration: 7, refs: ['https://example.test/i.png', { type: 'video', url: 'https://example.test/v.mp4' }] };
  const prepared: NonNullable<ReturnType<typeof prepareStudioGeneration>> = { task: { id: 'task', title: '原任务', prompt: '固定输入原文', model: 'channel', size: '16:9', quality: '720p', status: 'IN_PROGRESS', useReferenceImage: true, progress: '0%', mediaType: 'video', videoDuration: 5, videoRefMode: 'omni', referenceVideoUrls: ['https://example.test/v.mp4'] }, settings: { duration: '5s', ratio: '16:9', resolution: '720P', beikeResolvedVideoMode: 'omni' } };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(studioChannels).mockReturnValue([
      { id: 'beike:video:channel', kind: 'video', modelId: 'wan3.0-video', name: 'wan', route: 'channel', metasoH3: false, preferred: false },
      { id: 'beike:image:channel', kind: 'image', modelId: 'gpt-image-2', name: 'gpt', route: 'channel', metasoH3: false, preferred: false },
      { id: 'beike:video:h3', kind: 'video', modelId: 'minimax-h3', name: 'h3', route: 'h3', metasoH3: false, preferred: false },
      { id: 'beike:video:unsupported', kind: 'video', modelId: 'unsupported-new-model', name: 'unsupported', route: 'unsupported', metasoH3: false, preferred: false },
    ]);
    vi.mocked(recoverVideoPromptOptimization).mockResolvedValue(undefined);
    vi.mocked(optimizeVideoPrompt).mockResolvedValue({ original: prepared.task.prompt, optimized: '优化正文', skillId: 'wan3-pe', revision: '0.2.0', sourceUrl: 'https://example.test/official', textModel: 'chat' });
  });

  it('uses normalized parameters and changes only the task prompt while retaining the audit record', async () => {
    const signal = new AbortController().signal;
    const result = await optimizeStudioGeneration(prepared, request, signal, undefined, context);
    expect(optimizeVideoPrompt).toHaveBeenCalledWith(expect.objectContaining({ model: 'wan3.0-video', duration: 5, images: 1, videos: 1, prompt: '固定输入原文' }), signal, expect.objectContaining({ stage: 'video' }));
    expect(result.task).toEqual({ ...prepared.task, prompt: '优化正文' });
    expect(result).toHaveProperty('optimization.original', '固定输入原文');
    expect(request.prompt).toBe('原文'); expect(prepared.task.prompt).toBe('固定输入原文');
  });
  it('leaves disabled video tasks and all image tasks untouched', async () => {
    expect(await optimizeStudioGeneration(prepared, { ...request, optimizePrompt: false }, new AbortController().signal, undefined, context)).toBe(prepared);
    expect(await optimizeStudioGeneration(prepared, { ...request, model: 'beike:image:channel' }, new AbortController().signal, undefined, context)).toBe(prepared);
    expect(optimizeVideoPrompt).not.toHaveBeenCalled();
  });
  it('does not produce a submittable result when optimization fails', async () => {
    vi.mocked(optimizeVideoPrompt).mockRejectedValue(new Error('优化失败'));
    await expect(optimizeStudioGeneration(prepared, request, new AbortController().signal, undefined, context)).rejects.toThrow('优化失败');
    expect(prepared.task.prompt).toBe('固定输入原文');
  });
  it('reopens a matching unconfirmed edited draft without another text call', async () => {
    const first = await optimizeStudioGeneration(prepared, request, new AbortController().signal, undefined, context);
    if (!('optimization' in first)) throw new Error('Missing optimization');
    const cached = { ...first.optimization, draft: '已修改但尚未确认的草稿' };
    vi.mocked(optimizeVideoPrompt).mockClear();
    const next = await optimizeStudioGeneration(prepared, request, new AbortController().signal, cached, context);
    expect(optimizeVideoPrompt).not.toHaveBeenCalled();
    expect(next).toHaveProperty('optimization.draft', '已修改但尚未确认的草稿');
    expect(next).not.toHaveProperty('optimization.submitted');
  });
  it('does not reuse a draft after references change or after it was already approved', async () => {
    const first = await optimizeStudioGeneration(prepared, request, new AbortController().signal, undefined, context);
    if (!('optimization' in first)) throw new Error('Missing optimization');
    vi.mocked(optimizeVideoPrompt).mockClear();
    await optimizeStudioGeneration(prepared, { ...request, refs: [] }, new AbortController().signal, first.optimization, context);
    await optimizeStudioGeneration(prepared, request, new AbortController().signal, { ...first.optimization, submitted: '已确认的上次稿' }, context);
    expect(optimizeVideoPrompt).toHaveBeenCalledTimes(2);
  });
  it('reselects the upstream Skill on a model switch and rejects a mismatched Skill in the cache', async () => {
    const first = await optimizeStudioGeneration(prepared, request, new AbortController().signal, undefined, context);
    if (!('optimization' in first)) throw new Error('Missing optimization');
    vi.mocked(optimizeVideoPrompt).mockClear();
    await optimizeStudioGeneration(prepared, { ...request, model: 'beike:video:h3' }, new AbortController().signal, first.optimization, context);
    expect(optimizeVideoPrompt).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'minimax-h3' }), expect.any(AbortSignal), expect.objectContaining({ stage: 'video' }));
    await optimizeStudioGeneration(prepared, request, new AbortController().signal, { ...first.optimization, skillId: 'sd2-pe' }, context);
    expect(optimizeVideoPrompt).toHaveBeenCalledTimes(2);
  });
  it('requires optimization for script-only requests and rejects missing skill results', async () => {
    await expect(optimizeStudioGeneration(prepared, { ...request, scriptOnly: true, optimizePrompt: false }, new AbortController().signal, undefined, context)).rejects.toThrow('先启用');
    expect(optimizeVideoPrompt).not.toHaveBeenCalled();
    vi.mocked(optimizeVideoPrompt).mockResolvedValue(undefined);
    await expect(optimizeStudioGeneration(prepared, { ...request, scriptOnly: true }, new AbortController().signal, undefined, context)).rejects.toThrow('未返回');
  });
  it('blocks script-only requests when the selected model has no optimization skill', async () => {
    await expect(optimizeStudioGeneration(prepared, { ...request, model: 'beike:video:unsupported', scriptOnly: true }, new AbortController().signal, undefined, context)).rejects.toThrow('没有对应');
    expect(optimizeVideoPrompt).not.toHaveBeenCalled();
  });
  it('S12 a stage claimed by another tab between recovery lookup and dispatch cannot be relabelled as current inputs', async () => {
    const onResolved = vi.fn(async () => {});
    vi.mocked(optimizeVideoPrompt).mockResolvedValue({ operationId: 'other-tab-original', inputKey: 'other-input-binding', original: 'other inputs', optimized: 'other result', skillId: 'wan3-pe', revision: '0.2.0', sourceUrl: '', textModel: 'text' });
    await expect(optimizeStudioGeneration(prepared, request, new AbortController().signal, undefined, { ...context, onResolved })).rejects.toThrow('输入已修改');
    expect(onResolved).toHaveBeenCalledOnce(); expect(prepared.task.prompt).toBe('固定输入原文');
  });
});

describe('video model changes across preparation and confirmation', () => {
  const prepChannels = [
    { id: 'wan-route', kind: 'video' as const, route: 'wan-route', modelId: 'wan3.0-video', name: 'wan', metasoH3: false, preferred: false },
    { id: 'h3-route', kind: 'video' as const, route: 'h3-route', modelId: 'minimax-h3', name: 'h3', metasoH3: false, preferred: false },
  ];
  const scene = (): StudioScene => ({ nodes: [{ id: 'video', type: 'gen-video', prompt: '猫奔跑', settings: { model: 'wan-route', ratio: '16:9' }, isGenerating: true, beikeTaskId: 'task' }], connections: [], groups: [], textBoxes: [], strokes: [], view: { x: 0, y: 0, zoom: 1 } });

  beforeEach(() => {
    vi.mocked(studioChannels).mockImplementation(() => prepChannels);
  });

  it('ignores draft metadata and geometry but invalidates model, prompt, parameters and upstream inputs', () => {
    const current = scene(), key = studioPromptPreparationKey(current, 'video');
    current.nodes[0] = { ...current.nodes[0], x: 400, beikePromptOptimization: { draft: '修改稿' } };
    expect(() => assertStudioPromptPreparation(current, 'video', 'task', key)).not.toThrow();
    for (const patch of [{ settings: { model: 'h3-route', ratio: '16:9' } }, { prompt: '新的要求' }, { settings: { model: 'wan-route', ratio: '9:16' } }, { settings: { model: 'wan-route', ratio: '16:9', beikeVideoMode: 'omni' } }]) {
      const changed = scene(); Object.assign(changed.nodes[0], patch);
      expect(() => assertStudioPromptPreparation(changed, 'video', 'task', key)).toThrow('已修改');
    }
    current.nodes.push({ id: 'text', type: 'text-node', content: '新增上游要求' });
    current.connections.push({ id: 'edge', from: 'text', to: 'video' });
    expect(() => assertStudioPromptPreparation(current, 'video', 'task', key)).toThrow('已修改');
  });
  it('blocks a confirmed old-model draft before queue insertion when the model changes during review', async () => {
    const current = scene(), key = studioPromptPreparationKey(current, 'video'), enqueue = vi.fn();
    const approved = await reviewVideoPrompt({ original: '原文', optimized: '万相优化稿', skillId: 'wan3-pe', revision: '0.2.0', sourceUrl: 'https://example.test', textModel: 'chat' }, new AbortController().signal, async () => {
      current.nodes[0].settings = { model: 'h3-route' };
      return '用户确认了旧稿';
    });
    expect(() => { assertStudioPromptPreparation(current, 'video', 'task', key); enqueue(approved); }).toThrow('已修改');
    expect(enqueue).not.toHaveBeenCalled();
  });
  it('invalidates the draft if a route is remapped to another actual model', () => {
    const current = scene(), key = studioPromptPreparationKey(current, 'video'), previous = prepChannels[0].modelId;
    try { prepChannels[0].modelId = 'doubao-seedance-2.5-pro'; expect(() => assertStudioPromptPreparation(current, 'video', 'task', key)).toThrow('已修改'); }
    finally { prepChannels[0].modelId = previous; }
  });
  it('only reuses an unconfirmed draft from the same model, route, mode, Skill and version', () => {
    const input = { model: 'wan3.0-video', mode: 'text', prompt: '猫奔跑', images: 0, videos: 0 };
    const draft = { original: input.prompt, optimized: '优化稿', skillId: 'wan3-pe', revision: '0.2.0', sourceUrl: 'https://example.test', textModel: 'chat', inputKey: videoPromptReviewKey(input, [], 'wan-route') };
    expect(reusableVideoPromptDraft(draft, input, [], 'wan-route')).toBe(draft);
    for (const patch of [{ skillId: 'sd2-pe' }, { revision: 'old' }, { submitted: '已确认' }, { inputKey: 'invalid' }]) expect(reusableVideoPromptDraft({ ...draft, ...patch }, input, [], 'wan-route')).toBeUndefined();
    expect(reusableVideoPromptDraft(draft, { ...input, model: 'minimax-h3' }, [], 'wan-route')).toBeUndefined();
    expect(reusableVideoPromptDraft(draft, { ...input, mode: 'omni' }, [], 'wan-route')).toBeUndefined();
    expect(reusableVideoPromptDraft(draft, input, [], 'other-route')).toBeUndefined();
  });
});

describe('video node Skill badges', () => {
  const node = { id: 'video', type: 'gen-video', settings: { model: 'video-route' } };
  beforeEach(() => {
    vi.mocked(studioChannels).mockReturnValue([
      { id: 'video-route', kind: 'video', modelId: 'wan3.0-video', name: 'wan', route: 'video-route', metasoH3: false, preferred: false },
      { id: 'seedance-route', kind: 'video', modelId: 'doubao-seedance-2.0', name: 'seedance', route: 'seedance-route', metasoH3: false, preferred: false },
      { id: 'h3-route', kind: 'video', modelId: 'minimax-h3', name: 'h3', route: 'h3-route', metasoH3: false, preferred: false },
      { id: 'unsupported-route', kind: 'video', modelId: 'kling-v3', name: 'kling', route: 'unsupported-route', metasoH3: false, preferred: false },
    ]);
  });

  it('distinguishes the planned, pending and approved Skill', () => {
    expect(studioPromptSkill(node)?.modelIcon).toBe('wan3.0-video');
    expect(studioPromptBadge(node)).toBe('待用 · Wan 3.0 官方提示词整理');
    const optimized = { ...node, beikePromptOptimization: { skillId: 'wan3-pe', revision: '0.2.0', optimized: '优化稿', inputKey: videoPromptReviewKey({ model: 'wan3.0-video', mode: 'text', prompt: '原文', images: 0, videos: 0 }, [], 'video-route') } };
    expect(studioPromptBadge({ ...optimized, beikePromptReviewPending: true })).toBe('待确认 · Wan 3.0 官方提示词整理');
    expect(studioPromptBadge({ ...optimized, beikePromptOptimization: { ...optimized.beikePromptOptimization, submitted: '确认稿' } })).toBe('已用 · Wan 3.0 官方提示词整理');
  });
  it('does not present another route or mode as an already optimized current selection', () => {
    const optimization = { skillId: 'wan3-pe', revision: '0.2.0', optimized: '稿', inputKey: videoPromptReviewKey({ model: 'wan3.0-video', mode: 'omni', prompt: '原文', images: 0, videos: 1 }, [], 'video-route') };
    expect(studioPromptBadge({ ...node, beikePromptOptimization: optimization })).toBe('待用 · Wan 3.0 官方提示词整理');
  });
  it('does not label local operations or images as model prompt optimization', () => {
    expect(studioPromptBadge({ ...node, type: 'gen-image' })).toBe('');
    expect(studioPromptBadge({ ...node, settings: { beikeOperation: 'depth-video' } })).toBe('');
    expect(studioPromptBadge({ ...node, settings: { ...node.settings, beikeOptimizePrompt: false } })).toBe('提示词技能：未启用');
  });
  it('follows the selected model even when another model has a saved optimization', () => {
    const old = { skillId: 'sd2-pe', optimized: '旧模型稿', submitted: '上次确认稿' };
    expect(studioPromptSkill({ ...node, beikePromptOptimization: old })?.id).toBe('wan3-pe');
    expect(studioPromptBadge({ ...node, beikePromptOptimization: old })).toBe('待用 · Wan 3.0 官方提示词整理');
    expect(studioPromptSkill({ ...node, settings: { model: 'h3-route' }, beikePromptOptimization: old })?.id).toBe('h3-prompt-writing');
    expect(studioPromptBadge({ ...node, settings: { model: 'unsupported-route' }, beikePromptOptimization: old })).toBe('提示词技能：暂无匹配');
    expect(studioPromptBadge({ ...node, settings: { ...node.settings, beikeOptimizePrompt: false }, beikePromptOptimization: old })).toBe('提示词技能：未启用');
  });
});

const approvalOptimization:VideoPromptOptimization={original:'原文',optimized:'AI 优化稿',skillId:'wan3-pe',revision:'0.2.0',textModel:'chat',sourceUrl:'https://example.test/official'};
describe('video prompt confirmation gate',()=>{
  it('waits for a user decision and queues exactly the edited text',async()=>{
    let decide:(value:string|undefined)=>void=()=>{};
    const review=vi.fn(()=>new Promise<string|undefined>(resolve=>{decide=resolve;}));
    const enqueue=vi.fn();
    const execution=(async()=>{
      const approved=await reviewVideoPrompt(approvalOptimization,new AbortController().signal,review);
      if(approved)enqueue({prompt:approved.submitted,optimization:approved});
    })();
    await Promise.resolve();expect(enqueue).not.toHaveBeenCalled();
    decide('  用户修改后的台词与运镜\n保留换行  ');await execution;
    expect(enqueue).toHaveBeenCalledExactlyOnceWith({prompt:'  用户修改后的台词与运镜\n保留换行  ',optimization:expect.objectContaining({optimized:'AI 优化稿',submitted:'  用户修改后的台词与运镜\n保留换行  '})});
    expect(approvalOptimization).not.toHaveProperty('submitted');
  });
  it('does not approve on cancellation or closing the preview',async()=>{
    expect(await reviewVideoPrompt(approvalOptimization,new AbortController().signal,async()=>undefined)).toBeUndefined();
  });
  it('rejects a late confirmation after the node was stopped or the project closed',async()=>{
    const controller=new AbortController();
    await expect(reviewVideoPrompt(approvalOptimization,controller.signal,async()=>{controller.abort();return '迟到确认';})).rejects.toThrow();
  });
  it.each(['','   ','x'.repeat(20001)])('rejects invalid drafts',prompt=>{
    expect(()=>approveVideoPrompt(approvalOptimization,prompt)).toThrow('请填写');
  });
});

const flowModels=[...new Set(['wan3.0-video','minimax-h3','doubao-seedance-2.0','doubao-seedance-2.5-pro',...listApprovedModels('video').map(model=>model.id)])];
const makePrepared=(model:string):NonNullable<ReturnType<typeof prepareStudioGeneration>>=>({task:{id:'task',model,title:'视频',prompt:'猫奔跑',size:'16:9',quality:'720p',mediaType:'video',status:'IN_PROGRESS',progress:'0%',referenceVideoUrls:[],useReferenceImage:false,videoRefMode:'text',videoDuration:5},settings:undefined});
const flowContext=()=>({projectId:'project',nodeId:crypto.randomUUID(),stage:'video' as const,runId:crypto.randomUUID()});
const flowRequest=(model:string):StudioRequest=>({taskId:'task',model,prompt:'猫奔跑',refs:[]});

describe('model selection → verified Skill → editable review → exact video task',()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    vi.mocked(optimizeVideoPrompt).mockImplementation(actualOptimizer.optimizeVideoPrompt);
    vi.mocked(recoverVideoPromptOptimization).mockImplementation(actualOptimizer.recoverVideoPromptOptimization);
    const rows=new Map<string,string>();
    vi.stubGlobal('window',{});
    vi.stubGlobal('localStorage',{getItem:(k:string)=>rows.get(k)??null,setItem:(k:string,v:string)=>rows.set(k,v)});
    vi.stubGlobal('navigator',{locks:{request:async(_k:string,_o:unknown,fn:()=>unknown)=>fn()}});
    vi.mocked(studioChannels).mockReturnValue(
      [...listApprovedModels('video').map(model=>model.id),'wan3.0-video','minimax-h3','doubao-seedance-2.0','doubao-seedance-2.5-pro','kling-video-v4'].map(model=>({id:model,modelId:model,kind:'video' as const,route:model,name:model,metasoH3:false,preferred:false}))
    );
    vi.mocked(apiFetch).mockImplementation(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'对应模型的 AI 优化稿'}}]}));
  });
  afterEach(()=>vi.unstubAllGlobals());

  it.each(flowModels)('%s uses its own complete Skill and queues only the edited confirmation',async model=>{
    const enqueue=vi.fn(),signal=new AbortController().signal,expected=videoPromptSkill(model)!;
    const prepared=await optimizeStudioGeneration(makePrepared(model),flowRequest(model),signal,undefined,flowContext());
    if(!('optimization' in prepared))throw new Error('Missing optimization');
    const body=JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
    expect(body.messages[0].content).toContain(`上游技能：${expected.name}`);
    const sections=videoPromptProfiles[model.toLowerCase()]?.sections;
    if(sections)for(const section of sections)expect(body.messages[0].content).toContain(section);
    else expect(body.messages[0].content).toContain(expected.prompt);
    expect(prepared.optimization.skillId).toBe(expected.id);
    const approved=await reviewVideoPrompt(prepared.optimization,signal,async()=>{
      expect(enqueue).not.toHaveBeenCalled();
      return '  用户修改的对白与运镜\n保持原话  ';
    });
    if(approved)enqueue({...prepared.task,prompt:approved.submitted});
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({model,prompt:'  用户修改的对白与运镜\n保持原话  '}));
  });
  it('replaces an old-model draft with the newly selected model Skill',async()=>{
    const signal=new AbortController().signal;
    const old=await optimizeStudioGeneration(makePrepared(flowModels[0]),flowRequest(flowModels[0]),signal,undefined,flowContext());
    if(!('optimization' in old))throw new Error('Missing optimization');
    vi.mocked(apiFetch).mockClear();
    const next=await optimizeStudioGeneration(makePrepared(flowModels[1]),flowRequest(flowModels[1]),signal,{...old.optimization,draft:'万相的旧稿'},flowContext());
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(next).toHaveProperty('optimization.skillId','h3-prompt-writing');
    expect(next).not.toHaveProperty('optimization.draft');
  });
  it('cancelling the review never creates a video task',async()=>{
    const signal=new AbortController().signal,enqueue=vi.fn();
    const prepared=await optimizeStudioGeneration(makePrepared(flowModels[0]),flowRequest(flowModels[0]),signal,undefined,flowContext());
    if(!('optimization' in prepared))throw new Error('Missing optimization');
    const approved=await reviewVideoPrompt(prepared.optimization,signal,async()=>undefined);
    if(approved)enqueue(prepared.task);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it('does not share a draft between model families even when they use the same upstream Skill package',async()=>{
    const signal=new AbortController().signal,oldModel='sora-2',nextModel='kling-video-v2-5-turbo';
    const old=await optimizeStudioGeneration(makePrepared(oldModel),flowRequest(oldModel),signal,undefined,flowContext());
    if(!('optimization' in old))throw new Error('Missing optimization');
    vi.mocked(apiFetch).mockClear();
    const next=await optimizeStudioGeneration(makePrepared(nextModel),flowRequest(nextModel),signal,{...old.optimization,draft:'Sora 的未确认稿'},flowContext());
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(next).toHaveProperty('optimization.skillId',old.optimization.skillId);
    expect(next).toHaveProperty('optimization.videoModel',nextModel);
    expect(next).not.toHaveProperty('optimization.draft');
  });
  it('does not use the old Skill for an unsupported newly selected model',async()=>{
    const signal=new AbortController().signal;
    const old=await optimizeStudioGeneration(makePrepared(flowModels[0]),flowRequest(flowModels[0]),signal,undefined,flowContext());
    if(!('optimization' in old))throw new Error('Missing optimization');
    vi.mocked(apiFetch).mockClear();
    const next=await optimizeStudioGeneration(makePrepared('kling-video-v4'),flowRequest('kling-video-v4'),signal,old.optimization,flowContext());
    expect(apiFetch).not.toHaveBeenCalled();
    expect(next).not.toHaveProperty('optimization');
    expect(next.task.prompt).toBe('猫奔跑');
  });
});
