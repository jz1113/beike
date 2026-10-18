export type AssistantSkillInputRequirement = 'image' | 'document' | 'url';

export type AssistantSkillOutputFormat = 'markdown' | 'code_blocks' | 'structured_json';

export interface AssistantSkillStep {
  id: string;
  label: string;
  hint?: string;
}

export interface AssistantSkillReference {
  /** 内置引用路径，如 assetDeconstruct/REVERSE_ENGINE_CORE_SPEC */
  path: string;
  label?: string;
}

/** SKILL.md 以外的附属文件，运行时跟在主指令后面注入 */
export interface AssistantSkillFile {
  path: string;
  content: string;
}

/** 技能工作室里填写的展示信息与默认模型 */
export interface AssistantSkillMeta {
  genres: string[];
  tags: string[];
  defaultVideoModel?: string;
  defaultImageModel?: string;
  coverUrl?: string;
  showcaseUrls?: string[];
  promptGuide?: string;
  assetGuide?: string;
  isPublic?: boolean;
}

export interface AssistantSkill {
  id: string;
  name: string;
  description: string;
  /** 注入 systemPrompt 的主指令（精简） */
  prompt: string;
  icon?: string;
  /** 允许使用的工具名；未声明则使用全量工具 */
  tools?: string[];
  /** 激活后输入区提示的前置条件 */
  requires?: AssistantSkillInputRequirement[];
  /** UI 步骤条 */
  steps?: AssistantSkillStep[];
  /** 按需注入的参考资源 */
  references?: AssistantSkillReference[];
  outputFormat?: AssistantSkillOutputFormat;
  /** 内置官方技能，不可删除 */
  isBuiltin?: boolean;
  version?: string;
  createdAt?: number;
  updatedAt?: number;
  /** 中文展示名称（如：Seedance 2.5 提示副驾驶） */
  displayName?: string;
  /** 技能提供方/作者，如 TapNow、官方、自定义 */
  author?: string;
  /** 图标渐变色主题 key */
  colorTheme?: string;
  /** 完整的 Markdown 文档，用于详情页展示 */
  markdownDoc?: string;
  /** 除根目录 SKILL.md 以外的附属文件 */
  files?: AssistantSkillFile[];
  /** 封面、标签、默认模型等工作室信息 */
  meta?: AssistantSkillMeta;
}

export interface ParsedSkillFile {
  skill: AssistantSkill;
  format: 'markdown' | 'json';
}

/** 客户端组装后传给 API 的技能运行时载荷 */
export interface AssistantSkillRuntime {
  skillId: string;
  systemPrompt: string;
  allowedTools?: string[];
}
