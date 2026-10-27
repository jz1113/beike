import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { watchGatewaySkill } from './gateway-skill-watcher.mjs';

let root: string;
let file: string;
let close: (() => void) | undefined;
const rebuild = vi.fn();
const restart = vi.fn();
const onError = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'beike-skill-watch-'));
  file = path.join(root, 'src/backend/internal/generate/sales/skill_package.generated.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'initial');
  close = watchGatewaySkill({ workspaceRoot: root, rebuild, restart, onError, interval: 10 });
});
afterEach(() => {
  close?.();
  fs.rmSync(root, { recursive: true, force: true });
});

function replace(contents: string) {
  fs.writeFileSync(`${file}.tmp`, contents);
  fs.renameSync(`${file}.tmp`, file);
}

it('rebuilds before restarting when compiled rules are replaced', async () => {
  const order: string[] = [];
  rebuild.mockImplementation(() => { order.push('build'); });
  restart.mockImplementation(() => { order.push('restart'); });
  replace('updated');
  await vi.waitFor(() => expect(order).toEqual(['build', 'restart']));
  expect(onError).not.toHaveBeenCalled();
});

it('does not restart when skill compilation rewrites identical output', async () => {
  replace('initial');
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(rebuild).not.toHaveBeenCalled();
  expect(restart).not.toHaveBeenCalled();
});

it('keeps the old API on a failed build and recovers on the next rule update', async () => {
  const failure = new Error('compiled skills are stale');
  rebuild.mockRejectedValueOnce(failure);
  replace('invalid');
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
  expect(restart).not.toHaveBeenCalled();
  replace('fixed');
  await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
  expect(rebuild).toHaveBeenCalledTimes(2);
});

it('serializes updates and skips a build superseded by newer rules', async () => {
  let finish!: () => void;
  rebuild.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  replace('first');
  await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(1));
  replace('second');
  finish();
  await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
  expect(rebuild).toHaveBeenCalledTimes(2);
  expect(onError).not.toHaveBeenCalled();
});

it('does not restart after shutdown while a build is pending', async () => {
  let finish!: () => void;
  rebuild.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  replace('updated');
  await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(1));
  close?.();
  finish();
  await new Promise(resolve => setTimeout(resolve, 40));
  expect(restart).not.toHaveBeenCalled();
});
