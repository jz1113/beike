import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import { buildBrowserArchive } from "../exportBrowserArchive";
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
it("exports named business drafts without exporting credentials", async () => {
  localStorage.setItem("ai_api_key", "secret-do-not-export");
  localStorage.setItem("drawing_sessions", '[{"id":"session-1"}]');
  sessionStorage.setItem("workshop_studio_draft", '{"product":{"id":"p"}}');
  const archive = await buildBrowserArchive();
  expect(archive.localStorage.drawing_sessions).toContain("session-1");
  expect(archive.sessionStorage.workshop_studio_draft).toContain("product");
  expect(JSON.stringify(archive)).not.toContain("secret-do-not-export");
});
it("reports ephemeral media references instead of declaring them migrated", async () => {
  localStorage.setItem(
    "beike_canvas_projects_store",
    '{"url":"blob:temporary"}',
  );
  expect((await buildBrowserArchive()).warnings).toHaveLength(1);
});
