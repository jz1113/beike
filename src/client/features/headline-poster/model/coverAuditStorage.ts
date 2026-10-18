export interface MemoryAuditRecord {
  id: string;
  timestamp: number;
  styleName: string;
  itemTitle: string;
  adoptedRules: string[];
  blockedNegatives: string[];
}

export interface TrashItem {
  id: string;
  type: 'correction' | 'case' | 'style';
  title: string;
  deletedAt: number;
  data: unknown;
}

const STORAGE_KEY_AUDIT = 'beike:cover-memory-audit:v1';
const STORAGE_KEY_TRASH = 'beike:cover-memory-trash:v1';

export function getMemoryAuditRecords(): MemoryAuditRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUDIT);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function logMemoryAudit(record: Omit<MemoryAuditRecord, 'id' | 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  try {
    const records = getMemoryAuditRecords();
    const newRecord: MemoryAuditRecord = {
      ...record,
      id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
    };
    records.unshift(newRecord);
    localStorage.setItem(STORAGE_KEY_AUDIT, JSON.stringify(records.slice(0, 100)));
  } catch (err) {
    console.error('Failed to log memory audit', err);
  }
}

export function getTrashItems(): TrashItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRASH);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function moveToTrash(item: Omit<TrashItem, 'deletedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const trash = getTrashItems();
    trash.unshift({ ...item, deletedAt: Date.now() });
    localStorage.setItem(STORAGE_KEY_TRASH, JSON.stringify(trash.slice(0, 50)));
  } catch (err) {
    console.error('Failed to move to trash', err);
  }
}

export function clearTrash(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY_TRASH);
  } catch (err) {
    console.error('Failed to clear trash', err);
  }
}
