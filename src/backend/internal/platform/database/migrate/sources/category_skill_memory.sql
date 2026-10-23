CREATE TABLE "CategorySkillNote" (
 "id" TEXT PRIMARY KEY NOT NULL,
 "workspaceId" TEXT NOT NULL, "folderId" TEXT NOT NULL,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('prefer', 'avoid')),
 "content" TEXT NOT NULL, "createdAt" TEXT NOT NULL
);
CREATE INDEX "CategorySkillNote_scope_idx" ON "CategorySkillNote"("workspaceId","folderId","createdAt","id");
