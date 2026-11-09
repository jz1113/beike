import { useEffect, useRef, useState } from 'react';
import { Film, Orbit, Sparkles } from 'lucide-react';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { requestCanvasText } from '../../model/canvasTextRequest';
import { extractVideoFrame } from '../../model/canvasVideoFrame';
import { saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import { CanvasModelPicker } from '../tools/CanvasGridSplit';
import { imageData, specializedButton, specializedField, specializedSurface, type PriorityNodeProps } from './CanvasProviderNode';
import { buildQuickCanvasNode, loadCanvasChatModels, resolveCanvasChatModel } from '../../model/canvasNodeFactory';
import type { CanvasSpecializedSettings } from '../../model/types';
import { CanvasDirector3DModal, type DirectorObject3D } from './CanvasDirector3DModal';
import { CanvasScriptParseNode, formatScriptConstraintsPrompt } from './CanvasScriptParseNode';

type Object3D = DirectorObject3D;
const palette = ['#d2987a', '#789ca3', '#d3b16c', '#8d90bb'];
const models = () => loadCanvasChatModels();

function sceneObjects(text: string): Object3D[] {
  const json = JSON.parse(text.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi, '')) as { objects?: unknown[] };
  if (!Array.isArray(json.objects) || json.objects.length === 0 || json.objects.length > 24) {
    throw new Error('模型需要返回 1–24 个场景对象');
  }
  return json.objects.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error('场景对象格式无效');
    const item = value as Record<string, unknown>;
    const [x, z, width, height, depth] = ['x', 'z', 'width', 'height', 'depth'].map((key) => item[key]);
    if (![x, z, width, height, depth].every((number) => typeof number === 'number' && Number.isFinite(number))) {
      throw new Error('场景坐标和尺寸必须是数字');
    }
    const size = (number: unknown) => Math.min(12, Math.max(0.15, Number(number)));
    const position = (number: unknown) => Math.min(12, Math.max(-12, Number(number)));
    return {
      label: String(item.label || '物体').slice(0, 60),
      x: position(x),
      z: position(z),
      width: size(width),
      height: size(height),
      depth: size(depth),
      color: typeof item.color === 'string' && /^#[\da-f]{6}$/i.test(item.color) ? item.color : palette[index % palette.length],
    };
  });
}

function scriptResult(text: string) {
  const json = JSON.parse(text.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi, '')) as Record<string, unknown>;
  if (!Array.isArray(json.rows) || !json.rows.length || json.rows.length > 40) throw new Error('脚本必须包含 1–40 个镜头');
  const field = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 2400) : '');
  const rows = json.rows.map((item) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const result = { scene: field(row.scene), imagePrompt: field(row.imagePrompt), videoPrompt: field(row.videoPrompt) };
    if (Object.values(result).some((value) => !value)) throw new Error('镜头缺少画面或双轨提示词');
    return result;
  });
  const assets = json.assets && typeof json.assets === 'object' ? (json.assets as Record<string, unknown>) : {};
  const list = (value: unknown) =>
    Array.isArray(value)
      ? [
          ...new Set(
            value
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim().slice(0, 120))
              .filter(Boolean),
          ),
        ].slice(0, 40)
      : [];
  return { rows, assets: { characters: list(assets.characters), scenes: list(assets.scenes), props: list(assets.props) } };
}

