import { createHash } from 'node:crypto';
import { mkdir, writeFile, chmod, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { MAX_PROXY_BYTES } from '../network/safeUrl';
import { isWorkspaceStorageRel, resolveStorageRoot, safeResolveWithinRoot, toWorkspaceStorageKey } from './storagePaths';
import { requireWorkspaceId } from '../workspace/workspaceContext';

/** Job uploads stay in private workspace storage, never in queue JSON or public static files. */
export async function persistDeconstructJobImage(input: string): Promise<string> {
  if (input.startsWith('/storage/')) {
    if (input.length > 8192) throw new Error('图片存储引用过长');
    const relative = decodeURIComponent(input.slice('/storage/'.length));
    if (relative.includes('\\') || relative.split('/').some(segment => segment === '..' || segment === '.')
      || !isWorkspaceStorageRel(relative, requireWorkspaceId()) || !safeResolveWithinRoot(resolveStorageRoot(), relative)) {
      throw new Error('图片存储引用不属于当前工作区');
    }
    return input;
  }
  if (!input.startsWith('data:')) {
    if (input.length > 8192) throw new Error('图片链接过长');
    if (!/^https?:\/\//i.test(input)) throw new Error('请提供图片链接或本地上传图片');
    return input;
  }
  const match = /^data:image\/(png|jpe?g|webp|gif|avif|heic|heif);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(input);
  if (!match) throw new Error('本地图片格式无效');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_PROXY_BYTES) throw new Error('本地图片过大');
  const extension = /jpe?g/i.test(match[1]) ? 'jpg' : match[1].toLowerCase();
  const relative = toWorkspaceStorageKey(`deconstruct-inputs/${createHash('sha256').update(bytes).digest('hex')}.${extension}`);
  return writeJobFile(relative, bytes);
}

async function writeJobFile(relative: string, bytes: Buffer) {
  const configuredRoot = resolveStorageRoot();
  await mkdir(configuredRoot, { recursive: true, mode: 0o700 });
  const root = await realpath(configuredRoot);
  const segments = path.dirname(relative).split('/');
  for (let count = 1; count <= segments.length; count++) {
    const directory = safeResolveWithinRoot(root, segments.slice(0, count).join('/'));
    if (!directory) throw new Error('图片存储路径无效');
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  const resolved = safeResolveWithinRoot(root, relative);
  const safeDirectory = safeResolveWithinRoot(root, path.dirname(relative));
  if (!resolved || !safeDirectory) throw new Error('图片存储路径无效');
  // Resolve the existing parent before opening a missing leaf, to reject symlink escapes.
  const destination = path.join(safeDirectory, path.basename(relative));
  try { await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  await chmod(destination, 0o600);
  return `/storage/${relative}`;
}

export function persistDeconstructJobResult(data: unknown) {
  const bytes = Buffer.from(JSON.stringify(data ?? null), 'utf8');
  const relative = toWorkspaceStorageKey(`deconstruct-results/${createHash('sha256').update(bytes).digest('hex')}.json`);
  return writeJobFile(relative, bytes);
}

export async function readDeconstructJobResult(reference: string): Promise<unknown> {
  const relative = reference.slice('/storage/'.length);
  const expected = `${requireWorkspaceId()}/deconstruct-results/`;
  if (!reference.startsWith('/storage/') || !relative.startsWith(expected)
    || !/^[a-f0-9]{64}\.json$/.test(relative.slice(expected.length))) throw new Error('反推结果存储引用无效');
  const destination = safeResolveWithinRoot(resolveStorageRoot(), relative);
  if (!destination) throw new Error('反推结果存储路径无效');
  return JSON.parse(await readFile(destination, 'utf8'));
}
