import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

// Vercel auto-detects these as a backend server entrypoint and then ignores api/*.js,
// which crashed every function in production. Keep the local dev server out of these names.
test('no file Vercel would auto-detect as the server entrypoint exists', () => {
  const conventional = ['server', 'app', 'index', 'main'].flatMap((n) =>
    ['', 'src/', 'api/../src/'].flatMap((d) => ['js', 'mjs', 'cjs', 'ts'].map((e) => `${d}${n}.${e}`)));
  const present = conventional.filter((f) => existsSync(f));
  assert.deepEqual(present, []);
});
