import type { ApiProviderProtocol } from './apiProviderTypes';

interface ProviderPreset {
  name: string;
  protocol: ApiProviderProtocol;
  baseUrl: string;
}

/** 手动选择后才填入表单，不改已配置的渠道或密钥。 */
export const providerPresets: readonly ProviderPreset[] = [
  { name: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com' },
  { name: 'Anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  { name: 'Google Gemini', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
  { name: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com' },
  { name: '阿里云百炼', protocol: 'dashscope', baseUrl: 'https://dashscope.aliyuncs.com' },
  { name: '硅基流动', protocol: 'openai', baseUrl: 'https://api.siliconflow.cn' },
  { name: 'OpenRouter', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
];
