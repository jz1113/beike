import { describe, it, expect } from 'vitest';
import { prisma } from '../prisma';
import { readFileSync } from 'node:fs';

describe('prisma.ts — 运行时表结构由 desktopMigrations 演进', () => {
  it('启动路径只做 PRAGMA 与 migrateDatabase，不再内联自愈建表', () => {
    const src = readFileSync('packages/server-kit/src/prisma.ts', 'utf8');
    expect(src).toContain('migrateDatabase(prisma)');
    expect(src).not.toContain('ALLOWED_SELF_HEAL_TABLES');
    expect(src).not.toContain('CREATE TABLE IF NOT EXISTS');
  });

  it('prisma 实例已导出且类型正确', () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$queryRaw).toBe('function');
    expect(typeof prisma.$executeRaw).toBe('function');
  });
});
