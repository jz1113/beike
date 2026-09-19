/** Export only named business stores. Never enumerate credentials or .env data. */
const localKeys = [
  "drawing_all_generations",
  "drawing_sessions",
  "drawing_current_session_id",
  "ai_assistant_sessions",
  "ai_assistant_current_session_id",
  "beike_canvas_projects_store",
  "beike_canvas_projects_snapshot",
  "beike_canvas_trash",
];
const sessionKeys = [
  "workshop_studio_draft",
  "workshop_social_draft",
  "workshop_original_draft",
  "buyer_show_studio_draft",
  "buyer_show_social_draft",
  "buyer_show_original_draft",
];
function collect(storage: Storage, keys: string[]) {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = storage.getItem(key);
      return value === null ? [] : [[key, value]];
    }),
  );
}
async function canvasDatabase(): Promise<Record<string, unknown[]>> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("beike-canvas-projects");
    let missing = false;
    request.onupgradeneeded = () => {
      missing = true;
      request.transaction?.abort();
    };
    request.onerror = () => (missing ? resolve({}) : reject(request.error));
    request.onsuccess = () => {
      const db = request.result;
      const names = ["projects", "meta"].filter((name) =>
        db.objectStoreNames.contains(name),
      );
      if (!names.length) {
        db.close();
        resolve({});
        return;
      }
      const transaction = db.transaction(names, "readonly");
      const result: Record<string, unknown[]> = {};
      for (const name of names) {
        const store = transaction.objectStore(name);
        const entries: unknown[] = [];
        result[name] = entries;
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const value = cursor.result;
          if (value) {
            entries.push({ key: value.key, value: value.value });
            value.continue();
          }
        };
      }
      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error("画布导出已中断"));
      };
    };
  });
}
export async function buildBrowserArchive() {
  const archive = {
    kind: "beike-browser-export",
    version: 1,
    createdAt: new Date().toISOString(),
    localStorage: collect(localStorage, localKeys),
    sessionStorage: collect(sessionStorage, sessionKeys),
    indexedDB: { "beike-canvas-projects": await canvasDatabase() },
    warnings: [] as string[],
  };
  const raw = JSON.stringify(archive);
  if (raw.includes("blob:"))
    archive.warnings.push(
      "存在临时 blob 媒体引用；此导出保留引用但不包含二进制，迁移前必须另存原文件。",
    );
  return archive;
}
export async function downloadBrowserArchive() {
  const archive = await buildBrowserArchive();
  const blob = new Blob([JSON.stringify(archive)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `beike-browser-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return archive.warnings;
}
