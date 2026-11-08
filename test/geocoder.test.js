import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.js';
import { openDb } from '../src/db.js';
import { Geocoder } from '../src/search.js';
import { normalize } from '../src/normalize.js';
import { makeServer } from '../src/server.js';

let g, db;
before(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'geo-')), 't.sqlite');
  const n = await build('test/fixtures/places.txt', 'test/fixtures/alternates.txt', out);
  assert.equal(n, 6);
  db = openDb(out, { readOnly: true });
  g = new Geocoder(db);
});

test('normalize strips diacritics and punctuation', () => {
  assert.equal(normalize('Île-de-France'), 'ile de france');
  assert.equal(normalize('  São  Paulo '), 'sao paulo');
});

test('exact match outranks higher-population prefix match; population breaks ties', () => {
  const r = g.search({ name: 'paris' });
  assert.deepEqual(r.map((x) => x.id), [2988507, 4717560, 2988358]);
});

test('prefix search', () => {
  assert.ok(g.search({ name: 'lond' }).some((x) => x.id === 2643743));
});

test('diacritic-insensitive and alternate-language names', () => {
  assert.equal(g.search({ name: 'Île de France' })[0].id, 2996268);
  assert.equal(g.search({ name: 'Londres', language: 'es' })[0].id, 2643743);
  assert.equal(g.search({ name: 'Париж' })[0].id, 2988507);
});

test('historic/colloquial and link names are excluded', () => {
  assert.equal(g.search({ name: 'ville lumiere' }).length, 0);
  assert.equal(g.search({ name: 'http' }).length, 0);
});

test('countryCode filter and count limit', () => {
  assert.deepEqual(g.search({ name: 'paris', countryCode: 'us' }).map((x) => x.id), [4717560]);
  assert.equal(g.search({ name: 'paris', count: 1 }).length, 1);
});

test('admin1 name resolved', () => {
  assert.equal(g.search({ name: 'paris', countryCode: 'FR' })[0].admin1, 'Île-de-France');
});

test('short queries return nothing', () => {
  assert.deepEqual(g.search({ name: 'p' }), []);
});

test('HTTP API', async () => {
  const srv = makeServer(g).listen(0);
  const { port } = srv.address();
  const ok = await (await fetch(`http://localhost:${port}/v1/search?name=london`)).json();
  assert.equal(ok.results[0].name, 'London');
  assert.match(ok.attribution, /GeoNames/);
  assert.equal((await fetch(`http://localhost:${port}/v1/search`)).status, 400);
  assert.equal((await fetch(`http://localhost:${port}/v1/get/2643743`)).status, 200);
  assert.equal((await fetch(`http://localhost:${port}/v1/get/1`)).status, 404);
  srv.close();
});
