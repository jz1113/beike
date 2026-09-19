// Versioned desktop equivalent of 20260913010000_library_order_indexes.
export const libraryIndexSql = `
CREATE INDEX IF NOT EXISTS "SceneAsset_library_order_idx" ON "SceneAsset"("isFavorite" DESC, "usageCount" DESC, "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "OutfitAsset_library_order_idx" ON "OutfitAsset"("isFavorite" DESC, "usageCount" DESC, "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "ActionAsset_library_order_idx" ON "ActionAsset"("isFavorite" DESC, "usageCount" DESC, "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "PersonaAsset_library_order_idx" ON "PersonaAsset"("isFavorite" DESC, "usageCount" DESC, "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "FullPromptAsset_library_order_idx" ON "FullPromptAsset"("isFavorite" DESC, "usageCount" DESC, "createdAt" DESC, "id" DESC);
`;
