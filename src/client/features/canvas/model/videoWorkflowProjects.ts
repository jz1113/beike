import type { CanvasProject, StudioScene } from './types';

export type VideoWorkflowKind = 'depth-copy' | 'w3-copy';

export const videoWorkflowTemplates: { kind: VideoWorkflowKind; title: string; summary: string }[] = [
  { kind: 'depth-copy', title: '深度视频复刻', summary: '保留动作节奏，替换人物、服装和场景' },
  { kind: 'w3-copy', title: 'W3 视频复刻', summary: '参考片改编为商品分镜，调整台词与声音' },
];

const steps: Record<VideoWorkflowKind, [string, string][]> = {
  'depth-copy': [
    ['01 / 参考片与替换目标', '准备已授权的原片或抖音链接、替换人物图；服装与场景可选。\n记录商品外观、材质、标识与不可改动项。\n适合服装展示、舞蹈与动作演示；不负责改写带货台词。'],
    ['02 / 媒体分析与本机预检', '核对帧率、尺寸、时长、旋转与音轨；抽帧检查近景、背面和遮挡。\n贝壳接入点：参考视频拆解、深度视频任务。\n检查本机模型、磁盘及处理能力，不能静默转为付费云深度。'],
    ['03 / 连续深度与目标主图', '整片生成时间连续的相对深度，再切分为不超过 15 秒的参考片段。\n目标主图提供人物、服装与场景；必要时补背面。\n深度仍可能保留旧服装轮廓，不等于抠像或去字幕。'],
    ['04 / 分段方案与报价', '固定原片时间轴、片段区间、目标图片及输出规格。\n通过受信 W3G 准备真实素材并报价，记录各段费用与预算。\n此路线没有 W3 整单资金父任务；逐段保存任务和恢复身份。'],
    ['05 / 画面生成与原声合成', '目标图负责外观，深度片负责动作与镜头。生成画面只引用批准素材。\n成功片段立即保存，未知受理沿原请求恢复。\n裁去生成余量、顺序拼接并回贴同源原声；无原声则静音。'],
    ['06 / 电商验收与资产归档', '检查动作节拍、脸手、遮挡后身份、服装材质、商品细节和灰色残留。\n核对成片时长与音画同步；成功片段不因合成失败而重做。\n成片与主图、深度片、费用和恢复记录归入同一案例。'],
  ],
  'w3-copy': [
    ['01 / 参考片与商品资料', '准备已授权参考视频或抖音链接，确定复刻范围。\n复用电商视频的商品图、卖点与规格；只收集需要替换的人物、商品或场景图。\n保持的部分无需额外补图。'],
    ['02 / 台词、声音与字幕', '逐项确定保留、改写或不要台词，再确定原音轨、模型生成声音或静音。\n改词不回贴含旧台词的原录音；不新增口播不等于删除原音乐。\n明确去字幕范围，保护包装和场景中的商品文字。'],
    ['03 / 免费分析与商品分镜', '分析原片镜头、节奏、动作和转写，保存来源与时间码。\n贝壳接入点：参考视频拆解 → 商品分镜改编 → 成片脚本。\n逐段映射新台词与说话人，核对商品卖点依据与可朗读时长。'],
    ['04 / 整片方案与资金计划', '展示全部分段、视觉替换、声音选择、字幕策略与预估费用 E。\nNGGAIGC 路线：受信 W3 工作流 v2 保存方案并冻结整片 E。\n实际按用量结算，E 不是最高实扣；贝壳原生渠道须另用自己的报价规则。'],
    ['05 / 素材准备与持久接续', '关键帧、去字幕、静音参考分段、素材验证依次执行。\nNGGAIGC 服务端固定本任务生成能力；画布不能自行切换 W3/W3G。\n等待宿主补图时保留任务；未知结果沿原身份恢复，成功片段不重做。'],
    ['06 / 合成、核查与交付', '按声音方案回贴原声、使用模型声音或静音；原音轨与生成画面取共同覆盖。\n核查画面、商品、台词、字幕和时长，再归档最终视频与实际费用。\n部分失败保存成功片段及原任务，不标为完整成片。'],
  ],
};

/** Editable planning scenes only: no generation tasks, media uploads or account credentials. */
export function createVideoWorkflowProject(kind: VideoWorkflowKind, id: string, now: number): CanvasProject {
  const template = videoWorkflowTemplates.find(item => item.kind === kind)!;
  const blocks: [string, string][] = [
    [`${template.title} / 电商视频`, `流程模板 · 未接通自动执行\n${template.summary}\n来源：NGGAIGC ${kind === 'depth-copy' ? 'ngg-depth-dance-copy 0.2.3' : 'w3-video-copy 0.1.37'}。节点是可编辑的操作说明，连线表示步骤顺序，点击文本生成不等于执行工作流。`],
    ...steps[kind],
    ['接入边界 / 两条可选路线', '贝壳原生路线：复用当前深度、分镜、生成队列与 FFmpeg 合成，按本系统任务规则编排。\nNGGAIGC 路线：由本机受信入口连接账户、验签工作流并执行，回传脱敏进度和结果。\n复制 SKILL.md 不会带来服务端能力；浏览器不得读取系统凭据。'],
  ];
  const scene: StudioScene = {
    nodes: blocks.map(([nodeName, content], index) => ({
      id: `${id}-step-${index}`, type: 'text-node', nodeName, content,
      x: 80 + index % 4 * 410, y: 80 + Math.floor(index / 4) * 440,
      // Studio uses aiGenerated to display a node's own saved text instead of hiding it behind upstream text.
      width: 360, height: 360, settings: { text: content, aiGenerated: true },
    })),
    connections: steps[kind].slice(1).map((_, index) => ({
      id: `${id}-edge-${index}`, from: `${id}-step-${index + 1}`, to: `${id}-step-${index + 2}`,
    })),
    groups: [], textBoxes: [], strokes: [], view: { x: 0, y: 0, zoom: 0.65 },
  };
  return { id, title: `${template.title} · 电商视频`, subtitle: '流程模板 · 待准备素材',
    createdAt: now, updatedAt: now, draft: false, nodes: [], edges: [], studioScene: scene };
}
