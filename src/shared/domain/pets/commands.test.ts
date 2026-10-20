import { describe, expect, it } from 'vitest';
import { parsePetCommands } from './commands';

describe('codex pet import commands', () => {
  it('reads one or more add commands and ignores blank lines', () => {
    expect(parsePetCommands('  npx codex-pets add q-ban-da-fei-yu \r\n\nnpx   codex-pets   add   pet-6ac83c93535081918861d5c78bb9a8fc')).toEqual([
      { input: 'npx codex-pets add q-ban-da-fei-yu', id: 'q-ban-da-fei-yu' },
      { input: 'npx   codex-pets   add   pet-6ac83c93535081918861d5c78bb9a8fc', id: 'pet-6ac83c93535081918861d5c78bb9a8fc' },
    ]);
  });

  it('rejects shell syntax, other commands and arbitrary addresses', () => {
    const parsed = parsePetCommands([
      'npx codex-pets add tiny-dino && rm -rf /',
      'npx codex-pets add-collection cats',
      'npx codex-pets add https://evil.example/pet',
      'curl https://codex-pets.net/tiny-dino',
    ].join('\n'));
    expect(parsed.every((item) => item.error && !item.id)).toBe(true);
  });
});
