/** Shared local Go selection for builds, migrations and quality checks. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const env = () => ({ ...process.env, GOTOOLCHAIN: 'local' });

function supportsVersion(output, minimum) {
  const version = /^go version go(\d+)\.(\d+)(?:\.(\d+))?\s/.exec(output.trim());
  if (!version) return false;
  const parts = version.slice(1).map(value => Number(value || 0));
  for (let i = 0; i < minimum.length; i++) {
    if (parts[i] !== minimum[i]) return parts[i] > minimum[i];
  }
  return true;
}

export function resolveGo() {
  const required = /^go (\d+)\.(\d+)(?:\.(\d+))?$/m.exec(readFileSync(join(root, 'go.mod'), 'utf8'));
  if (!required) throw new Error('go.mod 缺少 Go 版本要求');
  const minimum = required.slice(1).map(value => Number(value || 0));
  const configured = process.env.GO_BIN?.trim();
  const candidates = configured ? [configured] : [
    'go',
    join(homedir(), '.local/go/bin/go'),
    ...(process.platform === 'win32'
      ? ['C:\\Program Files\\Go\\bin\\go.exe', 'C:\\Go\\bin\\go.exe', join(homedir(), 'go/bin/go.exe')]
      : ['/usr/local/go/bin/go']),
  ];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['version'], { cwd: root, encoding: 'utf8', env: env() });
    if (result.status === 0 && supportsVersion(result.stdout || '', minimum)) return candidate;
  }
  throw new Error(`${configured ? 'GO_BIN 指定的工具链不可用' : '未找到兼容的 Go'}：需要 Go ${minimum.join('.')} 或更高稳定版本，请安装或设置 GO_BIN`);
}

/** Resolve gofmt from the selected SDK, including when Go was found on PATH. */
export function resolveGofmt(go) {
  const result = spawnSync(go, ['env', 'GOROOT'], { cwd: root, encoding: 'utf8', env: env() });
  if (result.status !== 0 || !result.stdout?.trim()) throw new Error('无法读取 Go SDK 路径');
  return join(result.stdout.trim(), 'bin', process.platform === 'win32' ? 'gofmt.exe' : 'gofmt');
}
