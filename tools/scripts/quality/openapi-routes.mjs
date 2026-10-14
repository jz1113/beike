/** Collect the live HTTP surface from the Go API routes. */
import fs from 'node:fs';
import path from 'node:path';

export function collectRoutes(root) {
  const server = fs.readFileSync(path.join(root, 'src/backend/internal/app/server.go'), 'utf8');
  const routes = [];
  const seen = new Set();
  for (const match of server.matchAll(/\{"(GET|POST|PUT|PATCH|DELETE) ([^"]+)"/g)) {
    const route = { method: match[1], path: match[2] };
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) throw new Error(`重复接口：${key}`);
    seen.add(key);
    routes.push(route);
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export function renderOpenApi(routes) {
  const lines = [
    'openapi: 3.0.3',
    'info:',
    '  title: 贝壳云图 API',
    '  version: 0.0.2',
    'paths:',
  ];
  let current = '';
  for (const route of routes) {
    if (route.path !== current) {
      current = route.path;
      lines.push(`  ${yamlString(route.path)}:`);
    }
    const operationId = `${route.method.toLowerCase()}${route.path.replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+/g, '_')}`;
    lines.push(`    ${route.method.toLowerCase()}:`);
    lines.push(`      operationId: ${operationId}`);
    lines.push('      responses:');
    lines.push("        '200':");
    lines.push('          description: 沿用现有 JSON 或二进制响应');
  }
  return `${lines.join('\n')}\n`;
}

function yamlString(value) {
  return /[:{}[\],&*#?|<>=!%@`]|^\s|\s$/.test(value) ? `'${value.replace(/'/g, "''")}'` : value;
}
