import { db } from './access';

export type PersistedItemFields = {
  kind: string; status: string; content: string; reasoning: string;
  toolName: string | null; displayName: string | null; argsJson: string;
  summary: string | null; actionJson: string | null; visualImagesJson: string | null;
  metaJson: string;
};

export async function upsertAssistantTurnItem(itemId: string, turnId: string, createdAt: number, fields: PersistedItemFields) {
  await db.assistantTurnItem.upsert({
    where: { id: itemId },
    create: {
      id: itemId,
      turnId: turnId,
      kind: fields.kind,
      status: fields.status,
      startedAt: new Date(createdAt),
      completedAt:
        fields.status === 'done' || fields.status === 'error' || fields.status === 'cancelled'
          ? new Date()
          : null,
      content: fields.content,
      reasoning: fields.reasoning,
      toolName: fields.toolName,
      displayName: fields.displayName,
      argsJson: fields.argsJson,
      summary: fields.summary,
      actionJson: fields.actionJson,
      visualImagesJson: fields.visualImagesJson,
      metaJson: fields.metaJson,
    },
    update: {
      status: fields.status,
      completedAt:
        fields.status === 'done' || fields.status === 'error' || fields.status === 'cancelled'
          ? new Date()
          : null,
      content: fields.content,
      reasoning: fields.reasoning,
      summary: fields.summary,
      actionJson: fields.actionJson,
      visualImagesJson: fields.visualImagesJson,
    },
  });
}
