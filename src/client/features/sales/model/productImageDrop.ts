const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'heic', 'heif', 'jfif', 'gif', 'bmp', 'tif', 'tiff']);

export const PRODUCT_IMAGE_ACCEPT = 'image/*,.png,.jpg,.jpeg,.webp,.avif,.heic,.heif,.jfif,.gif,.bmp,.tif,.tiff';

export interface DroppedEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  file?: () => Promise<File>;
  readChildren?: () => Promise<DroppedEntry[]>;
}

const droppedPaths = new WeakMap<File, string>();

export function isProductImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  const base = file.name.split(/[/\\]/).pop() || file.name;
  if (!base || base.startsWith('.')) return false;
  if (file.type.startsWith('image/')) return true;
  const extension = base.toLowerCase().split('.').pop() || '';
  return IMAGE_EXTENSIONS.has(extension);
}

/** Directory readers return at most 100 entries per call. */
export async function readDirectoryChildren(readBatch: () => Promise<DroppedEntry[]>): Promise<DroppedEntry[]> {
  const children: DroppedEntry[] = [];
  for (;;) {
    const batch = await readBatch();
    if (batch.length === 0) return children;
    children.push(...batch);
  }
}

export async function collectDroppedFiles(entries: DroppedEntry[]): Promise<File[]> {
  const files: File[] = [];
  const walk = async (entry: DroppedEntry, path: string) => {
    if (entry.isFile) {
      if (!entry.file) return;
      try {
        const file = await entry.file();
        droppedPaths.set(file, path);
        files.push(file);
      } catch {
        /* unreadable entries are skipped */
      }
      return;
    }
    if (!entry.isDirectory || !entry.readChildren) return;
    for (const child of await entry.readChildren()) {
      await walk(child, `${path}/${child.name}`);
    }
  };
  for (const entry of entries) await walk(entry, entry.name);
  return files;
}

export function productImageFiles(files: File[]): File[] {
  return files
    .filter(isProductImageFile)
    .sort((left, right) => droppedPath(left).localeCompare(droppedPath(right), 'zh', { numeric: true, sensitivity: 'base' }));
}

export async function imagesFromDroppedEntries(entries: DroppedEntry[], fallback: File[] = []): Promise<File[]> {
  try {
    const walked = entries.length ? await collectDroppedFiles(entries) : [];
    const images = productImageFiles(walked);
    if (images.length > 0) return images;
  } catch {
    /* fall through to the flat file list */
  }
  return productImageFiles(fallback);
}

type EntryItem = DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null };

function toDroppedEntry(entry: FileSystemEntry): DroppedEntry {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return {
      name: entry.name,
      isFile: true,
      isDirectory: false,
      file: () => new Promise((resolve, reject) => fileEntry.file(resolve, reject)),
    };
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  return {
    name: entry.name,
    isFile: false,
    isDirectory: true,
    readChildren: () => readDirectoryChildren(() => new Promise((resolve) => {
      reader.readEntries((batch) => resolve(Array.from(batch).map(toDroppedEntry)), () => resolve([]));
    })),
  };
}

/** Snapshot directory entries during the drop event, then read files asynchronously. */
export function imagesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const entries: DroppedEntry[] = [];
  for (const item of Array.from(dataTransfer.items || [])) {
    if (item.kind !== 'file') continue;
    const entry = (item as EntryItem).webkitGetAsEntry?.() ?? null;
    if (entry) entries.push(toDroppedEntry(entry));
  }
  return imagesFromDroppedEntries(entries, Array.from(dataTransfer.files || []));
}

function droppedPath(file: File): string {
  return droppedPaths.get(file) || (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}
