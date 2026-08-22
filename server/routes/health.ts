import { jsonResponse } from '../adapters/http';
/** 桌面壳就绪探测；DESKTOP_SHELL=1 时附带本机口令供窗口同步 Cookie */
export async function GET() {
  const desktop = process.env.DESKTOP_SHELL === '1';
  return jsonResponse({
    ok: true,
    desktop,
    desktopToken: desktop ? process.env.LOCAL_ACCESS_TOKEN || '' : undefined,
  });
}
