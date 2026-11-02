CREATE INDEX IF NOT EXISTS "CoverMemoryEntry_sample_status_idx" ON "CoverMemoryEntry"("workspaceId", "sampleId", "status");
CREATE INDEX IF NOT EXISTS "CoverMemorySample_page_idx" ON "CoverMemorySample"("workspaceId", "createdAt" DESC, "id" DESC);
