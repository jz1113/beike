#!/usr/bin/env node
/**
 * agent:stats — 扫描 agent-telemetry/*.jsonl，输出统计指标。
 *
 * 用法:
 *   node tools/scripts/agent-stats.mjs           # 默认 7 天窗口
 *   node tools/scripts/agent-stats.mjs --days 1  # 最近 1 天
 *   node tools/scripts/agent-stats.mjs --json    # 纯 JSON 输出
 *
 * 输出指标:
 *   - 总 turn 数、按状态分桶（completed/interrupted/failed）
 *   - 平均 turn 时长（仅 completed），p50/p95
 *   - 平均每个 turn 的 item / tool 数
 *   - 流式中断率（interrupted / total）
 *   - tool 卡顿最长 top10
 *   - 审批速率 / 决策分布
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import os from 'node:os';

const TELEMETRY_DIR = path.resolve(
  process.env.AZHUO_USER_DATA_DIR ||
    path.join(process.env.HOME || '', 'Library/Application Support/com.azhuo.workbench/agent-telemetry') ||
    path.join(os.tmpdir(), 'beike-workbench/agent-telemetry'),
);

const args = new Set(process.argv.slice(2));
const daysArg = process.argv.find((a, i) => process.argv[i - 1] === '--days');
const days = Number(daysArg) || 7;
const jsonOutput = args.has('--json');

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

async function readAll() {
  let files;
  try {
    files = await fs.readdir(TELEMETRY_DIR);
  } catch {
    return [];
  }
  const cutoff = Date.now() - days * 86400 * 1000;
  const events = [];
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue;
    const fp = path.join(TELEMETRY_DIR, f);
    let content;
    try {
      content = await fs.readFile(fp, 'utf8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      if (!line) continue;
      try {
        const evt = JSON.parse(line);
        if (typeof evt.ts === 'number' && evt.ts >= cutoff) events.push(evt);
      } catch {
        /* skip malformed */
      }
    }
  }
  return events;
}

function summarize(events) {
  const byTurn = new Map();
  for (const evt of events) {
    if (!evt.turnId) continue;
    if (!byTurn.has(evt.turnId)) {
      byTurn.set(evt.turnId, {
        turnId: evt.turnId,
        threadId: evt.threadId,
        model: evt.model,
        startTs: evt.ts,
        endTs: evt.ts,
        status: null,
        items: 0,
        tools: 0,
        approvals: 0,
        decisions: {},
      });
    }
    const t = byTurn.get(evt.turnId);
    t.startTs = Math.min(t.startTs, evt.ts);
    t.endTs = Math.max(t.endTs, evt.ts);
    if (evt.phase === 'item/started') {
      t.items += 1;
      if (evt.itemKind === 'toolCall') t.tools += 1;
    } else if (evt.phase === 'approval/request') {
      t.approvals += 1;
    } else if (evt.phase === 'approval/resolved') {
      const d = evt.decision || 'unknown';
      t.decisions[d] = (t.decisions[d] || 0) + 1;
    } else if (evt.phase === 'turn/completed') {
      t.status = 'completed';
      t.durationMs = evt.durationMs || t.endTs - t.startTs;
    } else if (evt.phase === 'turn/interrupted') {
      t.status = 'interrupted';
      t.durationMs = evt.durationMs || t.endTs - t.startTs;
    } else if (evt.phase === 'turn/failed') {
      t.status = 'failed';
      t.durationMs = evt.durationMs || t.endTs - t.startTs;
    }
  }

  const turns = Array.from(byTurn.values());
  const completed = turns.filter((t) => t.status === 'completed' && t.durationMs);
  const durations = completed.map((t) => t.durationMs).sort((a, b) => a - b);

  const items = turns.length ? turns.reduce((s, t) => s + t.items, 0) / turns.length : 0;
  const tools = turns.length ? turns.reduce((s, t) => s + t.tools, 0) / turns.length : 0;
  const interrupted = turns.filter((t) => t.status === 'interrupted').length;
  const failed = turns.filter((t) => t.status === 'failed').length;

  const slowest = completed
    .filter((t) => t.durationMs > 30000)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10)
    .map((t) => ({
      turnId: t.turnId,
      model: t.model,
      durationMs: t.durationMs,
      items: t.items,
      tools: t.tools,
    }));

  const decisionTotals = {};
  for (const t of turns) {
    for (const [k, v] of Object.entries(t.decisions)) {
      decisionTotals[k] = (decisionTotals[k] || 0) + v;
    }
  }

  return {
    windowDays: days,
    totalTurns: turns.length,
    completedTurns: completed.length,
    interruptedTurns: interrupted,
    failedTurns: failed,
    interruptionRate: turns.length ? (interrupted / turns.length).toFixed(4) : 0,
    averageDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    avgItemCount: Math.round(items * 10) / 10,
    avgToolCount: Math.round(tools * 10) / 10,
    decisions: decisionTotals,
    slowestTurns: slowest,
  };
}

const events = await readAll();
const summary = summarize(events);
if (jsonOutput) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`\n=== Agent Telemetry · 最近 ${summary.windowDays} 天 ===\n`);
  console.log(`turn 总数:        ${summary.totalTurns}`);
  console.log(`  completed:      ${summary.completedTurns}`);
  console.log(`  interrupted:    ${summary.interruptedTurns}`);
  console.log(`  failed:         ${summary.failedTurns}`);
  console.log(`流式中断率:       ${(Number(summary.interruptionRate) * 100).toFixed(2)}%`);
  console.log(`turn 平均时长:    ${summary.averageDurationMs}ms`);
  console.log(`  p50:           ${summary.p50DurationMs}ms`);
  console.log(`  p95:           ${summary.p95DurationMs}ms`);
  console.log(`平均 item / turn: ${summary.avgItemCount}`);
  console.log(`平均 tool / turn: ${summary.avgToolCount}`);
  if (Object.keys(summary.decisions).length > 0) {
    console.log('审批决策分布:');
    for (const [k, v] of Object.entries(summary.decisions)) {
      console.log(`  ${k}: ${v}`);
    }
  }
  if (summary.slowestTurns.length > 0) {
    console.log('\n慢 turn top10 (>30s):');
    for (const t of summary.slowestTurns) {
      console.log(`  ${t.turnId}  ${t.durationMs}ms  items=${t.items} tools=${t.tools} model=${t.model}`);
    }
  }
  console.log(`\n数据目录: ${TELEMETRY_DIR}`);
  console.log('提示: 用 --json 输出原始指标，便于 CI 接入。\n');
}
