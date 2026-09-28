import { jsonResponse } from '../core/http';
import { getAccessToken, isAuthorized } from '@server/infrastructure/auth/apiAuth';
import { createMediaSignature } from '@server/infrastructure/auth/mediaSign';

/** 存活检查不返回访问令牌。已授权请求附带媒体签名。 */
export async function GET(req?: Request) {
  const authorized = req ? isAuthorized(req) : false;
  const token = getAccessToken() || '';
  return jsonResponse({
    success: true,
    ok: true,
    mediaSession: authorized && token ? createMediaSignature('proxy-media-session', token, 3600) : undefined,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
