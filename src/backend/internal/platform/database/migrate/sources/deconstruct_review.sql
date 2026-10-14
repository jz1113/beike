CREATE TABLE IF NOT EXISTS "DeconstructReview" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "albumName" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TEXT NOT NULL
);