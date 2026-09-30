import { useCallback, useEffect, useRef } from 'react';

type OperationKind = 'parse' | 'extract';
type Operation = { kind: OperationKind; session: symbol; controller: AbortController };

/** Locks take effect synchronously; a result must still belong to the currently open material session. */
export function useStyleExtractSession(key: string, isOpen: boolean) {
  const current = useRef({ key, token: Symbol(), isOpen });
  const running = useRef<Partial<Record<OperationKind, Operation>>>({});
  if (current.current.key !== key) current.current = { key, token: Symbol(), isOpen };
  current.current.isOpen = isOpen;

  const active = useCallback((token: symbol | null) => Boolean(token && current.current.isOpen && current.current.token === token), []);
  const capture = useCallback(() => current.current.isOpen ? current.current.token : null, []);
  const isCurrent = useCallback((operation: Operation) => active(operation.session) &&
    running.current[operation.kind] === operation && !operation.controller.signal.aborted, [active]);
  const begin = useCallback((kind: OperationKind): Operation | null => {
    if (!current.current.isOpen) return null;
    const previous = running.current[kind];
    if (previous && isCurrent(previous)) return null;
    previous?.controller.abort();
    const operation = { kind, session: current.current.token, controller: new AbortController() };
    running.current[kind] = operation;
    return operation;
  }, [isCurrent]);
  const finish = useCallback((operation: Operation) => {
    const visible = isCurrent(operation);
    if (running.current[operation.kind] === operation) delete running.current[operation.kind];
    return visible;
  }, [isCurrent]);

  useEffect(() => {
    const token = current.current.token;
    const operations = running.current;
    current.current.isOpen = isOpen;
    for (const operation of Object.values(operations)) {
      if (operation.session !== token) operation.controller.abort();
    }
    return () => {
      if (current.current.token === token) current.current.isOpen = false;
      for (const operation of Object.values(operations)) {
        if (operation.session === token) operation.controller.abort();
      }
    };
  }, [isOpen, key]);

  return { active, capture, isCurrent, begin, finish };
}
