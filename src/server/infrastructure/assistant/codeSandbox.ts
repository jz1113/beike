import { SANDBOX_LIMITS } from '@shared/domain/assistant/executionPolicy';
import { getQuickJS, type QuickJSDeferredPromise, type QuickJSHandle } from 'quickjs-emscripten';

export interface CodeSandboxOptions {
  code: string;
  input?: unknown;
  toolNames?: string[];
  callTool?: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  cpuTimeMs?: number;
}

/** WebAssembly JS isolation: no process, require, filesystem, network or host objects. */
export async function runCodeSandbox(options: CodeSandboxOptions): Promise<{ output: string[] }> {
  if (options.code.length > SANDBOX_LIMITS.maxCodeChars) throw new Error('代码超过 32000 字符限制');
  options.signal?.throwIfAborted();
  const timeoutMs = Math.max(1, Math.min(SANDBOX_LIMITS.timeoutMs, options.timeoutMs ?? SANDBOX_LIMITS.timeoutMs));
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])]);
  const engine = await getQuickJS();
  signal.throwIfAborted();
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(SANDBOX_LIMITS.memoryBytes);
  runtime.setMaxStackSize(SANDBOX_LIMITS.stackBytes);
  const vm = runtime.newContext();
  const deadline = Date.now() + timeoutMs;
  let cpuRemaining = Math.max(1, Math.min(SANDBOX_LIMITS.cpuTimeMs, options.cpuTimeMs ?? SANDBOX_LIMITS.cpuTimeMs));
  let sliceStart = Date.now();
  runtime.setInterruptHandler(() => signal.aborted === true || Date.now() > deadline || Date.now() - sliceStart > cpuRemaining);
  const runSlice = <T>(fn: () => T): T => {
    sliceStart = Date.now();
    try { return fn(); } finally { cpuRemaining -= Date.now() - sliceStart; }
  };
  const pending = new Set<Promise<void>>();
  const deferred = new Set<QuickJSDeferredPromise>();
  const output: string[] = [];
  let outputSize = 0;
  let calls = 0;
  let closed = false;
  let resultHandle: QuickJSHandle | undefined;
  const allowed = new Set(options.toolNames || []);
  try {
    const print = vm.newFunction('__print', (value) => {
      const text = vm.getString(value);
      outputSize += text.length;
      if (outputSize > 32_000 || output.length >= 100) throw new Error('沙箱输出超过限制，请先筛选或汇总数据');
      output.push(text);
    });
    vm.setProp(vm.global, '__print', print);
    print.dispose();
    const bridge = vm.newFunction('__callTool', (nameHandle, argsHandle) => {
      const name = vm.getString(nameHandle);
      if (!allowed.has(name) || !options.callTool) throw new Error(`未授权工具: ${name}`);
      if (++calls > 24) throw new Error('单次代码执行最多调用 24 次工具');
      const json = vm.getString(argsHandle);
      if (json.length > 64_000) throw new Error('工具参数过大');
      const args = JSON.parse(json);
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('工具参数必须是对象');
      const promise = vm.newPromise();
      deferred.add(promise);
      const job = Promise.resolve().then(() => {
        if (closed || signal.aborted) throw new Error('代码执行已停止');
        return options.callTool!(name, args, signal);
      }).then((value) => {
        if (closed) return;
        const text = JSON.stringify(value) ?? 'null';
        if (text.length > 1_000_000) throw new Error('工具结果过大，请缩小查询范围');
        const handle = vm.newString(text);
        promise.resolve(handle);
        handle.dispose();
      }).catch((error) => {
        if (closed) return;
        const handle = vm.newError(error instanceof Error ? error.message : String(error));
        promise.reject(handle);
        handle.dispose();
      }).finally(() => pending.delete(job));
      pending.add(job);
      return promise.handle;
    });
    vm.setProp(vm.global, '__callTool', bridge);
    bridge.dispose();
    const inputJson = JSON.stringify(options.input ?? null);
    if (inputJson.length > 1_000_000) throw new Error('沙箱输入过大');
    const inputHandle = vm.newString(inputJson);
    vm.setProp(vm.global, '__input', inputHandle);
    inputHandle.dispose();
    // Only JSON crosses the bridge. Host callbacks are never JS objects inside the VM.
    vm.unwrapResult(runSlice(() => vm.evalCode(`
      globalThis.input = JSON.parse(__input);
      globalThis.text = value => __print(typeof value === 'string' ? value : JSON.stringify(value));
      globalThis.console = { log: (...values) => text(values.length === 1 ? values[0] : values) };
      globalThis.tools = Object.freeze(Object.fromEntries(${JSON.stringify([...allowed])}.map(name => [name, async (args = {}) => JSON.parse(await __callTool(name, JSON.stringify(args)))])));
      delete globalThis.__input;
    `))).dispose();
    resultHandle = vm.unwrapResult(runSlice(() => vm.evalCode(`(async () => {\n${options.code}\n})()`, 'assistant-code.js')));
    while (true) {
      signal.throwIfAborted();
      if (Date.now() > deadline || cpuRemaining <= 0) throw new Error('沙箱执行超时');
      const jobs = runSlice(() => runtime.executePendingJobs(100));
      if (jobs.error) {
        const error = vm.dump(jobs.error);
        jobs.error.dispose();
        throw new Error(error?.message || '沙箱执行失败');
      }
      const state = vm.getPromiseState(resultHandle);
      if (state.type === 'rejected') {
        const error = vm.dump(state.error);
        state.error.dispose();
        throw new Error(error?.message || String(error));
      }
      if (state.type === 'fulfilled') {
        state.value.dispose();
        // Drain started tool operations before finishing; never detach mutations.
        if (!pending.size && !runtime.hasPendingJob()) break;
      } else if (!pending.size && !runtime.hasPendingJob()) {
        throw new Error('代码等待了无法完成的 Promise');
      }
      if (pending.size) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([...pending, new Promise<void>((resolve) => { timer = setTimeout(resolve, 20); })]);
        if (timer) clearTimeout(timer);
      } else {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    return { output };
  } finally {
    closed = true;
    controller.abort(new Error('沙箱执行已结束'));
    resultHandle?.dispose();
    for (const promise of deferred) if (promise.alive) promise.dispose();
    vm.dispose();
    runtime.dispose();
  }
}
