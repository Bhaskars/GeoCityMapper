import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeGeocoder } from './helpers.js';
import { build } from '../src/build.js';
import { normalize } from '../src/normalize.js';
import { Geocoder } from '../src/search.js';

test('normalize edge cases', () => {
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
  assert.equal(normalize(''), '');
  assert.equal(normalize('---'), '');
  assert.equal(normalize("St. John's"), 'st john s');
  assert.equal(normalize('Москва'), 'москва');
  assert.equal(normalize('東京'), '東京');
  assert.equal(normalize(123), '123');
});

test('build keeps populated places/admin/countries and drops other feature classes', async () => {
  const { g, count } = await makeGeocoder([
    { id: 1, name: 'Town', cls: 'P', code: 'PPL' },
    { id: 2, name: 'Region', cls: 'A', code: 'ADM1', a1: '01' },
    { id: 3, name: 'Country', cls: 'A', code: 'PCLI' },
    { id: 4, name: 'Mountain', cls: 'T', code: 'MT' },
    { id: 5, name: 'Lake', cls: 'H', code: 'LK' },
    { id: 6, name: 'Zone', cls: 'A', code: 'ZN' },
    { id: 7, name: 'Hotel', cls: 'S', code: 'HTL' },
  ]);
  assert.equal(count, 3);
  assert.ok(g.get(1) && g.get(2) && g.get(3));
  assert.equal(g.get(4), null);
  assert.equal(g.search({ name: 'mountain' }).length, 0);
});

test('build skips malformed and blank lines without crashing', async () => {
  const { dir } = await makeGeocoder([{ id: 1, name: 'Fine' }]);
  writeFileSync(join(dir, 'bad.txt'), 'garbage line\n\nonly\ttwo\n');
  assert.equal(await build(join(dir, 'bad.txt'), null, join(dir, 'bad.sqlite')), 0);
});

test('build works when no alternate-names file is requested', async () => {
  const { dir } = await makeGeocoder([{ id: 1, name: 'Fine' }]);
  assert.equal(await build(join(dir, 'p.txt'), null, join(dir, 'x.sqlite')), 1);
  assert.equal(await build(join(dir, 'p.txt'), '', join(dir, 'y.sqlite')), 1);
});

test('build fails loudly if a requested alternate-names file is missing', async () => {
  const { dir } = await makeGeocoder([{ id: 1, name: 'Fine' }]);
  await assert.rejects(build(join(dir, 'p.txt'), '/nonexistent/alt.txt', join(dir, 'z.sqlite')), /alternate/i);
});

test('rebuilding overwrites the previous database', async () => {
  const { dir } = await makeGeocoder([{ id: 1, name: 'Fine' }]);
  const out = join(dir, 'again.sqlite');
  await build(join(dir, 'p.txt'), null, out);
  assert.equal(await build(join(dir, 'p.txt'), null, out), 1);
});

test('alternate names for unknown/filtered locations are ignored', async () => {
  const { g } = await makeGeocoder([{ id: 1, name: 'Real' }, { id: 2, name: 'Peak', cls: 'T', code: 'MT' }],
    [{ id: 99, lang: 'en', name: 'Ghost' }, { id: 2, lang: 'en', name: 'Phantom' }]);
  assert.equal(g.search({ name: 'ghost' }).length, 0);
  assert.equal(g.search({ name: 'phantom' }).length, 0);
});

test('excluded alternate kinds: colloquial, historic, codes', async () => {
  const { g } = await makeGeocoder([{ id: 1, name: 'Real' }], [
    { id: 1, lang: 'en', name: 'Colloq', coll: '1' },
    { id: 1, lang: 'en', name: 'Histor', hist: '1' },
    { id: 1, lang: 'iata', name: 'ZZZ' },
    { id: 1, lang: 'post', name: '99999' },
    { id: 1, lang: 'en', name: 'Keeper' },
  ]);
  for (const n of ['colloq', 'histor', 'zzz', '99999']) assert.equal(g.search({ name: n }).length, 0, n);
  assert.equal(g.search({ name: 'keeper' }).length, 1);
});

