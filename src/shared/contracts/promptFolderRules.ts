import { z } from 'zod';

export const PROMPT_FOLDER_RULE_LIMITS = { keywords: 200, anatomy: 32, wordLength: 80, folders: 100, nameLength: 40 } as const;
const identifier = z.string().trim().min(1).max(200);
const word = z.string().trim().min(1, '规则词不能为空').max(PROMPT_FOLDER_RULE_LIMITS.wordLength, '规则词最多 80 个字');
const keywords = z.array(word).max(PROMPT_FOLDER_RULE_LIMITS.keywords, '关键词最多 200 项').transform(values => [...new Set(values)]);
const anatomy = z.array(word).max(PROMPT_FOLDER_RULE_LIMITS.anatomy, '部位规则最多 32 项').transform(values => [...new Set(values)]);

export const savePromptFolderRulesSchema = z.object({
  action: z.literal('save-prompt-folder-rules'), id: identifier, keywords, anatomy,
});

export const importPromptFolderRulesSchema = z.object({
  action: z.literal('import-prompt-folder-rules'), parentId: identifier,
  items: z.array(z.object({
    name: z.string().trim().min(1, '文件夹名称不能为空').max(PROMPT_FOLDER_RULE_LIMITS.nameLength, '文件夹名称最多 40 个字'),
    keywords, anatomy: anatomy.optional(),
  })).min(1, '请至少导入一个文件夹').max(PROMPT_FOLDER_RULE_LIMITS.folders, '一次最多导入 100 个文件夹')
    .refine(items => new Set(items.map(item => item.name)).size === items.length, '同一批次文件夹名称不可重复'),
  mode: z.enum(['append', 'replace']),
});
