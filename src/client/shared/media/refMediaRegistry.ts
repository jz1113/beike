import { isVideoFile, type RefMediaKind } from '../api/mediaUpload';

const g = (typeof window !== 'undefined' ? window : globalThis) as any;
if (!g.__beike_ref_files__) {
  g.__beike_ref_files__ = new Map<string, File>();
  g.__beike_ref_kinds__ = new Map<string, RefMediaKind>();
  g.__beike_ref_names__ = new Map<string, string>();
}

const files: Map<string, File> = g.__beike_ref_files__;
const kinds: Map<string, RefMediaKind> = g.__beike_ref_kinds__;
const names: Map<string, string> = g.__beike_ref_names__;
const identities: Map<string, string> = g.__beike_ref_identities__ ||= new Map<string, string>();

/** Identity follows the URL through reordering and duplicate filenames. */
export function getRefMediaIdentity(url: string): string {
  let id = identities.get(url);
  if (!id) {
    id = `media-${globalThis.crypto.randomUUID()}`;
    identities.set(url, id);
  }
  return id;
}

export function resolveRefMediaIdentity(id: string): string | undefined {
  for (const [url, identity] of identities) if (identity === id) return url;
  return undefined;
}

export function registerRefMedia(url: string, file: File, origName?: string): void {
  files.set(url, file);
  kinds.set(url, isVideoFile(file) ? 'video' : 'image');
  const cleanName = (origName || file.name || '').replace(/\.[^/.]+$/, '').trim();
  if (cleanName) {
    names.set(url, cleanName);
  }
}

export function registerRefMediaName(url: string, name: string): void {
  const cleanName = (name || '').replace(/\.[^/.]+$/, '').trim();
  if (cleanName) {
    names.set(url, cleanName);
  }
}

export function unregisterRefMedia(url: string): void {
  files.delete(url);
  kinds.delete(url);
  names.delete(url);
}

export function resolveRefMediaFile(url: string): File | undefined {
  return files.get(url);
}

export function resolveRefMediaKind(url: string): RefMediaKind | undefined {
  return kinds.get(url);
}

export function resolveRefMediaName(url: string): string | undefined {
  return names.get(url) || files.get(url)?.name?.replace(/\.[^/.]+$/, '').trim();
}

export function revokeRefMediaBlobUrls(): void {
  files.forEach((_, url) => {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  });
}

export function clearRefMediaRegistry(): void {
  revokeRefMediaBlobUrls();
  files.clear();
  kinds.clear();
  names.clear();
  identities.clear();
}

export function snapshotRefMediaFiles(): Map<string, File> {
  return new Map(files);
}
