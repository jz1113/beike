function triggerBrowserDownload(filename: string, data: Blob | Uint8Array) {
  const blobPart: BlobPart =
    data instanceof Blob
      ? data
      : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const blob = data instanceof Blob ? data : new Blob([blobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

export async function saveToDownloadDir(
  filename: string,
  data: Blob | Uint8Array,
): Promise<'browser'> {
  triggerBrowserDownload(sanitizeFilename(filename), data);
  return 'browser';
}
