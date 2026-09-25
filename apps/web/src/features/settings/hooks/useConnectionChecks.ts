import { useRef, useState } from 'react';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { sameConnectionInputs, type ConnectionTestOutcome, type ConnectionTestRecord } from '../connectionStatus';

/** Session-only results. Changing credentials/address invalidates evidence; never persist secrets or test results. */
export function useConnectionChecks(inputs: Record<string, readonly unknown[]>, showToast: (message: string) => void) {
  const [records, setRecords] = useState<Record<string, { inputs: readonly unknown[]; result: ConnectionTestRecord }>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const pending = useRef(new Set<string>());
  const latest = useRef(inputs);
  latest.current = inputs;
  const run = async (id: string, test: () => Promise<ConnectionTestOutcome>) => {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    const snapshot = [...(inputs[id] ?? [])];
    setTesting(previous => ({ ...previous, [id]: true }));
    let outcome: ConnectionTestOutcome;
    try { outcome = await test(); }
    catch (error) { outcome = { ok: false, message: formatUserError(error, '连接测试失败') }; }
    finally { pending.current.delete(id); setTesting(previous => ({ ...previous, [id]: false })); }
    setRecords(previous => ({ ...previous, [id]: { inputs: snapshot, result: { ...outcome, checkedAt: Date.now() } } }));
    if (sameConnectionInputs(snapshot, latest.current[id] ?? [])) showToast(outcome.message);
  };
  const results = Object.fromEntries(Object.entries(records).filter(([id, record]) =>
    sameConnectionInputs(record.inputs, inputs[id] ?? [])).map(([id, record]) => [id, record.result]));
  return { run, testing, results };
}
