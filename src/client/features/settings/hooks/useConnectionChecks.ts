import { useEffect, useRef, useState } from 'react';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { sameConnectionInputs, type ConnectionTestOutcome, type ConnectionTestRecord } from '../model/connectionStatus';

/** Session-only results. Changing credentials/address invalidates evidence; never persist secrets or test results. */
export function useConnectionChecks(inputs: Record<string, readonly unknown[]>, showToast: (message: string) => void, active = true) {
  const [records, setRecords] = useState<Record<string, { inputs: readonly unknown[]; version: number; result: ConnectionTestRecord }>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const pending = useRef(new Map<string, object>());
  const latest = useRef(inputs);
  const inputVersions = useRef<Record<string, number>>({});
  for (const [id, values] of Object.entries(inputs)) {
    if (!sameConnectionInputs(values, latest.current[id] ?? [])) inputVersions.current[id] = (inputVersions.current[id] || 0) + 1;
  }
  latest.current = inputs;
  const session = useRef(0);
  useEffect(() => {
    const requests = pending.current;
    session.current += 1;
    requests.clear();
    setTesting({});
    setRecords({});
    return () => { session.current += 1; requests.clear(); };
  }, [active]);
  const run = async (id: string, test: () => Promise<ConnectionTestOutcome>) => {
    if (!active || pending.current.has(id)) return;
    const request = {};
    pending.current.set(id, request);
    const snapshot = [...(inputs[id] ?? [])];
    const currentSession = session.current;
    const version = inputVersions.current[id] || 0;
    setTesting(previous => ({ ...previous, [id]: true }));
    let outcome: ConnectionTestOutcome;
    try { outcome = await test(); }
    catch (error) { outcome = { ok: false, message: formatUserError(error, '连接测试失败') }; }
    finally {
      if (currentSession === session.current && pending.current.get(id) === request) {
        pending.current.delete(id);
        setTesting(previous => ({ ...previous, [id]: false }));
      }
    }
    if (currentSession !== session.current || version !== (inputVersions.current[id] || 0)) return;
    setRecords(previous => ({ ...previous, [id]: { inputs: snapshot, version, result: { ...outcome, checkedAt: Date.now() } } }));
    if (sameConnectionInputs(snapshot, latest.current[id] ?? [])) showToast(outcome.message);
  };
  const results = Object.fromEntries(Object.entries(records).filter(([id, record]) =>
    record.version === (inputVersions.current[id] || 0) && sameConnectionInputs(record.inputs, inputs[id] ?? [])).map(([id, record]) => [id, record.result]));
  return { run, testing, results };
}
