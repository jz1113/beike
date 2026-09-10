import { describe, expect, it, vi } from 'vitest';
import { runCodeSandbox } from './codeSandbox';

describe('isolated code sandbox', () => {
  it('computes locally with JSON input and no host access', async () => {
    const result = await runCodeSandbox({
      input: { values: [1, 6, 10, 19] },
      code: 'text(input.values.map((source, i) => ({ source, target: i + 1 }))); text([typeof process, typeof require, typeof fetch, typeof WebSocket]);',
    });
    expect(JSON.parse(result.output[0])).toEqual([{ source: 1, target: 1 }, { source: 6, target: 2 }, { source: 10, target: 3 }, { source: 19, target: 4 }]);
    expect(JSON.parse(result.output[1])).toEqual(['undefined', 'undefined', 'undefined', 'undefined']);
  });
  it('awaits batched authorized tools in one code execution', async () => {
    const callTool = vi.fn(async (_name, args) => ({ value: args.value * 2 }));
    const result = await runCodeSandbox({ code: 'const results = await Promise.all([tools.lookup({value: 2}), tools.lookup({value: 3})]); text(results);', toolNames: ['lookup'], callTool });
    expect(JSON.parse(result.output[0])).toEqual([{ value: 4 }, { value: 6 }]);
    expect(callTool).toHaveBeenCalledTimes(2);
  });
  it('rejects unauthorized tool calls and isolates separate executions', async () => {
    const callTool = vi.fn();
    await expect(runCodeSandbox({ code: 'await __callTool("forbidden", "{}");', callTool })).rejects.toThrow('未授权');
    expect(callTool).not.toHaveBeenCalled();
    await runCodeSandbox({ code: 'globalThis.secret = "private";' });
    expect((await runCodeSandbox({ code: 'text(typeof secret);' })).output).toEqual(['undefined']);
    await expect(runCodeSandbox({ code: 'text.constructor("return process")()' })).rejects.toThrow();
  });
  it('interrupts CPU loops, excessive output and abandoned promises', async () => {
    await expect(runCodeSandbox({ code: 'while(true) {}', cpuTimeMs: 20 })).rejects.toThrow();
    await expect(runCodeSandbox({ code: 'text("x".repeat(40000));' })).rejects.toThrow('输出');
    await expect(runCodeSandbox({ code: 'const bytes = new ArrayBuffer(128 * 1024 * 1024); text(bytes.byteLength);' })).rejects.toThrow();
    await expect(runCodeSandbox({ code: 'await import("node:fs");' })).rejects.toThrow();
    await expect(runCodeSandbox({ code: 'await new Promise(() => {});' })).rejects.toThrow('Promise');
    // A failed script must not poison subsequent executions.
    expect((await runCodeSandbox({ code: 'text(2 + 3);' })).output).toEqual(['5']);
  });
  it('stops pending bridges on cancellation without touching a disposed VM', async () => {
    const controller = new AbortController();
    let finish: (value: unknown) => void = () => {};
    const result = runCodeSandbox({ code: 'await tools.wait({});', toolNames: ['wait'], callTool: () => new Promise((resolve) => { finish = resolve; }), signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(result).rejects.toThrow();
    finish({ success: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
