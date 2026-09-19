import { mkdirSync } from 'node:fs';

// Keep startup's .env discovery and all database/media writes outside user data.
const directory = process.env.BEIKE_E2E_DIR;
if (!directory) throw new Error('BEIKE_E2E_DIR is required');
mkdirSync(directory, { recursive: true });
process.chdir(directory);
await import('./block-external-fetch.cjs');
await import('../../app/api/src/index');
