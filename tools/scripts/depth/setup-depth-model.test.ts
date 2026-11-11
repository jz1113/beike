import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it, vi } from 'vitest';
import { setupDepthModel } from './setup-depth-model.mjs';
import { depthEnvironmentPython } from '../web/web-shared.mjs';

it('installs into a supplied virtual environment without --user or creating another environment', async () => {
  const runCommand = vi.fn(async () => '1');
  const python = '/fixture/venv/bin/python';
  await setupDepthModel({ environment: { DEPTH_VIDEO_PYTHON: python }, runCommand });
  expect(runCommand.mock.calls.every(([command]) => command === python)).toBe(true);
  expect(runCommand.mock.calls).toContainEqual([python, expect.arrayContaining(['pip', 'install', '-r']), '安装 Python 依赖']);
  expect(JSON.stringify(runCommand.mock.calls)).not.toContain('--user');
  expect(JSON.stringify(runCommand.mock.calls)).not.toContain('"venv"');
});

it('creates a dedicated data-directory environment when no interpreter override is supplied', async () => {
  const runCommand = vi.fn(async () => '1');
  const directory = path.resolve('/fixture/depth-data');
  const python = await setupDepthModel({ environment: { AZHUO_DATA_DIR: directory, DEPTH_SETUP_PYTHON: '/fixture/python' }, runCommand, fileExists: () => false });
  expect(runCommand.mock.calls[0]).toEqual(['/fixture/python', ['-m', 'venv', path.join(directory, 'depth-runtime')], '创建独立 Python 环境']);
  expect(python).toBe(depthEnvironmentPython(directory));
});

it('rejects an unisolated interpreter before installing any packages', async () => {
  const runCommand = vi.fn(async () => '0');
  await expect(setupDepthModel({ environment: { DEPTH_VIDEO_PYTHON: '/fixture/system-python' }, runCommand })).rejects.toThrow('独立 venv/Conda');
  expect(runCommand).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(runCommand.mock.calls)).not.toContain('"pip"');
});

// Run the actual CLI entry points, replacing process execution before their modules load.
// Every .env used here belongs to the temporary fixture, never the developer's data directory.
it.each(['setup-depth-model.mjs', 'verify-env.mjs'])('%s loads the data-directory Python and preserves a process override', script => {
  const directory = mkdtempSync(path.join(tmpdir(), 'beike-depth-cli-'));
  try {
    const configuredPython = path.join(directory, 'configured-venv', 'python');
    const overridePython = path.join(directory, 'override-venv', 'python');
    writeFileSync(path.join(directory, '.env'), `DEPTH_VIDEO_PYTHON="${configuredPython}"\n`);
    const preload = path.join(directory, 'capture-process.mjs');
    writeFileSync(preload, String.raw`
      import childProcess from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      const capture = command => {
        process.stdout.write('DEPTH_PYTHON=' + JSON.stringify(command) + '\n');
        process.exit(0);
      };
      childProcess.spawn = command => capture(command);
      childProcess.execFile = (command, args, ...options) => {
        if (args.includes('--check-env')) capture(command);
        const callback = options.at(-1);
        callback(null, { stdout: 'fixture version\n', stderr: '' });
      };
      syncBuiltinESMExports();
    `);
    for (const override of [undefined, overridePython]) {
      const environment: NodeJS.ProcessEnv = { ...process.env, AZHUO_DATA_DIR: directory };
      delete environment.NODE_OPTIONS;
      delete environment.DEPTH_SETUP_PYTHON;
      delete environment.DEPTH_VIDEO_PYTHON;
      if (override) environment.DEPTH_VIDEO_PYTHON = override;
      const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href,
        fileURLToPath(new URL(script, import.meta.url))], { env: environment, encoding: 'utf8', timeout: 10000 });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      const captured = result.stdout.split('\n').find(line => line.startsWith('DEPTH_PYTHON='));
      expect(captured).toBe('DEPTH_PYTHON=' + JSON.stringify(override || configuredPython));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
