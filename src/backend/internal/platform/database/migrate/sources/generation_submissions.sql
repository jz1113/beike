CREATE TABLE "GenerationSubmission" (
    "id" TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "httpStatus" INTEGER NOT NULL DEFAULT 0,
    "response" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    UNIQUE("workspaceId", "kind", "operationKey")
);
