import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGeocoder } from './helpers.js';

// The deployed database must stay well under Vercel's 2 GiB single-file limit, so keep it lean.
test('names is a clustered WITHOUT ROWID table; no redundant or unused indexes', async () => {
  const { g } = await makeGeocoder([{ id: 1, name: 'Alpha' }], [{ id: 1, lang: 'de', name: 'Alfa' }]);
  const t = g.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'names'").get();
  assert.match(t.sql, /WITHOUT ROWID/i);
  const idx = g.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='names'").all()
    .map((r) => r.name);
  assert.ok(idx.every((n) => n.startsWith('sqlite_autoindex')), `unexpected indexes: ${idx}`);
  assert.ok(!idx.includes('names_loc'));
});

test('duplicate name rows are stored once', async () => {
  const { g } = await makeGeocoder(
    [{ id: 1, name: 'Alpha', alts: 'Alpha,Alfa' }],
    [{ id: 1, lang: 'de', name: 'Alfa' }, { id: 1, lang: 'de', name: 'ALFA' }, { id: 1, lang: 'fr', name: 'Alfa' }]);
  const rows = g.db.prepare('SELECT norm, lang FROM names WHERE location_id = 1 ORDER BY norm, lang').all()
    .map((r) => `${r.norm}/${r.lang}`);
  assert.deepEqual(rows, ['alfa/any', 'alfa/de', 'alfa/fr', 'alpha/any']);
});

test('no leftover scratch file after build', async () => {
  const { dir } = await makeGeocoder([{ id: 1, name: 'Alpha' }], [{ id: 1, lang: 'de', name: 'Alfa' }]);
  const { readdirSync } = await import('node:fs');
  assert.deepEqual(readdirSync(dir).filter((f) => f.includes('scratch') || f.endsWith('.tmp')), []);
});
