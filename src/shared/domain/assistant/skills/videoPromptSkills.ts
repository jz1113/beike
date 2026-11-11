import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import { getBuiltinAssistantSkill } from './builtin';

/** Host adapters select relevant, unchanged upstream chapters; they do not author replacement Skills. */
export interface VideoPromptProfile {
  skillId:string;
  title?:string;
  icon?:string;
  guide?:string;
  sections?:string[];
}

export const videoPromptProfiles:Record<string,VideoPromptProfile>={
  'veo3.1':{skillId:'scenario-veo',sections:['## The soundstage is in the prompt','## Prompt one continuous shot']},
  'veo3.1-fast':{skillId:'scenario-veo',sections:['## The soundstage is in the prompt','## Prompt one continuous shot']},
  'veo3.1-pro':{skillId:'scenario-veo',sections:['## The soundstage is in the prompt','## Prompt one continuous shot']},
  'gemini-omni-1.0-flash':{skillId:'gemini-omni-flash-api',sections:['## Prompting Gemini Omni Flash']},
  'gemini-omni-1.2-flash':{skillId:'gemini-omni-flash-api',sections:['## Prompting Gemini Omni Flash']},
  'omni_flash-10s':{skillId:'gemini-omni-flash-api',sections:['## Prompting Gemini Omni Flash']},
  'kling-4.0':{skillId:'ai-video-prompt-writer',title:'可灵通用提示词 · 社区',icon:'kling-4.0',guide:'models/kling.md'},
  'kling-4.0-flash':{skillId:'ai-video-prompt-writer',title:'可灵通用提示词 · 社区',icon:'kling-4.0-flash',guide:'models/kling.md'},
  'kling-video-v3':{skillId:'kling-3-prompting'},
  'kling-video-v3-omni':{skillId:'kling-3-prompting'},
  'kling-video-v2-6':{skillId:'scenario-kling',sections:['## Audio is a per-member switch','## Worked example: two-shot character clip from a still','## Common mistakes']},
  'kling-video-v2-5-turbo':{skillId:'ai-video-prompt-writer',title:'可灵通用提示词 · 社区',icon:'kling-video-v2-5-turbo',guide:'models/kling.md'},
  'sora-2':{skillId:'ai-video-prompt-writer',title:'Sora 2 提示词 · 社区',icon:'sora-2',guide:'models/sora-2.md'},
  'sora-2-pro':{skillId:'ai-video-prompt-writer',title:'Sora 2 提示词 · 社区',icon:'sora-2-pro',guide:'models/sora-2.md'},
  'grok-imagine-video-1.5':{skillId:'scenario-grok-imagine-video',sections:['## First frame or references','## Sound is prompted, not switched']},
  'viduq3':{skillId:'scenario-vidu',sections:['## Two prompt shapes']},
  'viduq3-mix':{skillId:'scenario-vidu',sections:['## Two prompt shapes']},
  'viduq3-turbo':{skillId:'scenario-vidu',sections:['## Two prompt shapes']},
  'viduq3-pro':{skillId:'scenario-vidu',sections:['## Two prompt shapes']},
  'viduq4-preview':{skillId:'ai-video-prompt-writer',title:'Vidu 通用提示词 · 社区',icon:'viduq4-preview',guide:'models/vidu.md'},
};

