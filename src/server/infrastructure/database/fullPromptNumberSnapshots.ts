import type { Prisma } from '@prisma/client';

export interface FullPromptSnapshotNumberChange {
  oldNumber: number | null;
  newNumber: number;
}

type NumberChanges = ReadonlyMap<string, FullPromptSnapshotNumberChange>;

export interface FullPromptNumberSnapshotMigrationStats {
  workshopWorkspaces: number;
  workshopBatches: number;
  assistantTurns: number;
  assistantTurnItems: number;
  invalidJsonRows: number;
}

interface JsonNode {
  start: number;
  end: number;
  value?: unknown;
  fields?: Map<string, JsonNode>;
  items?: JsonNode[];
}

interface NumberReplacement {
  start: number;
  end: number;
  number: number;
}

/** Keep original tokens so unrelated large integers, decimals and string escapes remain exact. */
function parseJsonNodes(text: string): JsonNode | null {
  try {
    JSON.parse(text); // Validate syntax before locating tokens; never reserialize this value.
    let cursor = 0;
    const skipWhitespace = () => {
      while (/\s/.test(text[cursor] || '') && cursor < text.length) cursor++;
    };
    const readString = () => {
      const start = cursor++;
      while (cursor < text.length) {
        if (text[cursor] === '\\') cursor += 2;
        else if (text[cursor++] === '"') break;
      }
      return JSON.parse(text.slice(start, cursor)) as string;
    };
    const readValue = (): JsonNode => {
      skipWhitespace();
      const start = cursor;
      if (text[cursor] === '{') {
        cursor++;
        skipWhitespace();
        const fields = new Map<string, JsonNode>();
        while (text[cursor] !== '}') {
          const key = readString();
          skipWhitespace();
          cursor++; // Colon, already validated by JSON.parse.
          fields.set(key, readValue());
          skipWhitespace();
          if (text[cursor] !== ',') break;
          cursor++;
          skipWhitespace();
        }
        cursor++;
        return { start, end: cursor, fields };
      }
      if (text[cursor] === '[') {
        cursor++;
        skipWhitespace();
        const items: JsonNode[] = [];
        while (text[cursor] !== ']') {
          items.push(readValue());
          skipWhitespace();
          if (text[cursor] !== ',') break;
          cursor++;
          skipWhitespace();
        }
        cursor++;
        return { start, end: cursor, items };
      }
      if (text[cursor] === '"') {
        return { start, value: readString(), end: cursor };
      }
      while (cursor < text.length && !/[\s,}\]]/.test(text[cursor])) cursor++;
      return { start, end: cursor, value: JSON.parse(text.slice(start, cursor)) };
    };
    return readValue();
  } catch {
    // Invalid or excessively nested historical JSON is retained verbatim.
    return null;
  }
}

function collectNumberReplacement(
  record: JsonNode | undefined,
  idKey: string,
  numberKey: string,
  changes: NumberChanges,
  replacements: NumberReplacement[],
): void {
  const assetId = record?.fields?.get(idKey)?.value;
  const storedNumber = record?.fields?.get(numberKey);
  if (typeof assetId !== 'string' || !storedNumber || storedNumber.fields || storedNumber.items) return;
  const change = changes.get(assetId);
  if (!change || storedNumber.value !== change.oldNumber || storedNumber.value === change.newNumber) return;
  replacements.push({ start: storedNumber.start, end: storedNumber.end, number: change.newNumber });
}

/** Only these explicit binding fields are eligible; prompt/content/args JSON strings are opaque. */
function collectBindingNumbers(
  record: JsonNode | undefined,
  changes: NumberChanges,
  replacements: NumberReplacement[],
): void {
  collectNumberReplacement(record, 'appliedFullPromptId', 'appliedFullPromptDisplayNumber', changes, replacements);
  collectNumberReplacement(record?.fields?.get('assetTrace'), 'fullPromptId', 'fullPromptDisplayNumber', changes, replacements);
}

type SnapshotFormat = 'workshop' | 'assistantTurn' | 'assistantAction';

