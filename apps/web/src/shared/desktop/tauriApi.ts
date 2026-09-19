/** Web 模式不走 Rust IPC；保留函数签名供桌面降级测试与历史调用点使用 */
export async function invokeTauriApi(
  input?: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  void input;
  void init;
  return null;
}
