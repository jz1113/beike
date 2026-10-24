#!/usr/bin/env node
/** Compile the Go API before production startup. */
import { buildGateway, getWorkspaceRoot } from './web-shared.mjs';

try {
  console.log(`[build:api] ${buildGateway(getWorkspaceRoot())}`);
} catch (error) {
  console.error(`[build:api] ${error.message}`);
  process.exitCode = 1;
}
