import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractFirstEntry, extractEntry } from '../src/unzip.js';

test('extracts the single entry of a deflate zip, byte-identical', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const text = Array.from({ length: 20000 }, (_, i) => `row ${i}\tÎle-de-France\t${i * 7}`).join('\n') + '\n';
  writeFileSync(join(dir, 'data.txt'), text);
  execFileSync('zip', ['-q', 'data.zip', 'data.txt'], { cwd: dir });
  const n = await extractFirstEntry(join(dir, 'data.zip'), join(dir, 'out.txt'));
  assert.equal(readFileSync(join(dir, 'out.txt'), 'utf8'), text);
  assert.equal(n, Buffer.byteLength(text));
});

test('handles stored (uncompressed) entries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  writeFileSync(join(dir, 'a.txt'), 'hello\n');
  execFileSync('zip', ['-q', '-0', 'a.zip', 'a.txt'], { cwd: dir });
  await extractFirstEntry(join(dir, 'a.zip'), join(dir, 'o.txt'));
  assert.equal(readFileSync(join(dir, 'o.txt'), 'utf8'), 'hello\n');
});

test('rejects a non-zip file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  writeFileSync(join(dir, 'x.zip'), 'not a zip file at all, definitely not');
  await assert.rejects(extractFirstEntry(join(dir, 'x.zip'), join(dir, 'o')), /zip/i);
});

test('extracts a named entry from a multi-entry zip (decoy entry first)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const big = Array.from({ length: 5000 }, (_, i) => `alt ${i}\tLondres`).join('\n') + '\n';
  writeFileSync(join(dir, 'iso-languagecodes.txt'), 'decoy\n');
  writeFileSync(join(dir, 'alternateNamesV2.txt'), big);
  execFileSync('zip', ['-q', 'm.zip', 'iso-languagecodes.txt', 'alternateNamesV2.txt'], { cwd: dir });
  const n = await extractEntry(join(dir, 'm.zip'), 'alternateNamesV2.txt', join(dir, 'out.txt'));
  assert.equal(readFileSync(join(dir, 'out.txt'), 'utf8'), big);
  assert.equal(n, Buffer.byteLength(big));
  await extractEntry(join(dir, 'm.zip'), 'iso-languagecodes.txt', join(dir, 'o2.txt'));
  assert.equal(readFileSync(join(dir, 'o2.txt'), 'utf8'), 'decoy\n');
});

test('missing entry name throws and lists available entries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  writeFileSync(join(dir, 'a.txt'), 'x\n');
  execFileSync('zip', ['-q', 'a.zip', 'a.txt'], { cwd: dir });
  await assert.rejects(extractEntry(join(dir, 'a.zip'), 'nope.txt', join(dir, 'o')), /nope\.txt.*a\.txt/s);
});