test('admin2/admin3 names resolved and missing admins omitted', async () => {
  const { g } = await makeGeocoder([
    { id: 1, name: 'Village', cc: 'AA', a1: '1', a2: '2', a3: '3' },
    { id: 10, name: 'Province', cls: 'A', code: 'ADM1', cc: 'AA', a1: '1' },
    { id: 11, name: 'District', cls: 'A', code: 'ADM2', cc: 'AA', a1: '1', a2: '2' },
    { id: 12, name: 'Commune', cls: 'A', code: 'ADM3', cc: 'AA', a1: '1', a2: '2', a3: '3' },
    { id: 2, name: 'Loner', cc: 'BB' },
  ]);
  const v = g.get(1);
  assert.deepEqual([v.admin1, v.admin2, v.admin3], ['Province', 'District', 'Commune']);
  assert.equal('admin1' in g.get(2), false);
});

test('admin names do not leak across countries', async () => {
  const { g } = await makeGeocoder([
    { id: 1, name: 'Town', cc: 'AA', a1: '1' },
    { id: 10, name: 'Wrong', cls: 'A', code: 'ADM1', cc: 'BB', a1: '1' },
  ]);
  assert.equal(g.get(1).admin1, undefined);
});

test('result shape: no null fields, numeric coords', async () => {
  const { g } = await makeGeocoder([{ id: 1, name: 'X1', lat: -33.5, lon: 151.2, elev: 12, tz: 'Australia/Sydney', pop: 7 }]);
  const r = g.get(1);
  assert.equal(r.latitude, -33.5);
  assert.equal(r.longitude, 151.2);
  assert.equal(r.elevation, 12);
  assert.equal(r.timezone, 'Australia/Sydney');
  assert.ok(Object.values(r).every((v) => v !== null && v !== undefined));
});

test('query robustness: SQL metacharacters, wildcards, whitespace, huge input', async () => {
  const { g } = await makeGeocoder([{ id: 1, name: 'Normal Town' }, { id: 2, name: "O'Brien" }]);
  assert.deepEqual(g.search({ name: "'; DROP TABLE locations;--" }), []);
  assert.deepEqual(g.search({ name: '%%' }), []);
  assert.deepEqual(g.search({ name: '__' }), []);
  assert.deepEqual(g.search({ name: '   ' }), []);
  assert.deepEqual(g.search({ name: '' }), []);
  assert.deepEqual(g.search({}), []);
  assert.deepEqual(g.search({ name: 'x'.repeat(100000) }), []);
  assert.equal(g.search({ name: "o'brien" })[0].id, 2);
  assert.equal(g.search({ name: '  normal   town ' })[0].id, 1);
  assert.equal(g.search({ name: 'NORMAL' })[0].id, 1);
  assert.equal(g.get(1).id, 1); // table survived
});

test('count clamping and coercion', async () => {
  const places = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, name: `Zed${i}`, pop: i }));
  const { g } = await makeGeocoder(places);
  assert.equal(g.search({ name: 'zed' }).length, 10);
  assert.equal(g.search({ name: 'zed', count: 3 }).length, 3);
  assert.equal(g.search({ name: 'zed', count: '4' }).length, 4);
  assert.equal(g.search({ name: 'zed', count: 0 }).length, 10);
  assert.equal(g.search({ name: 'zed', count: -5 }).length, 1);
  assert.equal(g.search({ name: 'zed', count: 'abc' }).length, 10);
  assert.equal(g.search({ name: 'zed', count: 100000 }).length, 100);
});

test('countryCode filter is case-insensitive; unknown country yields nothing', async () => {
  const { g } = await makeGeocoder([{ id: 1, name: 'Kin', cc: 'FR' }, { id: 2, name: 'Kin', cc: 'DE' }]);
  assert.deepEqual(g.search({ name: 'kin', countryCode: 'fr' }).map((r) => r.id), [1]);
  assert.deepEqual(g.search({ name: 'kin', countryCode: 'ZZ' }), []);
});

test('get() for missing id returns null', async () => {
  const { g } = await makeGeocoder([{ id: 1, name: 'A1' }]);
  assert.equal(g.get(424242), null);
});

test('build fails if the alternate-names file is not alternate-names shaped (e.g. iso-languagecodes)', async () => {
  const { dir } = await makeGeocoder([{ id: 1, name: 'Fine' }]);
  writeFileSync(join(dir, 'wrong.txt'), 'aa\tbb\ncc\tdd\n');
  await assert.rejects(build(join(dir, 'p.txt'), join(dir, 'wrong.txt'), join(dir, 'w.sqlite')), /no alternate-names rows/);
});
