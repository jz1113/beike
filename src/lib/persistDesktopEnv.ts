import { persistAiGatewayConfig } from '@/lib/persistDesktopSecrets';

/** 桌面端：将 API 网关配置写入 Keychain + sidecar .env（不再写入 localStorage secret） */
export async function persistDesktopApiConfig(baseUrl: string, apiKey: string): Promise<void> {
  await persistAiGatewayConfig(baseUrl, apiKey);
}
