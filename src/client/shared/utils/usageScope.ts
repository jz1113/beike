import { getGatewayClientHeaders, getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';

export interface UsageScope { workspaceId: string; channelId: string; mediaType: string }

// Synchronous SHA-256 keeps the existing synchronous log API atomic within a tab.
// Only the digest is stored/exported; credentials and workspace secrets stay out.
export function usageDigest(text: string): string {
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const input = new TextEncoder().encode(text);
  const bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  bytes.set(input); bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.length - 8, Math.floor(input.length / 0x20000000));
  view.setUint32(bytes.length - 4, (input.length * 8) >>> 0);
  const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rotate = (n: number, r: number) => (n >>> r) | (n << (32 - r));
  for (let block = 0; block < bytes.length; block += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotate(w[i-15],7) ^ rotate(w[i-15],18) ^ (w[i-15] >>> 3);
      const s1 = rotate(w[i-2],17) ^ rotate(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let i = 0; i < 64; i++) {
      const s1 = rotate(e,6) ^ rotate(e,11) ^ rotate(e,25);
      const t1 = (h + s1 + ((e & f) ^ (~e & g)) + k[i] + w[i]) >>> 0;
      const s0 = rotate(a,2) ^ rotate(a,13) ^ rotate(a,22);
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    for (const [i,n] of [a,b,c,d,e,f,g,h].entries()) hash[i] = (hash[i] + n) >>> 0;
  }
  return hash.map(n => n.toString(16).padStart(8,'0')).join('');
}

export function createUsageScope(mediaType: string, selection?: string, suppliedHeaders?: Record<string, string>): UsageScope {
  const text = !suppliedHeaders && ['chat','vision','distill'].includes(mediaType) ? getMultimodalClientOverrides(selection || '') : null;
  const headers = suppliedHeaders || (text ? { 'x-custom-base-url': text.customBaseUrl || '', 'x-custom-api-key': text.customApiKey || '', 'x-custom-protocol': text.textProtocol || '' } : getGatewayClientHeaders(selection || ''));
  const local = mediaType.startsWith('depth-') || selection === 'depth-image' || selection === 'depth-video';
  const lianchi = selection === 'openai/gpt-image-2';
  return {
    workspaceId: usageDigest(getWorkspaceSecret() || 'local'),
    channelId: usageDigest(local ? 'local-depth' : JSON.stringify([
      lianchi ? 'lianchi' : headers['x-custom-base-url'] || 'default', lianchi ? headers['x-lianchi-api-key'] || '' : headers['x-custom-api-key'] || '',
      headers['x-custom-protocol'] || '', headers['x-request-template'] || '',
    ])),
    mediaType,
  };
}

export function sameUsageScope(a: UsageScope | undefined, b: UsageScope): boolean {
  return !!a && a.workspaceId === b.workspaceId && a.channelId === b.channelId && a.mediaType === b.mediaType;
}

/** Immutable operations retain the channel captured before their first dispatch. */
export function operationUsageScope(operationId: string | undefined, mediaType: string, selection?: string, headers?: Record<string,string>): UsageScope {
  const scope = createUsageScope(mediaType,selection,headers);
  if (!operationId || typeof localStorage === 'undefined') return scope;
  const slot = `beike.usage-operation-scope.v1:${usageDigest(JSON.stringify([scope.workspaceId,mediaType,operationId]))}`;
  const raw = localStorage.getItem(slot);
  if (raw) {
    const saved = JSON.parse(raw) as UsageScope;
    if (saved.workspaceId !== scope.workspaceId || saved.mediaType !== mediaType || typeof saved.channelId !== 'string' || !/^[a-f0-9]{64}$/.test(saved.channelId)) throw new Error('原操作用量范围无法核对，请保留原任务，不要重新生成');
    return saved;
  }
  localStorage.setItem(slot,JSON.stringify(scope));
  if (localStorage.getItem(slot) !== JSON.stringify(scope)) throw new Error('用量范围保存未确认，未提交生成');
  return scope;
}
