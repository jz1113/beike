ALTER TABLE "SalesReferenceScript" ADD COLUMN "analysisKey" TEXT NOT NULL DEFAULT '';
CREATE INDEX "SalesReferenceScript_analysis" ON "SalesReferenceScript"("workspaceId","videoHash","promptVersion","analysisKey");
CREATE TABLE "SalesMediaJob" (
  "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "kind" TEXT NOT NULL, "name" TEXT NOT NULL,
  "inputKey" TEXT NOT NULL, "status" TEXT NOT NULL, "createdAt" TEXT NOT NULL,
  "startedAt" TEXT NOT NULL DEFAULT '', "updatedAt" TEXT NOT NULL, "result" TEXT NOT NULL DEFAULT '{}',
  "error" TEXT NOT NULL DEFAULT '', "retryInput" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX "SalesMediaJob_workspace" ON "SalesMediaJob"("workspaceId","createdAt");
CREATE UNIQUE INDEX "SalesMediaJob_active" ON "SalesMediaJob"("workspaceId","inputKey") WHERE "status" IN ('queued','running');
