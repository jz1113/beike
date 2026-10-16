/** Only a recorded development process with matching command, start time and workspace may be stopped. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function canonicalRoot(root) { return realpathSync(root); }
function recordPath(root, isolated) {
  return join(root, '.local', isolated ? 'isolated-web-processes.json' : 'web-processes.json');
}

function samePath(a, b) {
  if (!a || !b) return false;
  if (process.platform === 'win32') {
    return resolve(a).toLowerCase().replaceAll('/', '\\') === resolve(b).toLowerCase().replaceAll('/', '\\');
  }
  return a === b;
}

function processInfo(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (process.platform === 'win32') {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command',
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if($p){$p | Select-Object CommandLine,CreationDate | ConvertTo-Json -Compress}`], { encoding: 'utf8' });
    try {
      const value = JSON.parse(result.stdout);
      if (typeof value.CommandLine !== 'string' || !value.CreationDate) return null;
      return { command: value.CommandLine, started: value.CreationDate, cwd: null };
    } catch { return null; }
  }
  // Keep dates in English while preserving Unicode workspace paths in ps output.
  const locale = process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8';
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command='], { encoding: 'utf8', env: { ...process.env, LC_ALL: locale } });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  const line = result.stdout.trim();
  const match = /^(.{24})\s+(.+)$/.exec(line);
  if (!match) return null;
  let cwd;
  try {
    if (process.platform === 'linux') cwd = readlinkSync(`/proc/${pid}/cwd`);
    else {
      const result = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' });
      cwd = result.stdout.split('\n').find(line => line.startsWith('n'))?.slice(1);
    }
    if (!cwd) return null;
    cwd = realpathSync(cwd);
  } catch { return null; }
  return { started: match[1], command: match[2], cwd };
}

function readRecords(root, isolated) {
  try {
    const value = JSON.parse(readFileSync(recordPath(root, isolated), 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}

function writeRecords(root, isolated, records) {
  mkdirSync(join(root, '.local'), { recursive: true });
  const destination = recordPath(root, isolated);
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(records), { mode: 0o600 });
    renameSync(temporary, destination);
  } finally { rmSync(temporary, { force: true }); }
}

function matches(root, kind, record, options) {
  if (!record || !samePath(record.root, canonicalRoot(root))) return false;
  for (const [key, value] of Object.entries(options)) if (record[key] !== value) return false;
  const info = processInfo(record.pid);
  if (!info || info.started !== record.started || (info.cwd !== null && !samePath(info.cwd, record.root))) return false;
  if (kind !== 'gateway' && kind !== 'vite') return false;
  const canonical = canonicalRoot(root);
  const marker = kind === 'gateway'
    ? resolve(canonical, 'tools/build/beike-api')
    : resolve(canonical, 'vite.config.ts');
  if (process.platform === 'win32') {
    const normalize = (s) => s.toLowerCase().replaceAll('/', '\\');
    return normalize(info.command).includes(normalize(marker));
  }
  return info.command.includes(marker);
}

export function ownsWebProcess(root, kind, options = {}, isolated = false) {
  return matches(root, kind, readRecords(root, isolated)[kind], options);
}

export function recordWebProcess(root, kind, child, options = {}, isolated = false) {
  child.once('spawn', () => {
    const info = processInfo(child.pid);
    if (!info) return;
    const records = readRecords(root, isolated);
    records[kind] = { ...options, root: canonicalRoot(root), pid: child.pid, started: info.started };
    try { writeRecords(root, isolated, records); }
    catch {
      child.kill('SIGTERM');
      console.error('✗ 本项目进程记录写入失败，请检查 .local 目录权限后重试');
    }
  });
  child.once('exit', () => {
    const records = readRecords(root, isolated);
    if (records[kind]?.pid !== child.pid) return;
    delete records[kind];
    try { writeRecords(root, isolated, records); } catch { /* Stale records fail ownership checks. */ }
  });
}

export async function stopWebProcess(root, kind, isolated = false) {
  const records = readRecords(root, isolated);
  const record = records[kind];
  if (!matches(root, kind, record, {})) return false;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/F', '/T', '/PID', String(record.pid)], { stdio: 'ignore' });
    if (result.status !== 0) return false;
  } else {
    try { process.kill(record.pid, 'SIGTERM'); } catch { return false; }
  }
  // Wait only for this recorded process. Never select processes by port or a partial command.
  for (let i = 0; i < 30 && matches(root, kind, record, {}); i += 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (matches(root, kind, record, {})) throw new Error('本项目开发进程未退出，请手动关闭对应启动终端');
  const current = readRecords(root, isolated);
  if (current[kind]?.pid === record.pid) {
    delete current[kind];
    writeRecords(root, isolated, current);
  }
  return true;
}
