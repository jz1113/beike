import { spawnSync } from 'node:child_process';
import { resolveGo } from '../common/go-toolchain.mjs';

/** Let Go invalidate its own build cache, without waiting on optional module metadata online. */
export function buildGoApi(workspaceRoot, out) {
  const go = resolveGo();
  const started = Date.now();
  const args = ['build', '-o', out, './src/backend/cmd/api'];
  const env = { ...process.env, GOTOOLCHAIN: 'local' };
  console.log('→ 正在构建 Go API（优先使用本机依赖缓存）…');
  let result = spawnSync(go, [args[0], '-mod=readonly', ...args.slice(1)], {
    cwd: workspaceRoot,
    stdio: ['ignore', 'inherit', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    // Do not change global Go settings or bypass go.sum / checksum verification.
    // GONOPROXY also prevents private modules from falling back to direct network access.
    env: { ...env, GOPROXY: 'off', GONOPROXY: 'none' },
  });
  if (result.status !== 0 && !result.error
      && /module lookup disabled by GOPROXY=off|missing go.sum entry/.test(result.stderr || '')) {
    console.log('→ 本机 Go 依赖缓存或校验记录不完整，正在按原有网络配置补齐并构建…');
    result = spawnSync(go, args, { cwd: workspaceRoot, stdio: 'inherit', env });
  } else if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) throw new Error(`Go API 构建无法执行：${result.error.message}`, { cause: result.error });
  if (result.status !== 0) throw new Error('Go API 构建失败，请查看上方错误信息');
  console.log(`✓ Go API 构建完成（${((Date.now() - started) / 1000).toFixed(1)} 秒）`);
}
