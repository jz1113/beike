ALTER TABLE "FullPromptAsset" ADD COLUMN "displayNumber" INTEGER;

CREATE TABLE "FullPromptDisplaySequence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "lastNumber" INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "FullPromptDisplaySequence" ("id", "lastNumber") VALUES ('full_prompt', 0);

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (
    ORDER BY "isFavorite" DESC, "usageCount" DESC, "createdAt" DESC, "id" DESC
  ) AS "number"
  FROM "FullPromptAsset"
  WHERE "groupIndex" IS NOT NULL OR "provenance" <> 'legacy_single'
)
UPDATE "FullPromptAsset"
SET "displayNumber" = (SELECT "number" FROM numbered WHERE numbered."id" = "FullPromptAsset"."id")
WHERE "id" IN (SELECT "id" FROM numbered);

UPDATE "FullPromptDisplaySequence"
SET "lastNumber" = COALESCE((SELECT MAX("displayNumber") FROM "FullPromptAsset"), 0)
WHERE "id" = 'full_prompt';

CREATE UNIQUE INDEX "FullPromptAsset_displayNumber_key" ON "FullPromptAsset"("displayNumber");
