export interface AgentDocumentPayload {
  filename: string;
  content: string;
  createdAt?: number;
}

type Listener = (document: AgentDocumentPayload | null) => void;
const listeners = new Set<Listener>();

export function openAgentDocument(document: AgentDocumentPayload) {
  listeners.forEach((listener) => listener(document));
}

export function subscribeAgentDocument(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
