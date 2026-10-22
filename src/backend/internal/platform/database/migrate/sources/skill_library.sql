CREATE TABLE "SkillDocument" (
  "workspaceId" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "contentJson" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  PRIMARY KEY ("workspaceId", "id")
);
CREATE TABLE "SkillRevision" (
  "workspaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('assistant', 'workshop')),
  "skillId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "contentJson" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  PRIMARY KEY ("workspaceId", "kind", "skillId", "version")
);
CREATE TABLE "SkillImport" (
  "workspaceId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  PRIMARY KEY ("workspaceId", "sourceKey")
);
CREATE TABLE "SkillPreference" (
  "workspaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "isFavorite" INTEGER NOT NULL,
  PRIMARY KEY ("workspaceId", "kind", "skillId")
);
