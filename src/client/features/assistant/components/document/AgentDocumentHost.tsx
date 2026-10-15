import { useEffect, useState } from 'react';
import DocumentViewerModal from './DocumentViewerModal';
import { subscribeAgentDocument, type AgentDocumentPayload } from '@client/shared/ui/agentDocumentBus';

export default function AgentDocumentHost() {
  const [document, setDocument] = useState<AgentDocumentPayload | null>(null);
  useEffect(() => subscribeAgentDocument(setDocument), []);
  if (!document) return null;
  return (
    <DocumentViewerModal
      filename={document.filename}
      content={document.content}
      createdAt={document.createdAt}
      onClose={() => setDocument(null)}
    />
  );
}
