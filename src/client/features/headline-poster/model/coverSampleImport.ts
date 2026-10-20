export const COVER_SAMPLE_MAX_IMAGES = 10;
export const COVER_SAMPLE_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const COVER_SAMPLE_MAX_ZIP_BYTES = 32 * 1024 * 1024;
export const COVER_SAMPLE_MAX_ENTRIES = 64;
export const COVER_SAMPLE_MAX_EXPANDED_BYTES = COVER_SAMPLE_MAX_IMAGE_BYTES * COVER_SAMPLE_MAX_IMAGES;
export const COVER_SAMPLE_MAX_RATIO = 80;

export interface CoverSampleDraft {
  id: string;
  name: string;
  source: string;
  file: File;
  previewUrl: string;
}

export interface CoverSampleSkip {
  name: string;
  reason: string;
}

export interface CoverSampleImportResult {
  drafts: CoverSampleDraft[];
  skipped: CoverSampleSkip[];
  error?: string;
}

export interface CoverImageSize {
  width: number;
  height: number;
}

interface ZipEntry {
  dir: boolean;
  uncompressedSize?: number;
  _data?: { uncompressedSize?: number; compressedSize?: number };
  async: (type: 'uint8array') => Promise<Uint8Array>;
}

type ZipReader = (buffer: ArrayBuffer) => Promise<{ files: Record<string, ZipEntry> }>;

let zipReader: ZipReader | undefined;

async function readZip(buffer: ArrayBuffer) {
  if (!zipReader) {
    const loaded = await import('jszip');
    const JSZip = loaded.default;
    zipReader = async (data) => JSZip.loadAsync(data) as Promise<{ files: Record<string, ZipEntry> }>;
  }
  return zipReader(buffer);
}

export function releaseCoverSampleDrafts(drafts: CoverSampleDraft[]) {
  for (const draft of drafts) {
    if (draft.previewUrl.startsWith('blob:')) URL.revokeObjectURL(draft.previewUrl);
  }
}

export async function importCoverSamples(
  files: File[],
  decode: (file: File) => Promise<CoverImageSize>,
  already = 0,
): Promise<CoverSampleImportResult> {
  const skipped: CoverSampleSkip[] = [];
  const collected: Array<Omit<CoverSampleDraft, 'previewUrl'>> = [];
  try {
    for (const file of files) {
      if (isZip(file)) await collectZip(file, collected, skipped, decode);
      else await collectImage(file, file.name, file.name, collected, skipped, decode);
    }
  } catch (error) {
    return { drafts: [], skipped, error: error instanceof Error ? error.message : '样张读取失败' };
  }
  if (collected.length === 0) {
    return { drafts: [], skipped, error: skipped[0] ? `没有可投喂的封面：${skipped[0].reason}` : '没有可投喂的封面图片' };
  }
  if (already + collected.length > COVER_SAMPLE_MAX_IMAGES) {
    return { drafts: [], skipped, error: `一次最多投喂 ${COVER_SAMPLE_MAX_IMAGES} 张封面，请减少后再投喂` };
  }
  return {
    drafts: collected.map((item) => ({ ...item, previewUrl: URL.createObjectURL(item.file) })),
    skipped,
  };
}

