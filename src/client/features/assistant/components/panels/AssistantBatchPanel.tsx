import { useAppStore } from '@client/store';
import GenerationBatchPanel from '@client/shared/agent/GenerationBatchPanel';
import { assistantPromptSource } from '@client/shared/agent/generationBatchSources';

/** Stable message identity replaces the old body-text lookup. */
export function AssistantImageBatch({ sessionId, replyId, disabled = false }: { sessionId: string; replyId: string; disabled?: boolean }) {
  const session = useAppStore(state => state.assistantSessions.find(item => item.id === sessionId));
  const message = session?.messages.find(item => item.id === replyId);
  if (!session || !message) return null;
  const source = assistantPromptSource(session.messages, message, sessionId);
  return <GenerationBatchPanel key={source.sourceId} source={source} disabled={disabled || Boolean(message.error)} />;
}
