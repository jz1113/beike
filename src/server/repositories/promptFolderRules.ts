import type { Prisma, AssetProductCategory } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { savePromptFolderRulesSchema, importPromptFolderRulesSchema, PROMPT_FOLDER_RULE_LIMITS } from '@shared/contracts/promptFolderRules';
import { PROMPT_GROUP_SUBCATEGORY_FOLDER_PREFIX, PROMPT_GROUP_SUBCATEGORIES, PROMPT_GROUP_SUBCATEGORY_LABELS, builtinSubcategoryFolderId } from '@shared/domain/assets/promptGroupSubcategory';
import { requireWorkspaceId } from '../infrastructure/workspace/workspaceContext';

type Transaction = Prisma.TransactionClient;
const virtualIds = new Set(['all', 'auto', 'unclassified', 'unknown', 'universal']);

async function activeFolder(tx: Transaction, id: string): Promise<AssetProductCategory> {
  if (virtualIds.has(id)) throw new Error('系统虚拟分类不可编辑规则');
  const row = await tx.assetProductCategory.findUnique({ where: { id } });
  if (!row || row.isArchived || row.workspaceId !== requireWorkspaceId()) throw new Error('文件夹不存在、已归档或不属于当前工作区');
  if (row.parentId) {
    const parent = await tx.assetProductCategory.findUnique({ where: { id: row.parentId } });
    if (!parent || parent.parentId || parent.isArchived || parent.workspaceId !== requireWorkspaceId()) throw new Error('父文件夹不存在、已归档或不属于当前工作区');
  }
  return row;
}

function mergedRules(raw: string, incoming: string[], limit: number): string[] {
  let previous: unknown;
  try { previous = JSON.parse(raw); } catch { previous = []; }
  const values = [...new Set([...(Array.isArray(previous) ? previous.filter((value): value is string => typeof value === 'string' && !!value.trim()).map(value => value.trim()) : []), ...incoming])];
  if (values.length > limit || values.some(value => value.length > PROMPT_FOLDER_RULE_LIMITS.wordLength)) throw new Error('合并后的规则超过数量或长度上限，请精简后重试');
  return values;
}

export async function savePromptFolderRules(tx: Transaction, raw: unknown) {
  const body = savePromptFolderRulesSchema.parse(raw);
  const builtin = PROMPT_GROUP_SUBCATEGORIES.find(kind => builtinSubcategoryFolderId(kind) === body.id);
  if (builtin && !await tx.assetProductCategory.findUnique({ where: { id: body.id } })) {
    const parent = await activeFolder(tx, 'digital_3c');
    if (parent.parentId) throw new Error('手机数码大类不可用');
    const siblings = await tx.assetProductCategory.findMany({ where: { parentId: parent.id, workspaceId: requireWorkspaceId() }, select: { position: true } });
    await tx.assetProductCategory.create({ data: {
      id: body.id, name: PROMPT_GROUP_SUBCATEGORY_LABELS[builtin], parentId: parent.id,
      workspaceId: requireWorkspaceId(), position: siblings.reduce((maximum, row) => Math.max(maximum, row.position), -1) + 1,
    } });
  }
  const folder = await activeFolder(tx, body.id);
  if (builtin && folder.parentId !== 'digital_3c') throw new Error('数码细分文件夹不属于手机数码');
  await tx.assetProductCategory.update({ where: { id: folder.id }, data: {
    keywords: JSON.stringify(body.keywords), anatomy: JSON.stringify(body.anatomy),
  } });
}

/** Replace only a matching folder's rules; never remove folders or their mother groups. */
export async function importPromptFolderRules(tx: Transaction, raw: unknown) {
  const body = importPromptFolderRulesSchema.parse(raw);
  const parent = await activeFolder(tx, body.parentId);
  if (parent.parentId) throw new Error('请在实际商品大类下导入二级文件夹');
  const workspaceId = requireWorkspaceId();
  const siblings = await tx.assetProductCategory.findMany({ where: { parentId: parent.id } });
  let position = siblings.reduce((maximum, row) => Math.max(maximum, row.position), -1) + 1;
  let createdCount = 0;
  for (const item of body.items) {
    const sameName = siblings.filter(row => row.name === item.name);
    const candidates = sameName.filter(row => !row.isArchived && row.workspaceId === workspaceId);
    if (candidates.length > 1) throw new Error(`同名文件夹「${item.name}」存在多条记录，请先整理分类`);
    const existing = candidates[0];
    if (!existing && sameName.length) throw new Error(`文件夹「${item.name}」已归档或不属于当前工作区`);
    const keywords = existing && body.mode === 'append' ? mergedRules(existing.keywords, item.keywords, PROMPT_FOLDER_RULE_LIMITS.keywords) : item.keywords;
    const anatomy = item.anatomy === undefined ? existing?.anatomy || '[]' : JSON.stringify(existing && body.mode === 'append'
      ? mergedRules(existing.anatomy, item.anatomy, PROMPT_FOLDER_RULE_LIMITS.anatomy) : item.anatomy);
    if (existing) {
      await tx.assetProductCategory.update({ where: { id: existing.id }, data: { keywords: JSON.stringify(keywords), anatomy } });
    } else {
      const builtin = parent.id === 'digital_3c' ? PROMPT_GROUP_SUBCATEGORIES.find(kind => PROMPT_GROUP_SUBCATEGORY_LABELS[kind] === item.name) : undefined;
      const builtinId = builtin ? builtinSubcategoryFolderId(builtin) : null;
      const builtinFolder = builtinId ? await tx.assetProductCategory.findUnique({ where: { id: builtinId } }) : null;
      if (builtinFolder && (builtinFolder.isArchived || builtinFolder.workspaceId !== workspaceId)) throw new Error(`内置文件夹「${item.name}」已归档或不属于当前工作区`);
      const id = builtinId && !builtinFolder ? builtinId : `${PROMPT_GROUP_SUBCATEGORY_FOLDER_PREFIX}${randomUUID()}`;
      const created = await tx.assetProductCategory.create({ data: {
        id, name: item.name, parentId: parent.id, workspaceId, position: position++,
        keywords: JSON.stringify(keywords), anatomy,
      } });
      siblings.push(created);
      createdCount++;
    }
  }
  return { createdCount, updatedCount: body.items.length - createdCount };
}