function replaceSnapshotNumbers(text: string, format: SnapshotFormat, changes: NumberChanges): string | null {
  const root = parseJsonNodes(text);
  if (!root) return null;
  const replacements: NumberReplacement[] = [];
  if (format === 'assistantAction') {
    collectBindingNumbers(root, changes, replacements);
  } else {
    for (const item of root.fields?.get('items')?.items || []) {
      if (format === 'workshop') collectBindingNumbers(item, changes, replacements);
      else if (item.fields?.get('kind')?.value === 'toolResult') {
        collectBindingNumbers(item.fields?.get('action'), changes, replacements);
      }
    }
  }
  let result = text;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, replacement.start) + replacement.number + result.slice(replacement.end);
  }
  return result;
}

const SNAPSHOT_TABLES = [
  { table: 'WorkshopWorkspace', column: 'snapshotJson', format: 'workshop', counter: 'workshopWorkspaces' },
  { table: 'WorkshopBatch', column: 'snapshotJson', format: 'workshop', counter: 'workshopBatches' },
  { table: 'AssistantTurn', column: 'snapshotJson', format: 'assistantTurn', counter: 'assistantTurns' },
  { table: 'AssistantTurnItem', column: 'actionJson', format: 'assistantAction', counter: 'assistantTurnItems' },
] as const;

/**
 * Run in the number-allocation transaction, once per reading workspace's own asset-ID map.
 * Missing bindings and deleted assets keep their history; revision, timestamps and media are untouched.
 */
export async function migrateFullPromptNumberSnapshots(
  db: Pick<Prisma.TransactionClient, '$executeRawUnsafe' | '$queryRawUnsafe'>,
  workspaceId: string,
  changes: NumberChanges,
): Promise<FullPromptNumberSnapshotMigrationStats> {
  if (!workspaceId.trim()) throw new Error('快照编号迁移缺少工作区 ID');
  for (const [assetId, change] of changes) {
    if (!assetId.trim() || !Number.isSafeInteger(change.newNumber) || change.newNumber < 1
      || (change.oldNumber !== null && (!Number.isSafeInteger(change.oldNumber) || change.oldNumber < 1))) {
      throw new Error('快照编号迁移映射无效');
    }
  }
  const stats: FullPromptNumberSnapshotMigrationStats = {
    workshopWorkspaces: 0,
    workshopBatches: 0,
    assistantTurns: 0,
    assistantTurnItems: 0,
    invalidJsonRows: 0,
  };
  if (changes.size === 0) return stats;
  const existing = await db.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('WorkshopWorkspace', 'WorkshopBatch', 'AssistantTurn', 'AssistantTurnItem')",
  );
  const tables = new Set(existing.map(table => table.name));
  for (const spec of SNAPSHOT_TABLES) {
    if (!tables.has(spec.table)) continue;
    const isItem = spec.table === 'AssistantTurnItem';
    if (isItem && !tables.has('AssistantTurn')) continue;
    // Both the item and its owning turn must belong to this reading workspace.
    const itemConstraint = isItem
      ? ` AND "kind" = 'toolResult' AND "turnId" IN (SELECT "id" FROM "AssistantTurn" WHERE "workspaceId" = ?)`
      : '';
    const workspaceParams = isItem ? [workspaceId, workspaceId] : [workspaceId];
    const rows = await db.$queryRawUnsafe<Array<{ id: string; json: string }>>(
      `SELECT "id", "${spec.column}" AS "json" FROM "${spec.table}" WHERE "workspaceId" = ? AND "${spec.column}" IS NOT NULL${itemConstraint}`,
      ...workspaceParams,
    );
    for (const row of rows) {
      const nextJson = replaceSnapshotNumbers(row.json, spec.format, changes);
      if (nextJson === null) {
        stats.invalidJsonRows++;
        continue;
      }
      if (nextJson === row.json) continue;
      // Identifiers come only from SNAPSHOT_TABLES; every data value remains a bound parameter.
      const updated = await db.$executeRawUnsafe(
        `UPDATE "${spec.table}" SET "${spec.column}" = ? WHERE "id" = ? AND "workspaceId" = ? AND "${spec.column}" = ?${itemConstraint}`,
        nextJson, row.id, workspaceId, row.json, ...(isItem ? [workspaceId] : []),
      );
      if (updated !== 1) throw new Error('快照编号迁移遇到并发修改，请重试事务');
      stats[spec.counter]++;
    }
  }
  return stats;
}
