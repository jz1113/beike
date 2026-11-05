import { openDB } from 'idb';

/** Local asset IDs keep their graph references; their project-scoped files need an independent copy. */
export async function copyCanvasMedia(sourceId: string, targetId: string): Promise<void> {
  const sourcePrefix = `beike.studio.${sourceId}.`;
  const targetPrefix = `beike.studio.${targetId}.`;
  if (typeof indexedDB.databases !== 'function') throw new Error('当前浏览器无法复制本地画布素材');
  for (const item of await indexedDB.databases()) {
    if (!item.name?.startsWith(sourcePrefix)) continue;
    const source = await openDB(item.name);
    let target: Awaited<ReturnType<typeof openDB>> | undefined;
    try {
      target = await openDB(targetPrefix + item.name.slice(sourcePrefix.length), source.version, {
        upgrade(db) {
          for (const name of source.objectStoreNames) {
            const store = source.transaction(name).objectStore(name);
            const copy = db.createObjectStore(name, { keyPath: store.keyPath, autoIncrement: store.autoIncrement });
            for (const indexName of store.indexNames) {
              const index = store.index(indexName);
              copy.createIndex(indexName, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
            }
          }
        },
      });
      for (const name of source.objectStoreNames) {
        const read = source.transaction(name);
        const [keys, values] = await Promise.all([read.store.getAllKeys(), read.store.getAll()]);
        await read.done;
        const write = target.transaction(name, 'readwrite');
        for (let index = 0; index < keys.length; index++) {
          if (write.store.keyPath === null) await write.store.put(values[index], keys[index]);
          else await write.store.put(values[index]);
        }
        await write.done;
      }
    } finally { source.close(); target?.close(); }
  }
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (key.startsWith(sourcePrefix)) storage.setItem(targetPrefix + key.slice(sourcePrefix.length), storage.getItem(key)!);
    }
  }
}
