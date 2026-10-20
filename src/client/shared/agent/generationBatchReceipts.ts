export interface GenerationBatchReceipt {
  sourceId: string; batchId: string; sessionId: string; taskIds: string[]; entryIds: string[]; createdAt: number;
}
const KEY = 'beike_agent_generation_receipts_v1';
type Journal = Record<string, GenerationBatchReceipt[]>;

function readJournal(): Journal {
  const raw = localStorage.getItem(KEY);
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('生成回执无法读取，已阻止重复提交');
  for (const [sourceId, receipts] of Object.entries(value)) {
    if (!Array.isArray(receipts) || receipts.some(item => !item || item.sourceId !== sourceId || typeof item.batchId !== 'string'
      || typeof item.sessionId !== 'string' || !Array.isArray(item.taskIds) || !item.taskIds.every((id: unknown) => typeof id === 'string')
      || !Array.isArray(item.entryIds) || !item.entryIds.every((id: unknown) => typeof id === 'string') || item.taskIds.length !== item.entryIds.length || !item.entryIds.length || !Number.isFinite(item.createdAt)
      || new Set(item.entryIds).size !== item.entryIds.length || new Set(item.taskIds).size !== item.taskIds.length)) throw new Error('生成回执已损坏，请先核实原任务，不能重新提交');
  }
  return value as Journal;
}

export function readGenerationBatchReceipts(sourceId: string): GenerationBatchReceipt[] {
  return readJournal()[sourceId] || [];
}

/** Must succeed before exposing new tasks to the global generation engine. */
export function reserveGenerationBatch(receipt: GenerationBatchReceipt): void {
  const journal = readJournal();
  const prior = journal[receipt.sourceId] || [];
  if (prior.some(item => item.entryIds.some(id => receipt.entryIds.includes(id)))) throw new Error('选中项已经提交，请查看原任务');
  journal[receipt.sourceId] = [...prior, receipt];
  try { localStorage.setItem(KEY, JSON.stringify(journal)); }
  catch { throw new Error('无法保存生成回执，已阻止提交；请检查浏览器存储空间'); }
}
