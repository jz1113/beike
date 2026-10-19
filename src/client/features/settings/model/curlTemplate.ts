import type { ImageRequestTemplate } from '@shared/contracts/imageRequestTemplate';

export function dashscopeRoot(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/compatible-mode\/v1$/i, '')
    .replace(/\/compatible-mode$/i, '')
    .replace(/\/api\/v1$/i, '')
    .replace(/\/api$/i, '')
    .replace(/\/v1$/i, '');
}

function qwenBody(extraParameters: string): string {
  return `{
  "model": "{{model}}",
  "input": {"messages":[{"role":"user","content":[{"text":"{{prompt}}"}]}]},
  "parameters": {"size":"{{size}}","n":{{n}},"watermark":false${extraParameters}}
}`;
}

export function qwenSyncPreset(baseUrl: string): ImageRequestTemplate {
  const root = dashscopeRoot(baseUrl || 'https://maas.qianwenaiapi.com');
  return {
    submit: {
      method: 'POST',
      url: `${root}/api/v1/services/aigc/multimodal-generation/generation`,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer {{apiKey}}' },
      body: qwenBody(''),
    },
    result: { imageUrlPath: 'output.choices.0.message.content.0.image' },
  };
}

export function qwenAsyncPreset(baseUrl: string): ImageRequestTemplate {
  const root = dashscopeRoot(baseUrl || 'https://maas.qianwenaiapi.com');
  return {
    submit: {
      method: 'POST',
      url: `${root}/api/v1/services/aigc/image-generation/generation`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{apiKey}}',
        'X-DashScope-Async': 'enable',
      },
      body: qwenBody(''),
    },
    result: { taskIdPath: 'output.task_id', imageUrlPath: 'output.choices.0.message.content.0.image' },
    poll: {
      url: `${root}/api/v1/tasks/{{taskId}}`,
      statusPath: 'output.task_status',
      imageUrlPath: 'output.choices.0.message.content.0.image',
      successValues: ['SUCCEEDED'],
      failureValues: ['FAILED', 'CANCELED', 'UNKNOWN'],
      errorPath: 'message',
    },
  };
}

export function parseCurl(command: string): ImageRequestTemplate {
  const tokens = tokenizeCurl(command.replace(/\\\r?\n/g, ' '));
  let method = '';
  let url = '';
  const headers: Record<string, string> = {};
  let body = '';
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === 'curl' || token === '--location' || token === '--location-trusted' || token === '-L' || token === '--silent' || token === '-s' || token === '--compressed' || token === '--fail') continue;
    if (token === '-X' || token === '--request') {
      method = tokens[++index] || method;
      continue;
    }
    if (token === '-H' || token === '--header') {
      const header = tokens[++index] || '';
      const split = header.indexOf(':');
      if (split > 0) headers[header.slice(0, split).trim()] = replaceKey(header.slice(split + 1).trim());
      continue;
    }
    if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-ascii') {
      body = replaceKey(tokens[++index] || '');
      if (!method) method = 'POST';
      continue;
    }
    if (/^https?:\/\//i.test(token)) url = replaceKey(token);
  }
  return {
    submit: { method: method || (body ? 'POST' : 'GET'), url, headers, body },
    result: {},
  };
}

function replaceKey(value: string): string {
  return value
    .replace(/\$\{?DASHSCOPE_API_KEY\}?/g, '{{apiKey}}')
    .replace(/\$\{?API_KEY\}?/g, '{{apiKey}}');
}

function tokenizeCurl(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | '' = '';
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === '\\' && quote === '"' && index + 1 < input.length) {
        current += input[index + 1];
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = '';
        continue;
      }
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}
