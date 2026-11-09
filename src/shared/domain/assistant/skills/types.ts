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

/** SKILL.md 以外的附属文件，由 read_skill_file 按需读取。脚本不自动执行。 */
export interface AssistantSkillFile {
  path: string;
  content: string;
}

/** 技能工作室里填写的展示信息与默认模型 */
export interface AssistantSkillMeta {
  /** 用途：agent 参与按需发现；creation 由用户选用。不改变持久化标识。 */
  kind?: 'agent' | 'creation';
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
  /** Upstream identity and integrity; application metadata never rewrites the source instructions. */
  source?: {
    kind: 'official' | 'community' | 'platform' | 'local';
    url: string;
    revision: string;
    license: string;
    downloadUrl?: string;
    archiveSha256?: string;
    files: Record<string, string>;
  };
  id: string;
  /** Server content version, separate from the author's version label. */
  libraryVersion?: string;
  isFavorite?: boolean;
  name: string;
  description: string;
  /** Localized application copy; upstream description and SKILL.md remain unchanged. */
  displayDescription?: string;
  usageGuide?: string;
  /** Model identity for the shared brand icon renderer. */
  modelIcon?: string;
  /** 与 SKILL.md 正文一致的执行指令，点选注入或经 read_skill 读取。 */
  prompt: string;
  icon?: string;
  /** 允许使用的工具名；未声明则使用全量工具 */
  tools?: string[];
  /** 宿主对上游工具的显式映射；不修改原版工具声明，未配置时沿用 tools。 */
  runtimeTools?: string[];
  /** 宿主执行适配，独立于原版正文；仅选用时注入，最多 4,000 字符。 */
  runtimeInstructions?: string;
  /** 激活后输入区提示的前置条件 */
  requires?: AssistantSkillInputRequirement[];
  /** UI 步骤条 */
  steps?: AssistantSkillStep[];
  /** 按需注入的参考资源 */
  references?: AssistantSkillReference[];
  outputFormat?: AssistantSkillOutputFormat;
  /** 内置技能，不可删除；官方、社区、平台或本地来源由 source.kind 标明。 */
  isBuiltin?: boolean;
  version?: string;
  createdAt?: number;
  updatedAt?: number;
  /** 中文展示名称（如：Seedance 2.5 官方提示词） */
  displayName?: string;
  /** 技能陈列分组名称（如：视觉反推与图像生成） */
  category?: string;
  /** 技能提供方/作者，如 TapNow、官方、自定义 */
  author?: string;
  usageCount?: number;
  favoriteCount?: number;
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

/** 技能包里的附属文件或参考规范。只在模型调用 read_skill_file 时展开。 */
export interface SkillResourceFile {
  path: string;
  content: string;
}

/** 客户端组装后传给 API 的技能运行时载荷 */
export interface AssistantSkillRuntime {
  skillId: string;
  systemPrompt: string;
  allowedTools?: string[];
  resources: SkillResourceFile[];
}

/** 本轮可发现的技能。正文和资料只在未超出载荷时携带，供 read_skill 按需读取。 */
export interface SkillCatalogEntry {
  id: string;
  /** Server-owned snapshot, resolved lazily by exact upstream revision. */
  builtinRevision?: string;
  name: string;
  description: string;
  prompt?: string;
  tools?: string[];
  resources?: SkillResourceFile[];
}

export type SkillPurpose = 'agent' | 'creation';

export const SKILL_PURPOSES = {
  agent: {
    label: 'Agent 运行技能',
    description: 'Agent 的任务执行规范，定义判断方法、工具流程与输出要求。',
    invocation: '任务匹配时自动按需读取，也可为本次消息指定一项。',
    content: '执行步骤、工具范围、模型提示词规范、参考资料。',
  },
  creation: {
    label: '创作技能',
    description: '可复用的具体创作模板，定义要生成的作品与需要替换的内容。',
    invocation: '由你选择后应用到当前创作；电商图文模板应用到换品流程。',
    content: '完整脚本、分镜、风格约束、创作提示词与参考作品。',
  },
} as const;

/** 用途与提供方、体裁无关；旧包保留兼容识别，声明了工具流程的旧包优先归入运行技能。 */
export function resolveSkillKind(skill: AssistantSkill): SkillPurpose {
  if (skill.meta?.kind === 'agent' || skill.meta?.kind === 'creation') return skill.meta.kind;
  if (skill.isBuiltin || skill.tools !== undefined || skill.steps?.length || skill.references?.length) return 'agent';
  return skill.meta && (skill.meta.coverUrl || skill.meta.showcaseUrls?.length || skill.meta.genres?.length)
    ? 'creation' : 'agent';
}
