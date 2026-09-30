import { getToolDefinition } from '@shared/domain/assistant/tools/defs';

/** Validate the exact JSON that will be executed, before presenting it for approval. */
export function parseToolArguments(name: string, json: string): Record<string, unknown> {
  if (json.length > 100_000) throw new Error('工具参数过大');
  let value: unknown;
  try { value = JSON.parse(json || '{}'); } catch { throw new Error('工具参数不是有效 JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('工具参数必须是对象');
  const def = getToolDefinition(name);
  if (!def && !name.startsWith('mcp_')) throw new Error('工具不存在');
  validateToolArguments(value, def?.openaiTool.function.parameters || { type: 'object' });
  return value as Record<string, unknown>;
}

export function validateToolArguments(value: unknown, raw: Record<string, unknown>, depth = 0): void {
  if (depth > 12) throw new Error('工具参数嵌套过深');
  const schema = raw || {};
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw new Error('工具参数不在允许的选项中');
  if (typeof value === 'string') {
    if (value.length > Math.min(Number(schema.maxLength) || 100_000, 100_000)) throw new Error('工具文本参数过长');
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) throw new Error('工具文本参数为空或过短');
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || (typeof schema.minimum === 'number' && value < schema.minimum) || (typeof schema.maximum === 'number' && value > schema.maximum))) throw new Error('工具数值参数超出范围');
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const types = Array.isArray(schema.type) ? schema.type : typeof schema.type === 'string' ? [schema.type] : [];
  if (types.length && !types.some(type => type === actual || (type === 'integer' && typeof value === 'number' && Number.isInteger(value)))) throw new Error('工具参数类型不符合定义');
  if (Array.isArray(value)) {
    if (value.length > Math.min(Number(schema.maxItems) || 1000, 1000)) throw new Error('工具列表参数过多');
    for (const item of value) validateToolArguments(item, schema.items && typeof schema.items === 'object' ? schema.items as Record<string, unknown> : {}, depth + 1);
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Object.keys(obj).length > 1000) throw new Error('工具参数字段过多');
    const props = schema.properties && typeof schema.properties === 'object' ? schema.properties as Record<string, Record<string, unknown>> : {};
    for (const key of Array.isArray(schema.required) ? schema.required : []) if (typeof key === 'string' && !Object.hasOwn(obj, key)) throw new Error(`工具参数缺少必填字段 ${key}`);
    for (const [key, item] of Object.entries(obj)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('工具参数包含不允许的字段');
      if (schema.additionalProperties === false && !Object.hasOwn(props, key)) throw new Error('工具参数包含未定义字段');
      validateToolArguments(item, props[key] || {}, depth + 1);
    }
  }
}
