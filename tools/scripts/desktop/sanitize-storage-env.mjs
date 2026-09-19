import {parseEnv} from 'node:util';
/** Distribution must not inherit the packager's storage account or local paths. */
export function sanitizeStorageEnv(source) {
  const values=parseEnv(source);
  const entries=Object.entries(values).filter(([key])=>! /^(STORAGE_|S3_|R2_|OSS_|COS_|CLOUDFLARE_)/.test(key) && !['AZHUO_CACHE_DIR','AZHUO_DATA_DIR'].includes(key));
  return entries.map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\nSTORAGE_ENABLED=false\n';
}
