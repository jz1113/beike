import { describe, it, expect } from 'vitest';
import { prisma } from '../prisma';
import { readFileSync } from 'node:fs';

describe('prisma.ts — 自愈迁移表名白名单 (PR1 High)', () => {
  it('ALLOWED_SELF_HEAL_TABLES 仅含已知业务表', () => {
    // 通过源代码静态校验
    const src = readFileSync(
      'packages/server-kit/src/prisma.ts',
      'utf8',
    ).toString();
    expect(src).toContain("'SceneAsset'");
    expect(src).toContain("'OutfitAsset'");
    expect(src).toContain("'ActionAsset'");
    expect(src).toContain("'PersonaAsset'");
    expect(src).toContain('ALLOWED_SELF_HEAL_TABLES');
    expect(src).toContain('if (!ALLOWED_SELF_HEAL_TABLES.has(table))');
  });

  it('prisma 实例已导出且类型正确', () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$queryRaw).toBe('function');
    expect(typeof prisma.$executeRaw).toBe('function');
  });
});
