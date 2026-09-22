import { jsonResponse } from '../core/http';
import { getAccessToken, isAuthorized } from '@beike/server-kit/apiAuth';
import { createMediaSignature } from '@beike/server-kit/mediaSign';

/** Public liveness never discloses credentials. Rust IPC attaches the desktop token. */
export async function GET(req?: Request) {
  const desktop = process.env.DESKTOP_SHELL === '1';
  const authorized = req ? isAuthorized(req) : false;
  const token = getAccessToken() || '';
  return jsonResponse({
    success: true,
    ok: true, desktop,
    desktopToken: desktop && authorized ? token : '',
    mediaSession: authorized && token ? createMediaSignature('proxy-media-session', token, 3600) : undefined,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
