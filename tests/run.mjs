// Chạy test mô phỏng headless: node tests/run.mjs [file.ts]
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const entry = process.argv[2] ?? 'tests/sim.test.ts';
const out = join(mkdtempSync(join(tmpdir(), 'rts-test-')), 'out.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
await import(pathToFileURL(out).href);