export function CanvasAnalysisNode({ node, sources, projectId, selected, onChange }: PriorityNodeProps) {
  const director = node.studioSubType === 'director-3d';
  const script = node.studioSubType === 'script-parse';
  const smart = node.specialized?.smartBuild === true;
  const Icon = director ? (smart ? Sparkles : Orbit) : Film;
  const [available, setAvailable] = useState(models);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const latest = useRef(node);
  latest.current = node;

  const matchedModel = resolveCanvasChatModel(available, node.textModel, sources.find((s) => s.textModel)?.textModel);
  const model = matchedModel?.id || node.textModel || available[0]?.id || '';
  const upstreamModel = matchedModel?.modelId || model;
  const video = sources.find((source) => source.videoUrl && !source.missingMedia)?.videoUrl;
  const image = sources.find((source) => source.imageUrl && !source.missingMedia)?.imageUrl;
  const linkedText = sources
    .filter((source) => source.type === 'prompt' || source.type === 'note')
    .map((source) => source.content)
    .filter(Boolean)
    .join('\n');
  const rows = node.specialized?.scriptRows ?? [];
  const scriptText = [linkedText, node.textPrompt].filter(Boolean).join('\n\n').trim();

  const exportStoryboard = () => {
    const output = buildQuickCanvasNode('storyboard-node', { x: node.x + node.width + 364, y: node.y + 250 }, { referenceNodeIds: [node.id] });
    useCanvasStore.getState().addNode(projectId, {
      ...output,
      storyboardShots: rows.map((row, index) => ({
        id: crypto.randomUUID(),
        shotNumber: String(index + 1),
        cameraAngle: '',
        movement: row.videoPrompt,
        description: row.scene + '\n' + row.imagePrompt,
      })),
    });
  };

  const locked = Boolean(node.layerLocked || busy);
  const updateScene = (patch: Partial<CanvasSpecializedSettings>) =>
    onChange({ specialized: { ...latest.current.specialized, ...patch } });

  useEffect(() => {
    const refresh = () => setAvailable(models());
    window.addEventListener('models_updated', refresh);
    window.addEventListener('modality_models_updated', refresh);
    return () => {
      window.removeEventListener('models_updated', refresh);
      window.removeEventListener('modality_models_updated', refresh);
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!director) return;
    const handleOpenDirector = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId === node.id) {
        setWorkbenchOpen(true);
      }
    };
    window.addEventListener('canvas:open-director-3d', handleOpenDirector);
    return () => window.removeEventListener('canvas:open-director-3d', handleOpenDirector);
  }, [director, node.id]);

  const generate = async (options?: { shotCount?: number; customReq?: string }) => {
    if (locked || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const signal = controller.signal;
    setBusy(true);
    setError('');
    try {
      let parts: Array<Record<string, unknown>> = [];
      if (!node.textRecoveryRequired) {
        if (director) {
          parts = [
            {
              type: 'text',
              text:
                '你是3D场景搭建师。使用米、Y轴向上，输出可编辑的矩形预演布景。只返回 JSON：{"objects":[{"label":"物体名称","x":0,"z":0,"width":2,"height":1,"depth":1,"color":"#aabbcc"}]}。对象放在地面上，最多24个。\n' +
                (node.textPrompt || linkedText || '按照参考图布置场景'),
            },
          ];
          if (image) parts.push({ type: 'image_url', image_url: { url: await imageData(image, signal) } });
        } else if (script) {
          const constraintPrompt = formatScriptConstraintsPrompt(node.specialized?.scriptConstraints, options?.shotCount);
          const effectiveScript = [scriptText, options?.customReq?.trim() ? `拆镜补充要求：${options.customReq.trim()}` : '']
            .filter(Boolean)
            .join('\n\n')
            .trim();
          parts = [
            {
              type: 'text',
              text:
                '把剧本按时间顺序拆成镜头。提取角色、场景、道具；每个镜头包含场景说明、静帧提示词和视频运镜提示词。只返回 JSON：{"assets":{"characters":[],"scenes":[],"props":[]},"rows":[{"scene":"","imagePrompt":"","videoPrompt":""}]}。不得虚构剧本中的人物或道具。\n\n剧本：\n' +
                effectiveScript.slice(0, 18000) +
                (constraintPrompt ? '\n约束：\n' + constraintPrompt : ''),
            },
          ];
        } else if (video) {
          const first = await extractVideoFrame(video, 0, 720);
          if (first.duration > 60) throw new Error('视频拆解支持 60 秒以内的素材，请先在时间线上裁切');
          parts = [
            {
              type: 'text',
              text: `根据按时间排序的原片抽帧拆解视频（时长 ${first.duration.toFixed(2)} 秒）。逐镜输出时间段、景别、机位、运镜、人物动作、光线与场景；注明抽帧无法判断的内容。\n${node.textPrompt || ''}`,
            },
          ];
          for (let index = 0; index < 8; index += 1) {
            signal.throwIfAborted();
            const seconds = (first.duration * index) / 8;
            const frame = index ? await extractVideoFrame(video, seconds, 720) : first;
            parts.push({ type: 'text', text: `原片 ${seconds.toFixed(2)} 秒` }, { type: 'image_url', image_url: { url: frame.dataUrl } });
          }
        }
      }
      signal.throwIfAborted();
      const overrides = getMultimodalClientOverrides(model);
      const usesResponses = model.startsWith('openai-responses:') || overrides.apiFormat === 'openai-responses';
      const activeEffort =
        node.textReasoningEffort && node.textReasoningEffort !== 'auto'
          ? node.textReasoningEffort === 'xhigh' || node.textReasoningEffort === 'max'
            ? 'high'
            : node.textReasoningEffort
          : undefined;
      const data = await requestCanvasText(
        () => ({
          model: upstreamModel,
          messages: [{ role: 'user', content: parts }],
          ...overrides,
          ...(usesResponses ? { apiFormat: 'openai-responses' } : {}),
          ...(activeEffort ? { reasoning_effort: activeEffort } : {}),
        }),
        {
          usageModel: model,
          projectId,
          nodeId: node.id,
          runId: crypto.randomUUID(),
          previousOperationId: node.textOperationId,
          recoveryOnly: node.textRecoveryRequired,
          onOperation: async (id) => {
            onChange({ textOperationId: id, textRecoveryRequired: true });
            await saveCanvasProjects();
          },
        },
        signal,
      );
      const choices = data.choices as Array<{ message?: { content?: unknown } }> | undefined;
      const result = typeof data.text === 'string' ? data.text : String(choices?.[0]?.message?.content || '');
      if (!result.trim()) throw new Error('模型未返回可用内容');
      if (latest.current.layerLocked) throw new Error('节点已锁定，原回执仍可查询');
      if (director) {
        try {
          onChange({ specialized: { ...latest.current.specialized, objects: sceneObjects(result) }, textRecoveryRequired: false });
        } catch {
          onChange({ textRecoveryRequired: false });
          throw new Error('模型未返回有效的场景对象，可以调整要求后重试');
        }
      } else if (script) {
        try {
          const parsed = scriptResult(result);
          const body = parsed.rows
            .map((row, index) => `镜头 ${index + 1} · ${row.scene}\n静帧：${row.imagePrompt}\n视频：${row.videoPrompt}`)
            .join('\n\n');
          onChange({
            content: body,
            specialized: { ...latest.current.specialized, scriptRows: parsed.rows, scriptAssets: parsed.assets },
            textRecoveryRequired: false,
          });
        } catch {
          onChange({ textRecoveryRequired: false });
          throw new Error('模型返回的镜头结构无效，可调整剧本后重试');
        }
      } else onChange({ content: result, textRecoveryRequired: false });
      await saveCanvasProjects();
    } catch (reason) {
      if (reason instanceof Error && 'submissionRejected' in reason) onChange({ textRecoveryRequired: false });
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : '运行失败');
    } finally {
      controllerRef.current = null;
      setBusy(false);
    }
  };

  if (director) {
    const cardHeight = node.height || 260;
    return (
      <div
        role="region" aria-label={node.title || '3D导演台'}
        className="pointer-events-auto relative w-full select-none"
        style={{ height: cardHeight }}
      >
        {/* 顶部小标题：🪐 3D导演台 */}
        <div className="pointer-events-none absolute -top-6 left-0.5 z-20 flex items-center gap-1.5 text-xs text-zinc-400">
          <Icon size={14} className="shrink-0 text-zinc-400" />
          <span className="font-medium text-zinc-300">{node.title || '3D导演台'}</span>
        </div>

        {/* 卡片本体（与参考图 5 一致的深色圆角卡片 + 居中“打开”按钮） */}
        <div
          style={{ height: cardHeight }}
          className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.14] bg-[#1f1f1f] px-4 text-zinc-100 shadow-[0_8px_28px_rgba(0,0,0,0.42)] cursor-grab active:cursor-grabbing"
        >
          <button
            type="button"
            disabled={Boolean(node.layerLocked)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setWorkbenchOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-zinc-500 bg-transparent px-4 py-2 text-xs font-medium text-zinc-100 transition hover:bg-zinc-800/60 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            打开
          </button>

          <div className="mt-2.5 text-center text-[10px] leading-relaxed text-zinc-500">
            {smart ? (
              <>
                一句话搭建 3D 场景
                <br />
                打开后可继续编辑、取景与截图
              </>
            ) : (
              <>
                点击进入全屏 3D 导演台
                <br />
                支持角色摆位与多机位取景
              </>
            )}
          </div>
        </div>

        {workbenchOpen && (
          <CanvasDirector3DModal
            node={node}
            sources={sources}
            projectId={projectId}
            availableModels={available}
            selectedModel={model}
            busy={busy}
            locked={locked}
            error={error}
            initialSmartBuildOpen={smart}
            onClose={() => setWorkbenchOpen(false)}
            onChange={onChange}
            onUpdateScene={updateScene}
            onGenerateSmartScene={() => void generate()}
            onCaptureToCanvas={(dataUrl) => {
              onChange({ imageUrl: dataUrl });
              useCanvasStore.getState().addNode(projectId, {
                type: 'image',
                title: `${node.title || '3D导演台'} 机位截图`,
                imageUrl: dataUrl,
                x: Math.round(node.x + (node.width || 260) + 72),
                y: Math.round(node.y),
                width: 280,
                height: 158,
                resultWidth: 1280,
                resultHeight: 720,
                referenceNodeIds: [node.id],
              });
            }}
          />
        )}
      </div>
    );
  }

  if (script) {
    return (
      <CanvasScriptParseNode
        node={node}
        sources={sources}
        projectId={projectId}
        selected={selected}
        linkedText={linkedText}
        availableModels={available}
        selectedModel={model}
        busy={busy}
        locked={locked}
        error={error}
        onChange={onChange}
        onUpdateScene={updateScene}
        onGenerate={(opts) => void generate(opts)}
        onExportStoryboard={exportStoryboard}
      />
    );
  }

  return (
    <section aria-label={node.title} className={specializedSurface} style={{ height: node.height }}>
      <header className="flex items-center gap-2 text-xs font-semibold">
        <Icon size={15} className="text-[#d2987a]" />
        {node.title}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto" onWheel={(event) => event.stopPropagation()}>
        {video ? (
          <video aria-label="拆解原片" className="max-h-36 rounded-lg" controls preload="metadata" src={proxyMediaUrl(video, { asVideo: true })} />
        ) : (
          <p className="text-xs opacity-65">连接一个视频节点开始</p>
        )}
        {node.content && (
          <div role="status" className="whitespace-pre-wrap rounded-lg bg-black/5 p-2 text-xs dark:bg-white/5">
            {node.content}
          </div>
        )}
        <textarea
          aria-label="拆解要求"
          className={specializedField}
          maxLength={3000}
          value={node.textPrompt || ''}
          disabled={locked}
          onChange={(event) => onChange({ textPrompt: event.target.value })}
        />
        {error && (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <CanvasModelPicker
          label="视觉模型"
          models={available}
          value={model}
          disabled={locked}
          onChange={(value) => onChange({ textModel: value })}
        />
        <button
          type="button"
          className={specializedButton}
          disabled={locked || (!node.textRecoveryRequired && (!model || !video))}
          onClick={() => void generate()}
        >
          {busy ? '处理中…' : node.textRecoveryRequired ? '查询原回执' : '开始拆解'}
        </button>
      </div>
    </section>
  );
}
