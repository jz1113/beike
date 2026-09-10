import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { get } from 'node:http';
import { join } from 'node:path';

const PORT_FILE = '.desktop-dev-port';
const PORT_MIN = 3000;
const PORT_MAX = 3099;

export function readDesktopPort(root) {
  try {
    const n = Number.parseInt(readFileSync(join(root, PORT_FILE), 'utf8').trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* use default */
  }
  return PORT_MIN;
}

export function writeDesktopPort(root, port) {
  writeFileSync(join(root, PORT_FILE), String(port), 'utf8');
}

export function healthOk(port) {
  return new Promise((resolve) => {
    const req = get(`http://127.0.0.1:${port}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

/** 优先复用已有 health 正常的端口，否则找空闲端口 */
export async function resolveDesktopPort() {
  for (let port = PORT_MIN; port <= PORT_MAX; port += 1) {
    if (await healthOk(port)) return port;
  }
  for (let port = PORT_MIN; port <= PORT_MAX; port += 1) {
    if (await portFree(port)) return port;
  }
  throw new Error(`127.0.0.1 上 ${PORT_MIN}–${PORT_MAX} 无可用端口`);
}
