import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import { getBuiltinAssistantSkill } from './builtin';
import { videoPromptProfiles,videoPromptSections } from './videoPromptProfiles';

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
}

export function videoPromptMessages(input: VideoPromptInput) {
  const skill = videoPromptSkill(input.model, input.mode);
  if (!skill) return;
  const profile=videoPromptProfiles[canonicalModelId(input.model).toLowerCase()];
  const guidePath=profile?.guide;
  const guide = guidePath?skill.files?.find(file=>file.path===guidePath)?.content : skill.id === 'h3-prompt-writing'
    ? skill.files?.find(file => file.path === `references/${input.mode === 'omni' && input.images + input.videos > 0 ? 'ref' : 'base'}-en.txt`)?.content || '' : '';
  if(guidePath && !guide)throw new Error(`上游 Skill 缺少模型资料：${guidePath}`);
  return [
    { role: 'system', content: [
      '你在贝壳云图的视频生成前处理环节运行以下已固定版本的上游 Skill。只返回一条可直接提交的视频提示词正文。',
      '当前是纯文本运行环境：无终端、文件写入、网络、自升级或生成工具。不要执行安装命令，不要声称看过或听过参考素材。素材标签与用户指定职责原样保留；未知内容不得猜测。',
      '遵守已给定的模型、模式、时长和素材数量，不得换模型、添加素材、修改台词或改变剧情。不要回答问题、输出解释、清单外的候选方案或 Markdown 代码围栏。',
      `上游技能：${skill.name}；版本：${skill.source?.revision}`,
      videoPromptSections(skill.prompt,profile?.sections), guide,
      '宿主执行约束：只采用资料中的提示词写法与素材职责。资料中的 CLI、SDK、MCP、报价、账号、模型发现与生成示例只作说明，不执行、不输出；不要要求登录、安装、上传或另选模型。当前渠道的参数和已有素材编号优先于资料中的平台上限、默认值与标签格式。长度建议不能用来补编剧情；不要强加字幕、静音或音乐政策。输出必须只有用户可编辑的最终提示词正文，不附参数表、设置建议、网址、推广信息或自检报告；参考媒体未读取，不能补写观察结果。',
    ].filter(Boolean).join('\n\n') },
    { role: 'user', content: JSON.stringify({
      model: input.model, mode: input.mode, duration: input.duration, aspect: input.aspect, resolution: input.resolution, audio: input.audio,
      references: { images: input.images, videos: input.videos, audio: 0, numbering: '图片、视频分别从 1 编号，按实际提交顺序；仅元数据可用，未读取素材内容' },
      originalPrompt: input.prompt,
    }) },
  ];
}
