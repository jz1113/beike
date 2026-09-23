import type { KeywordReviewRuleEntry } from '@beike/contracts/generate';
import { KeywordReviewRuleEntrySchema } from '@beike/contracts/generate';
import { prisma } from '../repositories/db';

export type RuleRevision = {
  version: number;
  entries: KeywordReviewRuleEntry[];
  note: string;
  createdAt: string | null;
};

const initial: RuleRevision = { version: 0, entries: [], note: '初始规则', createdAt: null };

function fromRecord(record: { version: number; entriesJson: string; note: string; createdAt: Date }): RuleRevision {
  const parsed = KeywordReviewRuleEntrySchema.array().parse(JSON.parse(record.entriesJson));
  return { version: record.version, entries: parsed, note: record.note, createdAt: record.createdAt.toISOString() };
}

export async function getKeywordReviewRules(workspaceId: string, version?: number): Promise<RuleRevision> {
  if (version === 0) return initial;
  const record = version === undefined
    ? await prisma.keywordReviewRuleRevision.findFirst({ where: { workspaceId }, orderBy: { version: 'desc' } })
    : await prisma.keywordReviewRuleRevision.findUnique({ where: { workspaceId_version: { workspaceId, version } } });
  if (!record) {
    if (version === undefined) return initial;
    throw new Error(`审核规则版本 v${version} 不存在`);
  }
  return fromRecord(record);
}

export async function listKeywordReviewRules(workspaceId: string): Promise<RuleRevision[]> {
  const records = await prisma.keywordReviewRuleRevision.findMany({
    where: { workspaceId }, orderBy: { version: 'desc' }, take: 30,
  });
  return [...records.map(fromRecord), initial];
}

export async function publishKeywordReviewRules(workspaceId: string, input: {
  baseVersion: number; entries: KeywordReviewRuleEntry[]; note: string;
}): Promise<RuleRevision> {
  const current = await getKeywordReviewRules(workspaceId);
  if (current.version !== input.baseVersion) throw new Error('规则已被其他人更新，请刷新后再保存');
  const entries = input.entries;
  let record;
  try {
    record = await prisma.keywordReviewRuleRevision.create({
      data: { workspaceId, version: current.version + 1, entriesJson: JSON.stringify(entries), note: input.note },
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new Error('规则已被其他人更新，请刷新后再保存');
    }
    throw error;
  }
  return fromRecord(record);
}

export function formatKeywordReviewRuleAdditions(entries: KeywordReviewRuleEntry[]): string {
  if (!entries.length) return '';
  const lines = entries.map((entry, index) => `${index + 1}. [${entry.section}] ${entry.text}`);
  return `\n\n以下是后续发布的补充规则，与基础规则一起执行；不得改变允许垂类、制作结论、否决类型或 JSON 字段：\n${lines.join('\n')}`;
}
