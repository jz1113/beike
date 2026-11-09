import { describe, expect, it } from 'vitest';
import { buildQuickCanvasNode, copyCanvasSpecialized, persistCanvasMedia } from './canvasNodeFactory';
import { canConnect, canReference, connectionError, getNodeInputPorts, getNodeOutputPorts, linkedPrompt } from './canvasGraph';
import { studioSceneToCanvasGraph, syncCanvasGraphToStudioScene } from './studioSceneAdapter';
import { computePromptDiff, PROMPT_SKILL_CATALOG } from '../components/nodes/CanvasPromptSkillNode';
import { formatMentionDisplayLabel } from '@client/shared/prompt-bar/promptMentionDom';
import { resolveSubjectByMention } from '@client/shared/prompt-bar/promptMentions';
import type { CanvasProject } from './types';

it('rejects a video too large for the upload endpoint before reading media metadata', async () => {
  const video = new File([], 'reference.mp4', { type: 'video/mp4' });
  Object.defineProperty(video, 'size', { value: 32 * 1024 * 1024 });
  await expect(persistCanvasMedia(video, 0, 0)).rejects.toThrow('31 MB');
});

describe('buildQuickCanvasNode & 桥豆麻衣酱 1:1 节点与连接规则', () => {
  it('创建图片与视频生成节点时使用桥豆麻衣酱 1:1 精确几何尺寸 (250x250 / 444x250)', () => {
    const imgNode = buildQuickCanvasNode('image-generation', { x: 400, y: 300 });
    expect(imgNode.type).toBe('drawing');
    expect(imgNode.generationKind).toBe('image');
    expect(imgNode.width).toBe(250);
    expect(imgNode.height).toBe(250);
    expect(imgNode.x).toBe(275);
    expect(imgNode.y).toBe(175);

    const vidNode = buildQuickCanvasNode('video-generation', { x: 500, y: 300 });
    expect(vidNode.type).toBe('drawing');
    expect(vidNode.generationKind).toBe('video');
    expect(vidNode.width).toBe(444);
    expect(vidNode.height).toBe(250);
  });

  it('支持画布节点类型的创建与 studioSubType 映射', () => {
    const optimizer = buildQuickCanvasNode('video-prompt-optimizer', { x: 100, y: 100 });
    expect(optimizer.type).toBe('prompt');
    expect(optimizer.studioSubType).toBe('video-prompt-optimizer');

    const storyboard = buildQuickCanvasNode('storyboard-node', { x: 100, y: 100 });
    expect(storyboard.type).toBe('prompt');
    expect(storyboard.studioSubType).toBe('storyboard-node');
    expect(storyboard.storyboardShots).toEqual([]);
    expect([storyboard.width, storyboard.height]).toEqual([600, 500]);

    const timeline = buildQuickCanvasNode('video-timeline', { x: 100, y: 100 });
    expect(timeline.type).toBe('drawing');
    expect(timeline.studioSubType).toBe('video-timeline');

    const doodle = buildQuickCanvasNode('doodle-canvas', { x: 100, y: 100 });
    expect(doodle.type).toBe('drawing');
    expect(doodle.studioSubType).toBe('doodle-canvas');
  });

  it('保留智能搭建的导演台身份，以及拆解节点的待查回执', () => {
    const director = buildQuickCanvasNode('smart-build', { x: 500, y: 300 });
    const analysis = {
      ...buildQuickCanvasNode('video-analyze', { x: 900, y: 300 }),
      textOperationId: 'pending-analysis',
      textRecoveryRequired: true,
    };
    const project: CanvasProject = { id: 'priority-test', title: '专用节点', createdAt: 1, updatedAt: 1, nodes: [director, analysis] };
    const graph = studioSceneToCanvasGraph(syncCanvasGraphToStudioScene(project));
    expect(graph.nodes[0]).toMatchObject({studioSubType:'director-3d', specialized:{smartBuild:true},width:260,height:260});
    expect(graph.nodes[1]).toMatchObject({studioSubType:'video-analyze', textOperationId:'pending-analysis',textRecoveryRequired:true});
    expect(getNodeInputPorts(graph.nodes[1])[0].type).toBe('video');
    expect(getNodeOutputPorts(graph.nodes[1])[0].type).toBe('prompt');
  });

  it('复制 RH 节点时保留参数来源并隔离旧任务回执', () => {
    const settings = copyCanvasSpecialized({
      operation:'original',taskId:'paid-task',taskStatus:'pending',
      fields:[{nodeId:'12',fieldName:'image',fieldValue:'',sourceId:'a'}],
    },new Map([['a','a-copy']]));
    expect(settings).toMatchObject({operation:undefined,taskId:undefined,taskStatus:undefined,fields:[{sourceId:'a-copy'}]});
  });

  it('将原生视频抽帧节点的输出作为图片传递，并保留参考视频', () => {
    const node = {
      ...buildQuickCanvasNode('video-input', { x: 500, y: 300 }),
      imageUrl: '/storage/local/frame.jpg',
      videoUrl: '/storage/local/video.mp4',
    };
    const project: CanvasProject = { id: 'tool-test', title: '节点测试', createdAt: 1, updatedAt: 1, nodes: [node] };
    const scene = syncCanvasGraphToStudioScene(project);
    const restored = studioSceneToCanvasGraph(scene).nodes[0];
    expect(restored).toMatchObject({ studioSubType: 'video-input', imageUrl: node.imageUrl, videoUrl: node.videoUrl });
    expect(canReference(restored)).toBe(true);
    expect(getNodeInputPorts(restored)[0].type).toBe('video');
    expect(getNodeOutputPorts(restored)[0].type).toBe('image');
  });

  it('允许文本/提示词节点与音频节点既作为上游输出、也作为下游输入连接目标', () => {
    const imgNode = buildQuickCanvasNode('image-generation', { x: 100, y: 100 }, { id: 'img-1' });
    imgNode.imageUrl = '/uploads/shot1.png';
    const optimizer = buildQuickCanvasNode('video-prompt-optimizer', { x: 480, y: 100 }, { id: 'opt-1' });
    const vidNode = buildQuickCanvasNode('video-generation', { x: 900, y: 100 }, { id: 'vid-1' });
    const audioNode = buildQuickCanvasNode('audio', { x: 900, y: 380 }, { id: 'aud-1' });

    expect(canConnect(imgNode)).toBe(true);
    expect(canConnect(optimizer)).toBe(true);
    expect(canConnect(audioNode)).toBe(true);

    expect(getNodeInputPorts(optimizer).length).toBeGreaterThan(0);
    expect(getNodeOutputPorts(optimizer).length).toBeGreaterThan(0);
    expect(getNodeInputPorts(audioNode).length).toBeGreaterThan(0);

    const nodes = [imgNode, optimizer, vidNode, audioNode];
    expect(connectionError(nodes, 'img-1', 'opt-1')).toBe('');
    expect(connectionError(nodes, 'opt-1', 'vid-1')).toBe('');
    expect(connectionError(nodes, 'opt-1', 'aud-1')).toBe('');
  });

  it('文本节点支持快速接入全部 7 种下游节点（文本、脚本解析、表格编辑、绘画、视频、3D、音频）', () => {
    const sourceText = buildQuickCanvasNode('prompt', { x: 100, y: 200 }, { id: 'src-text' });
    sourceText.content = '第一场：雨夜街头，霓虹灯映照在水洼中。';
    const quickTargetKinds = [
      'prompt',
      'script-parse',
      'table-editor-node',
      'image-generation',
      'video-generation',
      'gen-3d',
      'audio',
    ] as const;

    for (const kind of quickTargetKinds) {
      const target = buildQuickCanvasNode(kind, { x: 520, y: 200 }, { id: `target-${kind}` });
      expect(getNodeInputPorts(target).length).toBeGreaterThan(0);
      expect(connectionError([sourceText, target], sourceText.id, target.id)).toBe('');
    }
  });

  it('绘画节点支持快速接入文本、绘画、视频、音频、对比节点', () => {
    const sourceImageGen = buildQuickCanvasNode('image-generation', { x: 100, y: 200 }, { id: 'src-drawing' });
    const quickTargetKinds = [
      'prompt',
      'image-generation',
      'video-generation',
      'audio',
      'compare',
    ] as const;

    for (const kind of quickTargetKinds) {
      const target = buildQuickCanvasNode(kind, { x: 520, y: 200 }, { id: `img-target-${kind}` });
      expect(getNodeInputPorts(target).length).toBeGreaterThan(0);
      expect(connectionError([sourceImageGen, target], sourceImageGen.id, target.id)).toBe('');
    }
  });

  it('将历史 Agent 节点转换为文本节点并保留内容和连线', () => {
    const source = { ...buildQuickCanvasNode('prompt', { x: 0, y: 0 }, { id: 'source' }), content: '分析结果', textPrompt: '分析要求' };
    const target = buildQuickCanvasNode('prompt', { x: 500, y: 0 }, { id: 'target' });
    const edges = [{ id: 'edge', sourceNodeId: source.id, targetNodeId: target.id }];
    const project: CanvasProject = { id: 'legacy-agent', title: '历史画布', createdAt: 1, updatedAt: 1, nodes: [source, target], edges };
    const scene = syncCanvasGraphToStudioScene(project);
    scene.nodes[0].type = 'custom-agent';

    const graph = studioSceneToCanvasGraph(scene);
    expect(graph.nodes[0]).toMatchObject({ id: source.id, type: 'prompt', content: source.content, textPrompt: source.textPrompt });
    expect(graph.nodes[0].studioSubType).toBeUndefined();
    expect(graph.edges).toHaveLength(1);

    const saved = syncCanvasGraphToStudioScene({ ...project, ...graph, studioScene: scene });
    expect(saved.nodes[0].type).toBe('text-node');
    expect(saved.connections).toEqual(scene.connections);
  });

  it('将历史裁剪重绘和无缝拼回节点转换为普通节点并保留连线', () => {
    const project: CanvasProject = {
      id: 'legacy-image-tools', title: '历史画布', createdAt: 1, updatedAt: 1, nodes: [],
    };
    const scene = syncCanvasGraphToStudioScene(project);
    scene.nodes = [
      { id: 'crop', type: 'inpaint-crop', prompt: '修改画面细节' },
      { id: 'stitch', type: 'inpaint-stitch', imageUrl: '/uploads/result.png', settings: { beikeNativeTool: true } },
    ];
    scene.connections = [{ id: 'edge', from: 'crop', to: 'stitch' }];

    const graph = studioSceneToCanvasGraph(scene);
    expect(graph.nodes[0]).toMatchObject({ type: 'prompt', content: '修改画面细节' });
    expect(graph.nodes[1]).toMatchObject({ type: 'image', imageUrl: '/uploads/result.png', referenceNodeIds: ['crop'] });
    expect(graph.nodes.every(node => node.studioSubType === undefined)).toBe(true);

    const saved = syncCanvasGraphToStudioScene({ ...project, ...graph, studioScene: scene });
    expect(saved.nodes.map(node => node.type)).toEqual(['text-node', 'input-image']);
    expect(saved.connections).toEqual(scene.connections);
  });

  it('在 studioSceneAdapter 中无损往返同步 studioSubType 与 storyboardShots', () => {
    const storyboard = buildQuickCanvasNode('storyboard-node', { x: 300, y: 200 }, { id: 'sb-1' });
    storyboard.storyboardShots = [{ id: 'shot-1', shotNumber: 'S1', cameraAngle: '中景', movement: '缓推', description: '进门' }];
    const chart = { ...buildQuickCanvasNode('storyboard-chart-node', { x: 1100, y: 200 }, { id: 'chart' }),
      storyboardChart: { columns: 4, rowHeight: 128 } };
    const project: CanvasProject = {
      id: 'proj-1',
      title: '测试画布',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nodes: [storyboard, chart],
      edges: [],
    };

    const scene = syncCanvasGraphToStudioScene(project);
    const restored = studioSceneToCanvasGraph(scene);
    const restoredSb = restored.nodes.find((n) => n.id === 'sb-1');

    expect(restoredSb?.studioSubType).toBe('storyboard-node');
    expect(restoredSb?.storyboardShots).toEqual(storyboard.storyboardShots);
    expect(restored.nodes.find(n=>n.id==='chart')).toMatchObject({studioSubType:'storyboard-chart-node',storyboardChart:chart.storyboardChart});
  });

  it('提示词 Skill 节点支持链接文本与素材、选择模型 Skill、对比前后差异并将最终提示词传给视频生成节点', () => {
    const rawText = buildQuickCanvasNode('prompt', { x: 100, y: 150 }, { id: 'raw-text-1' });
    rawText.content = '女孩在雨夜街道奔跑，回头看向镜头';

    const refImage = buildQuickCanvasNode('image-generation', { x: 100, y: 420 }, { id: 'ref-img-1' });
    refImage.imageUrl = '/uploads/rain-girl.png';

    const skillNode = buildQuickCanvasNode('video-prompt-optimizer', { x: 520, y: 260 }, {
      id: 'skill-node-1',
    });
    expect(skillNode.title).toBe('提示词 Skill');
    expect([skillNode.width, skillNode.height]).toEqual([300, 260]);
    expect(skillNode.drawing?.model).toBe('wan3.0-video');
    expect(PROMPT_SKILL_CATALOG.length).toBeGreaterThanOrEqual(10);

    const videoNode = buildQuickCanvasNode('video-generation', { x: 1040, y: 260 }, {
      id: 'video-gen-1',
    });
    expect(videoNode.drawing?.optimizePrompt).toBe(false);

    const unlinkedNodes = [rawText, refImage, skillNode, videoNode];
    expect(connectionError(unlinkedNodes, 'raw-text-1', 'skill-node-1')).toBe('');
    expect(connectionError(unlinkedNodes, 'ref-img-1', 'skill-node-1')).toBe('');
    expect(connectionError(unlinkedNodes, 'skill-node-1', 'video-gen-1')).toBe('');

    skillNode.referenceNodeIds = ['raw-text-1', 'ref-img-1'];
    skillNode.content = '近景跟拍，女孩在霓虹闪烁的雨夜街道奔跑，雨水溅起，她猛然回头看向镜头，眼神紧张，电影感冷暖对比光效';
    skillNode.promptOptimization = {
      compiler: true,
      skillId: 'wan-3.0-official',
      revision: '2026-04-01',
      sourceUrl: 'https://example.com/wan3-skill',
      textModel: 'gemini-3.1-pro',
      original: rawText.content,
      optimized: skillNode.content,
      draft: skillNode.content,
    };
    videoNode.referenceNodeIds = ['skill-node-1'];

    const allNodes = [rawText, refImage, skillNode, videoNode];
    expect(linkedPrompt(videoNode, allNodes)).toBe(skillNode.content);

    const diffSegments = computePromptDiff(rawText.content, skillNode.content);
    expect(diffSegments.some((s) => s.type === 'same' && s.text.includes('回头看向镜头'))).toBe(true);
    expect(diffSegments.some((s) => s.type === 'added' && s.text.includes('近景跟拍'))).toBe(true);

    const project: CanvasProject = {
      id: 'proj-skill',
      title: '提示词 Skill 链路',
      createdAt: 1,
      updatedAt: 1,
      nodes: allNodes,
    };
    const restored = studioSceneToCanvasGraph(syncCanvasGraphToStudioScene(project));
    const restoredSkill = restored.nodes.find((n) => n.id === 'skill-node-1');
    expect(restoredSkill?.studioSubType).toBe('video-prompt-optimizer');
    expect(restoredSkill?.promptOptimization).toMatchObject({
      skillId: 'wan-3.0-official',
      original: rawText.content,
      optimized: skillNode.content,
    });
    expect(restoredSkill?.drawing?.model).toBe('wan3.0-video');
  });

  it('画布 @主体 引用胶囊将原始文件名与 @图片1 统一解析并格式化为「图片 1」', () => {
    expect(formatMentionDisplayLabel('图片1')).toBe('图片 1');
    expect(formatMentionDisplayLabel('视频2')).toBe('视频 2');
    expect(formatMentionDisplayLabel('文本1')).toBe('文本 1');

    const refUrl = '/uploads/294bdd47ce11665d6b0113f7d8a978f3.png';
    const subjects = [
      { id: 'canvas-ref-0', name: '图片1', url: refUrl },
      { id: '294bdd47ce11665d6b0113f7d8a978f3', name: '图片1', url: refUrl },
      { id: 'text-ref-0', name: '文本1', url: 'text:node-txt-1' },
    ];

    const byIndex = resolveSubjectByMention('@图片1', subjects, [refUrl]);
    expect(byIndex?.name).toBe('图片1');
    expect(formatMentionDisplayLabel(byIndex?.name || '')).toBe('图片 1');

    const byRawHash = resolveSubjectByMention('@294bdd47ce11665d6b0113f7d8a978f3', subjects, [refUrl]);
    expect(byRawHash?.name).toBe('图片1');
    expect(byRawHash?.url).toBe(refUrl);

    const byTextRef = resolveSubjectByMention('@文本1', subjects, [refUrl]);
    expect(byTextRef?.name).toBe('文本1');
    expect(formatMentionDisplayLabel(byTextRef?.name || '')).toBe('文本 1');
  });
});
