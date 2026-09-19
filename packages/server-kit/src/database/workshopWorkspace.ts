export const workshopWorkspaceSql = `CREATE TABLE IF NOT EXISTS "WorkshopWorkspace" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "snapshotJson" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
)`;