/** Keep a selected heading and its child headings verbatim, stopping at the next peer section. */
function videoPromptSections(prompt:string,headings?:string[]):string {
  if(!headings)return prompt;
  const lines=prompt.split('\n');
  return headings.map(heading=>{
    const start=lines.findIndex(line=>line.trim()===heading),level=heading.match(/^#+/)?.[0].length || 0;
    if(start<0)throw new Error(`上游 Skill 缺少提示词章节：${heading}`);
    let end=start+1;
    while(end<lines.length){const next=lines[end].match(/^(#+) /);if(next && next[1].length<=level)break;end++;}
    return lines.slice(start,end).join('\n').trim();
  }).join('\n\n');
}

/** Match verified upstream skills to their own model generation only. */
export function videoPromptSkill(model: string, mode?: string) {
  const id = canonicalModelId(model).toLowerCase();
  const profile=videoPromptProfiles[id];
  if(profile) {
    const skill=getBuiltinAssistantSkill(profile.skillId);
    return skill?{...skill,displayName:profile.title || skill.displayName,modelIcon:profile.icon || skill.modelIcon}:undefined;
  }
  const skillId = /^wan3(?:[.-]|$)/.test(id) ? (mode === 'edit' ? undefined : 'wan3-pe')
    : id === 'minimax-h3' ? 'h3-prompt-writing'
    : /seedance[-_.]?2[.-]?5/.test(id) ? 'sd25-pe'
    : /seedance[-_.]?2[.-]?0/.test(id) ? 'sd2-pe' : undefined;
  return skillId ? getBuiltinAssistantSkill(skillId) : undefined;
}

export function resolveVideoPromptSkill(skillId:string,model?:string,mode?:string) {
  const selected=model?videoPromptSkill(model,mode):undefined;
  return selected?.id===skillId?selected:getBuiltinAssistantSkill(skillId);
}

export interface VideoPromptInput {
  model: string;
  prompt: string;
  mode?: string;
  duration?: number;
  aspect?: string;
  resolution?: string;
  audio?: boolean;
  images: number;
  videos: number;
  audios?: number;
  scriptOnly?: boolean;
}

export function videoPromptMessages(input: VideoPromptInput) {
  const skill = videoPromptSkill(input.model, input.mode);
  if (!skill) return;
  const profile=videoPromptProfiles[canonicalModelId(input.model).toLowerCase()];
  const guidePath=profile?.guide;
  const guide = guidePath?skill.files?.find(file=>file.path===guidePath)?.content : skill.id === 'h3-prompt-writing'
    ? skill.files?.find(file => file.path === `references/${input.mode === 'omni' && input.images + input.videos + (input.audios || 0) > 0 ? 'ref' : 'base'}-en.txt`)?.content || '' : '';
  if(guidePath && !guide)throw new Error(`上游 Skill 缺少模型资料：${guidePath}`);
  return [
    { role: 'system', content: [
      '你在贝壳云图的视频生成前处理环节运行以下已固定版本的上游 Skill。只返回一条可直接提交的视频提示词正文。',
      '当前是纯文本运行环境：无终端、文件写入、网络、自升级或生成工具。不要执行安装命令，不要声称看过或听过参考素材。素材标签与用户指定职责原样保留；未知内容不得猜测。',
      '遵守已给定的模型、模式、时长和素材数量，不得换模型、添加素材、修改台词或改变剧情。不要回答问题、输出解释、清单外的候选方案或 Markdown 代码围栏。',
      input.scriptOnly ? '当前是全能参考文字分镜复刻：图片仅约束外观、环境和静态质感，不锁定首尾帧。只输出可见画面、动作、镜头、风格与声音要求，不输出调用技能、节点操作、后期回贴、请求确认或源片核对说明；不得补入其他片段。保持已给定时长及连续时间轴，保留具体光色、材质与表演节奏，声音须与audio参数一致。' : '',
      `上游技能：${skill.name}；版本：${skill.source?.revision}`,
      videoPromptSections(skill.prompt,profile?.sections), guide,
      '最高优先级输出要求：即使上游 Skill 要求优化问题、原则、诊断或兜底包，也不要输出这些内容；不得删除用户给定的分秒时间轴、静音或原话。只输出正文，不输出标题。',
      '宿主执行约束：只采用资料中的提示词写法与素材职责。资料中的 CLI、SDK、MCP、报价、账号、模型发现与生成示例只作说明，不执行、不输出；不要要求登录、安装、上传或另选模型。当前渠道的参数和已有素材编号优先于资料中的平台上限、默认值与标签格式。长度建议不能用来补编剧情；不要强加字幕、静音或音乐政策。输出必须只有用户可编辑的最终提示词正文，不附参数表、设置建议、网址、推广信息或自检报告；参考媒体未读取，不能补写观察结果。',
      '本次输出格式优先于上游技能的报告格式：不要输出“优化后提示词”“优化问题”“相关原则”等标题或说明。原文已有的具体秒数区间、事件顺序、开场与结束状态必须保留，不得改为无数字阶段。audio=false 时明确全程静音，不生成台词、音乐、环境声或音效；不得为补全要素新增剧情、音效或默认画质包。',
      input.scriptOnly && /^【本次片段｜时长 \d+ 秒】$/m.test(input.prompt) ? '07分镜复刻专用：逐行保留 originalPrompt 的内容和顺序，仅移除独占一行的「已连接文本（提取后）」来源标签，并可调整段落空行。全片一致性、开场、唯一时间轴、镜头风格、结束状态、声音和每条素材职责均须原样保留。不得添加、改写或重复正文。此规则优先于上游技能的改写要求。' : '',
    ].filter(Boolean).join('\n\n') },
    { role: 'user', content: JSON.stringify({
      model: input.model, mode: input.mode, duration: input.duration, aspect: input.aspect, resolution: input.resolution, audio: input.audio,
      references: { images: input.images, videos: input.videos, audio: input.audios || 0, numbering: '图片、视频、音频分别从 1 编号，按实际提交顺序；仅元数据可用，未读取素材内容' },
      originalPrompt: input.prompt,
    }) },
  ];
}
