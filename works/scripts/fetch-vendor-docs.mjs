#!/usr/bin/env node
/**
 * 从聚合平台 Apifox 拉取白名单模型的 OpenAPI spec，并写出厂商官方文档索引。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../..');
const mapPath = path.join(workspaceRoot, 'works/configs/vendor-docs.map.json');
const outRoot = path.join(workspaceRoot, 'docs/vendors/官方接口');

const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function yamlFrontMatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { Accept: 'text/markdown, text/plain, */*' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function fetchAggregator(apiId) {
  const url = `${map.aggregatorBase}/api-${apiId}.md`;
  const body = await fetchText(url);
  return { url, body };
}

function writeFile(filePath, contents) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
}

async function main() {
  const fetched = [];
  const failures = [];

  for (const entry of map.entries) {
    const vendorDir = path.join(outRoot, 'aggregator', entry.vendor);
    ensureDir(vendorDir);

    const specLinks = [];
    for (const spec of entry.aggregator || []) {
      const dest = path.join(vendorDir, `${entry.id}__${spec.slug}.md`);
      specLinks.push(`- [${spec.slug}](./${entry.id}__${spec.slug}.md) （api-${spec.apiId}）`);
      try {
        const { url, body } = await fetchAggregator(spec.apiId);
        const header = yamlFrontMatter({
          model: entry.id,
          capability: entry.capability,
          vendor: entry.vendor,
          source: 'aggregator',
          apifoxId: spec.apiId,
          sourceUrl: url,
          fetchedAt: today,
        });
        writeFile(dest, `${header}# ${entry.id} — ${spec.slug}\n\n来源：${url}\n\n${body.trim()}\n`);
        fetched.push(dest);
        process.stdout.write(`ok  ${entry.id} ${spec.apiId}\n`);
      } catch (err) {
        failures.push({ id: entry.id, apiId: spec.apiId, error: String(err?.message || err) });
        process.stderr.write(`fail ${entry.id} ${spec.apiId}: ${err?.message || err}\n`);
      }
    }

    writeFile(
      path.join(vendorDir, `${entry.id}.md`),
      `${yamlFrontMatter({
        model: entry.id,
        capability: entry.capability,
        vendor: entry.vendor,
        source: 'aggregator-index',
        fetchedAt: today,
      })}# ${entry.id}\n\n聚合平台 OpenAPI spec 索引。厂商官网见 [vendor/${entry.vendor}/${entry.id}.md](../../vendor/${entry.vendor}/${entry.id}.md)。\n\n${specLinks.join('\n') || '- （无专属接口页，走通用格式）'}\n`,
    );

    if (entry.id === 'multimodal-chat') {
      const chatIndex = `${yamlFrontMatter({
        model: 'multimodal-chat',
        capability: 'multimodal',
        vendor: 'chat',
        source: 'aggregator-index',
        fetchedAt: today,
      })}# 多模态 Chat\n\n白名单内全部多模态模型统一走 \`/v1/chat/completions\`（OpenAI 兼容）。Claude / Gemini 官方格式仅作对照，运行时不切换。\n\n${specLinks.join('\n')}\n`;
      writeFile(path.join(vendorDir, 'openai-chat.md'), chatIndex);
      writeFile(path.join(vendorDir, 'claude-messages.md'), chatIndex);
      writeFile(path.join(vendorDir, 'gemini.md'), chatIndex);
    }

    const vendorOut = path.join(outRoot, 'vendor', entry.vendor, `${entry.id}.md`);
    const vendorLinks = (entry.vendorDocs || [])
      .map((doc) => `- [${doc.title}](${doc.url})`)
      .join('\n');
    writeFile(
      vendorOut,
      `${yamlFrontMatter({
        model: entry.id,
        capability: entry.capability,
        vendor: entry.vendor,
        source: 'vendor',
        fetchedAt: today,
      })}# ${entry.id} 厂商官方文档\n\n聚合平台按 OpenAI / 官方格式转发。调用时优先对齐下方官方契约，再对照 aggregator 目录中的网关 OpenAPI spec。\n\n${vendorLinks || '- （暂无公开官方文档，仅走聚合平台格式）'}\n`,
    );
  }

  console.log(`\n写入 ${fetched.length} 篇聚合文档，失败 ${failures.length} 篇`);
  if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
