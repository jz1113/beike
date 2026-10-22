CREATE TABLE "CategorySkillScope" (
 "workspaceId" TEXT NOT NULL, "folderId" TEXT NOT NULL,
 "autoAnalyze" INTEGER NOT NULL DEFAULT 0, "autoPublish" INTEGER NOT NULL DEFAULT 0,
 "minSamples" INTEGER NOT NULL DEFAULT 20,
 "activeVersionId" TEXT NOT NULL DEFAULT '', "trialVersionId" TEXT NOT NULL DEFAULT '', "comparisonVersionId" TEXT NOT NULL DEFAULT '',
 "revision" INTEGER NOT NULL DEFAULT 0,
 "runningToken" TEXT NOT NULL DEFAULT '', "runningAt" TEXT NOT NULL DEFAULT '',
 "progress" INTEGER NOT NULL DEFAULT 0, "lastAttempt" TEXT NOT NULL DEFAULT '', "error" TEXT NOT NULL DEFAULT '',
 PRIMARY KEY ("workspaceId","folderId")
);
CREATE TABLE "CategorySkillObservation" (
 "workspaceId" TEXT NOT NULL, "folderId" TEXT NOT NULL, "groupId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "observationJson" TEXT NOT NULL, "model" TEXT NOT NULL, "createdAt" TEXT NOT NULL,
 PRIMARY KEY ("workspaceId","folderId","groupId","fingerprint")
);
CREATE TABLE "CategorySkillSampleRole" (
 "workspaceId" TEXT NOT NULL, "folderId" TEXT NOT NULL, "groupId" TEXT NOT NULL, "role" TEXT NOT NULL,
 PRIMARY KEY ("workspaceId","folderId","groupId")
);
CREATE TABLE "CategorySkillVersion" (
 "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "folderId" TEXT NOT NULL,
 "parentVersionId" TEXT NOT NULL, "sourceFingerprint" TEXT NOT NULL,
 "manifestJson" TEXT NOT NULL, "promptSnippet" TEXT NOT NULL, "summary" TEXT NOT NULL,
 "model" TEXT NOT NULL, "createdAt" TEXT NOT NULL
);
CREATE INDEX "CategorySkillVersion_scope_idx" ON "CategorySkillVersion"("workspaceId","folderId","createdAt");
CREATE TABLE "CategorySkillFeedback" (
 "workspaceId" TEXT NOT NULL, "folderId" TEXT NOT NULL, "versionId" TEXT NOT NULL,
 "taskId" TEXT NOT NULL, "comparisonKey" TEXT NOT NULL, "groupId" TEXT NOT NULL,
 "decision" TEXT NOT NULL, "scoresJson" TEXT NOT NULL, "note" TEXT NOT NULL, "evidenceJson" TEXT NOT NULL DEFAULT '{}', "createdAt" TEXT NOT NULL,
 PRIMARY KEY ("workspaceId","taskId")
);
CREATE INDEX "CategorySkillFeedback_scope_idx" ON "CategorySkillFeedback"("workspaceId","folderId","versionId");
CREATE TABLE "CategorySkillEvent" (
 "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "folderId" TEXT NOT NULL,
 "versionId" TEXT NOT NULL DEFAULT '', "eventType" TEXT NOT NULL, "detail" TEXT NOT NULL, "createdAt" TEXT NOT NULL
);
