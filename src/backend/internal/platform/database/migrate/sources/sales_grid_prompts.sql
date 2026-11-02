DELETE FROM "SalesPromptOverride"
WHERE "promptId" IN (
  'persona-face', 'persona-side', 'persona-front',
  'scene-left', 'scene-right', 'scene-reverse'
);
