CREATE TABLE "CollectionCache" (
  "key" TEXT PRIMARY KEY,
  "payload" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL DEFAULT 0
);
