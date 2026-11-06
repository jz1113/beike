import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gatewayBinary, getWorkspaceRoot } from './web-shared.mjs';

const dir = process.env.BEIKE_BROWSER_DATA_DIR;
if (!dir) throw new Error('Run pnpm test:browser to create an isolated data directory.');
const root = getWorkspaceRoot();
const fixtureDir = join(dir, 'storage', 'local', 'browser-test');
mkdirSync(fixtureDir, { recursive: true });
execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'color=c=blue:s=768x1366:r=24:d=15.083333',
  '-f', 'lavfi', '-i', 'sine=frequency=800:duration=15.083333',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', join(fixtureDir, 'source.mp4'),
]);
const child = spawn(gatewayBinary(root), [], {
  cwd: root,
  stdio: 'inherit',
  // Do not inherit local configuration, cloud credentials, proxies or provider URLs.
  env: {
    PATH: process.env.PATH,
    NODE_ENV: 'development',
    HOSTNAME: '127.0.0.1',
    PORT: process.env.BEIKE_BROWSER_PORT || '3199',
    LOCAL_ACCESS_TOKEN: 'browser-test-fixture',
    AZHUO_DATA_DIR: dir,
    DATABASE_URL: 'file:' + join(dir, 'browser.db'),
    WEB_DIST_DIR: join(root, 'tools', 'build', 'ui'),
  },
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
