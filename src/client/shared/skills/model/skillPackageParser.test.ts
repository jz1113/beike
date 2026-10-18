import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  normalizeSkillPackagePaths,
  parseLocalSkillFiles,
} from './skillPackageParser';

function packageMap(entries: Record<string, string>) {
  return new Map(Object.entries(entries));
}

describe('normalizeSkillPackagePaths', () => {
  it('strips a shared zip root and keeps nested paths', () => {
    const normalized = normalizeSkillPackagePaths(packageMap({
      'myskill/SKILL.md': '# 技能',
      'myskill/references/a.md': '参考',
    }));
    expect(Array.from(normalized.keys()).sort()).toEqual(['SKILL.md', 'references/a.md']);
    expect(normalized.get('references/a.md')).toBe('参考');
  });

  it('does not strip a folder when the zip already has files at the root', () => {
    const normalized = normalizeSkillPackagePaths(packageMap({
      'SKILL.md': '# 根技能',
      'references/a.md': '参考',
    }));
    expect(normalized.get('SKILL.md')).toBe('# 根技能');
    expect(normalized.get('references/a.md')).toBe('参考');
  });

  it('uses the folder that contains SKILL.md as the package root', () => {
    const normalized = normalizeSkillPackagePaths(packageMap({
      'notes.txt': '包外',
      'pkg/SKILL.md': '# 包内',
      'pkg/guide.md': '说明',
    }));
    expect(Array.from(normalized.keys()).sort()).toEqual(['SKILL.md', 'guide.md']);
    expect(normalized.has('notes.txt')).toBe(false);
  });

  it('renames a single markdown file to SKILL.md instead of duplicating it', () => {
    const normalized = normalizeSkillPackagePaths(packageMap({ 'foo.md': '# 单独文件' }));
    expect(Array.from(normalized.keys())).toEqual(['SKILL.md']);
    expect(normalized.get('SKILL.md')).toBe('# 单独文件');
  });
});

describe('parseLocalSkillFiles', () => {
  it('reads a zip package and skips binary entries', async () => {
    const zip = new JSZip();
    zip.file('myskill/SKILL.md', '# 从压缩包导入\n\n按这个流程做');
    zip.file('myskill/references/a.md', '参考');
    zip.file('myskill/cover.png', new Uint8Array([1, 2, 3]));
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    const parsed = await parseLocalSkillFiles([new File([bytes], 'pack.zip')]);
    const names = parsed.files.flatMap((node) => node.type === 'folder' ? [node.name] : [node.name]);
    expect(names).toContain('SKILL.md');
    expect(names).toContain('references');
    expect(parsed.warnings.some((warning) => warning.includes('cover.png'))).toBe(true);
    expect(parsed.draft.title.length).toBeGreaterThan(0);
  });

  it('rejects a text file over 256 KB', async () => {
    const file = new File([new Uint8Array(256 * 1024 + 1)], 'SKILL.md');
    await expect(parseLocalSkillFiles([file])).rejects.toThrow('超过 256 KB');
  });

  it('rejects a package over 1 MB', async () => {
    const files = Array.from({ length: 5 }, (_, index) => new File(
      [new Uint8Array(220 * 1024)],
      index === 0 ? 'SKILL.md' : `note-${index}.md`,
    ));
    await expect(parseLocalSkillFiles(files)).rejects.toThrow('超过 1 MB');
  });
});
