import { rmSync } from 'node:fs';
export default function setup() {
  const directory = process.env.BEIKE_E2E_DIR;
  return () => { if (directory) rmSync(directory, { recursive: true, force: true }); };
}
