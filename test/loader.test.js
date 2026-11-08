import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../loader/geo-cities.js';

const manifest = { meta: { version: 1 }, countries: [
  { code: 'IN', name: 'India', file: 'IN.json', count: 3, complete: true },
  { code: 'FR', name: 'France', file: 'FR.json', count: 2, complete: false }] };
const shard = (code, rows) => ({ meta: { country: code }, admin1: [''], timezones: [''], cities: rows });
const files = {
  '/d/manifest.json': manifest,
  '/d/IN.json': shard('IN', [[3, 'Tirupati', 0, 13, 79, 0, 9], [1, 'Mumbai', 0, 19, 72, 0, 5], [2, 'Tiny Vällage', 0, 19, 73, 0, 0]]),
  '/d/FR.json': shard('FR', [[8, 'Paris', 0, 48, 2, 0, 2]]),
};
function fakeFetch() {
  const calls = [];
  const f = async (url) => {
    calls.push(url);
    return files[url] ? { ok: true, status: 200, json: async () => files[url] } : { ok: false, status: 404 };
  };
  f.calls = calls;
  return f;
}

test('countries() fetches the manifest once', async () => {
  const f = fakeFetch(); const l = createLoader({ base: '/d', fetch: f });
  const c = await l.countries(); await l.countries();
  assert.deepEqual(c.map((x) => x.code), ['IN', 'FR']);
  assert.equal(f.calls.filter((u) => u.endsWith('manifest.json')).length, 1);
});

test('load(country) fetches only that country file, lazily, and caches it', async () => {
  const f = fakeFetch(); const l = createLoader({ base: '/d', fetch: f });
  assert.equal(f.calls.length, 0);
  const a = await l.load('in'); const b = await l.load('IN');
  assert.equal(a, b);
  assert.deepEqual(f.calls, ['/d/manifest.json', '/d/IN.json']);
  assert.ok(!f.calls.includes('/d/FR.json'));
});

test('concurrent load() calls share one request', async () => {
  const f = fakeFetch(); const l = createLoader({ base: '/d', fetch: f });
  await Promise.all([l.load('IN'), l.load('IN'), l.load('IN')]);
  assert.equal(f.calls.filter((u) => u.endsWith('IN.json')).length, 1);
});

test('unknown country rejects with a clear error and does not fetch a file', async () => {
  const f = fakeFetch(); const l = createLoader({ base: '/d', fetch: f });
  await assert.rejects(l.load('ZZ'), /ZZ/);
  assert.ok(!f.calls.some((u) => u.includes('ZZ')));
});

test('a failed download is not cached; a retry can succeed', async () => {
  let fail = true;
  const f = async (url) => (url.endsWith('IN.json') && fail
    ? { ok: false, status: 503 } : { ok: true, status: 200, json: async () => files[url] });
  const l = createLoader({ base: '/d', fetch: f });
  await assert.rejects(l.load('IN'), /503/);
  fail = false;
  assert.equal((await l.load('IN')).meta.country, 'IN');
});

test('find() does prefix search, case/diacritic-insensitive, in file (population) order, with limit', async () => {
  const l = createLoader({ base: '/d', fetch: fakeFetch() });
  assert.deepEqual((await l.find('IN', 'ti')).map((c) => c.name), ['Tirupati', 'Tiny Vällage']);
  assert.deepEqual((await l.find('IN', 'TINY VALLAGE')).map((c) => c.id), [2]);
  assert.equal((await l.find('IN', 'ti', { limit: 1 })).length, 1);
  assert.deepEqual(await l.find('IN', 'zzz'), []);
  assert.deepEqual(await l.find('IN', ''), []);
});

test('find() returns self-describing objects', async () => {
  const l = createLoader({ base: '/d', fetch: fakeFetch() });
  assert.deepEqual((await l.find('FR', 'paris'))[0],
    { id: 8, name: 'Paris', country: 'FR', admin1: '', lat: 48, lon: 2, timezone: '', population: 2 });
});

test('loader normalization matches the server-side normalizer', async () => {
  const { normalize } = await import('../src/normalize.js');
  const rows = ['Île-de-France', "St. John's", 'Москва', 'São  Paulo', '東京', 'Zürich', 'தஞ்சாவூர்'];
  for (const n of rows) {
    const q = normalize(n);
    const shard = { meta: { country: 'XX' }, admin1: [''], timezones: [''], cities: [[1, n, 0, 0, 0, 0, 0]] };
    const loader = createLoader({ base: '/n', fetch: async (u) => ({ ok: true, status: 200,
      json: async () => (u.endsWith('manifest.json') ? { countries: [{ code: 'XX', file: 'XX.json' }] } : shard) }) });
    assert.equal((await loader.find('XX', q)).length, 1, n);
  }
});
