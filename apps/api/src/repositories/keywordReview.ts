import { prisma } from './db';

export async function readKeywordLookupCache(workspaceId: string, rulesVersion: number, queries: string[]) {
  const rows = await prisma.keywordLookupCache.findMany({
    where: { workspaceId, rulesVersion, query: { in: queries } },
  });
  return rows.map((row) => ({ query: row.query, category: row.category, subject: row.subject }));
}

export async function writeKeywordLookupCache(
  workspaceId: string,
  rulesVersion: number,
  query: string,
  hit: { category: string; subject?: string },
) {
  await prisma.keywordLookupCache.upsert({
    where: { workspaceId_rulesVersion_query: { workspaceId, rulesVersion, query } },
    create: { workspaceId, rulesVersion, query, category: hit.category, subject: hit.subject || '' },
    update: { category: hit.category, subject: hit.subject || '' },
  });
}

export async function findLatestKeywordReviewRule(workspaceId: string) {
  return prisma.keywordReviewRuleRevision.findFirst({ where: { workspaceId }, orderBy: { version: 'desc' } });
}

export async function findKeywordReviewRule(workspaceId: string, version: number) {
  return prisma.keywordReviewRuleRevision.findUnique({ where: { workspaceId_version: { workspaceId, version } } });
}

export async function listKeywordReviewRuleRecords(workspaceId: string) {
  return prisma.keywordReviewRuleRevision.findMany({
    where: { workspaceId }, orderBy: { version: 'desc' }, take: 30,
  });
}

export async function createKeywordReviewRuleRevision(input: {
  workspaceId: string;
  version: number;
  entriesJson: string;
  note: string;
}) {
  return prisma.keywordReviewRuleRevision.create({ data: input });
}