async function collectZip(file: File, collected: Array<Omit<CoverSampleDraft, 'previewUrl'>>, skipped: CoverSampleSkip[], decode: (file: File) => Promise<CoverImageSize>) {
  if (file.size > COVER_SAMPLE_MAX_ZIP_BYTES) throw new Error('压缩包超过 32MB，请减少图片后再投喂');
  let zip: { files: Record<string, ZipEntry> };
  try {
    zip = await readZip(await file.arrayBuffer());
  } catch {
    throw new Error('压缩包无法读取或已损坏');
  }
  const names = Object.keys(zip.files);
  if (names.length > COVER_SAMPLE_MAX_ENTRIES) throw new Error('压缩包条目过多');
  let declared = 0;
  for (const name of names) {
    if (unsafeZipPath(name)) throw new Error('压缩包包含不安全的路径');
    if (isNestedArchive(name)) throw new Error('压缩包里不能再包含压缩包');
    const entry = zip.files[name];
    if (entry.dir || skippedZipEntry(name)) continue;
    const size = zipEntrySize(entry);
    if (!size.uncompressed || size.uncompressed > COVER_SAMPLE_MAX_IMAGE_BYTES) throw new Error(`「${baseName(name)}」超过单张 20MB 限制或无法确认大小`);
    if (!size.compressed || size.uncompressed / size.compressed > COVER_SAMPLE_MAX_RATIO) throw new Error('压缩包的压缩比例异常');
    declared += size.uncompressed;
    if (declared > COVER_SAMPLE_MAX_EXPANDED_BYTES) throw new Error('压缩包展开后超过安全大小');
  }
  for (const name of names) {
    const entry = zip.files[name];
    if (entry.dir || skippedZipEntry(name) || !isImageName(name)) {
      if (!entry.dir && !skippedZipEntry(name) && !isNestedArchive(name)) skipped.push({ name: baseName(name), reason: '不是 JPG、PNG 或 WebP' });
      continue;
    }
    const bytes = await entry.async('uint8array');
    const size = zipEntrySize(entry);
    if (bytes.byteLength !== size.uncompressed || bytes.byteLength > COVER_SAMPLE_MAX_IMAGE_BYTES) throw new Error(`「${baseName(name)}」的实际大小与压缩包声明不一致`);
    const packed = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(packed).set(bytes);
    const image = new File([packed], baseName(name), { type: imageType(name) });
    await collectImage(image, baseName(name), `${file.name}/${name}`, collected, skipped, decode);
  }
}

async function collectImage(
  file: File,
  name: string,
  source: string,
  collected: Array<Omit<CoverSampleDraft, 'previewUrl'>>,
  skipped: CoverSampleSkip[],
  decode: (file: File) => Promise<CoverImageSize>,
) {
  if (!isImageName(name) && !isImageName(file.name)) {
    skipped.push({ name, reason: '不是 JPG、PNG 或 WebP' });
    return;
  }
  if (file.size <= 0 || file.size > COVER_SAMPLE_MAX_IMAGE_BYTES) {
    skipped.push({ name, reason: '图片为空或超过 20MB' });
    return;
  }
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!imageSignature(header, name)) {
    skipped.push({ name, reason: '文件内容不是受支持的图片' });
    return;
  }
  try {
    const size = await decode(file);
    if (size.width < 8 || size.height < 8 || size.width > 8000 || size.height > 8000) {
      skipped.push({ name, reason: '图片尺寸无法用于封面反推' });
      return;
    }
  } catch {
    skipped.push({ name, reason: '图片无法解码' });
    return;
  }
  collected.push({ id: `${source}:${file.size}:${collected.length}`, name, source, file });
}

function zipEntrySize(entry: ZipEntry) {
  return {
    uncompressed: entry.uncompressedSize || entry._data?.uncompressedSize || 0,
    compressed: entry._data?.compressedSize || entry.uncompressedSize || 0,
  };
}

function isZip(file: File) {
  return file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';
}

function isImageName(name: string) {
  return /\.(jpe?g|png|webp)$/i.test(name);
}

function isNestedArchive(name: string) {
  return /\.(zip|rar|7z)$/i.test(name);
}

function skippedZipEntry(name: string) {
  const parts = name.split('/');
  return parts.some((part) => part.startsWith('.') || part === '__MACOSX') || baseName(name) === '.DS_Store';
}

function unsafeZipPath(name: string) {
  return name.includes('\0') || name.includes('\\') || name.startsWith('/') || name.startsWith('../') || name.includes('/../') || name.includes(':');
}

function baseName(name: string) {
  return name.split('/').filter(Boolean).pop() || name;
}

function imageType(name: string) {
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.webp$/i.test(name)) return 'image/webp';
  return 'image/jpeg';
}

function imageSignature(bytes: Uint8Array, name: string) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (/\.png$/i.test(name)) return png;
  if (/\.webp$/i.test(name)) return webp;
  return jpeg;
}

export async function decodeCoverSample(file: File): Promise<CoverImageSize> {
  if (typeof createImageBitmap !== 'function') throw new Error('当前浏览器无法解码图片');
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}
