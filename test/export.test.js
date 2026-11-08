import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeGeocoder } from './helpers.js';
import { buildShards, writeShards } from '../src/export.js';

const places = [
  { id: 1, name: 'Mumbai', cc: 'IN', a1: '16', pop: 12000000, lat: 19.0728, lon: 72.8826, tz: 'Asia/Kolkata' },
  { id: 2, name: 'Tiny Village', cc: 'IN', a1: '16', pop: 0, lat: 19.5, lon: 73.5, tz: 'Asia/Kolkata' },
  { id: 3, name: 'Another Village', cc: 'IN', a1: '16', pop: 0, lat: 19.6, lon: 73.6, tz: 'Asia/Kolkata' },
  { id: 4, name: 'Ghost Village', cc: 'IN', code: 'PPLH', pop: 0, lat: 20, lon: 74, tz: 'Asia/Kolkata' },
  { id: 5, name: 'Abandoned', cc: 'IN', code: 'PPLQ', pop: 0 },
  { id: 6, name: 'Destroyed', cc: 'IN', code: 'PPLW', pop: 0 },
  { id: 7, name: 'Kandy', cc: 'LK', pop: 0, lat: 7.29, lon: 80.63, tz: 'Asia/Colombo' },
  { id: 8, name: 'Paris', cc: 'FR', a1: '11', pop: 2000000, lat: 48.85341, lon: 2.34881, tz: 'Europe/Paris' },
  { id: 9, name: 'Hamlet', cc: 'FR', pop: 12, lat: 46, lon: 2, tz: 'Europe/Paris' },
  { id: 10, name: 'Town', cc: 'FR', pop: 1000, lat: 47, lon: 3, tz: 'Europe/Paris' },
  { id: 20, name: 'Maharashtra', cls: 'A', code: 'ADM1', cc: 'IN', a1: '16', pop: 99999999 },
  { id: 21, name: 'Ile', cls: 'A', code: 'ADM1', cc: 'FR', a1: '11' },
  { id: 22, name: 'Mount', cls: 'T', code: 'MT', cc: 'IN', pop: 5000 },
  { id: 30, name: 'Nowhere', cc: null, pop: 5000 },
];
const build = async (opts = {}) => buildShards((await makeGeocoder(places)).g.db,
  { minPopulation: 1000, fullCountries: ['IN', 'LK'], ...opts });

test('full countries keep EVERY populated place, including population 0 villages', async () => {
  const { shards } = await build();
  assert.deepEqual(shards.get('IN').cities.map((r) => r[0]), [1, 3, 2]);
  assert.deepEqual(shards.get('LK').cities.map((r) => r[0]), [7]);
});

test('other countries apply the population threshold', async () => {
  const { shards } = await build();
  assert.deepEqual(shards.get('FR').cities.map((r) => r[0]), [8, 10]);
  assert.deepEqual((await build({ minPopulation: 0 })).shards.get('FR').cities.map((r) => r[0]), [8, 10, 9]);
});

test('historic, abandoned and destroyed places are excluded even for full countries', async () => {
  const ids = (await build()).shards.get('IN').cities.map((r) => r[0]);
  for (const bad of [4, 5, 6]) assert.ok(!ids.includes(bad), `id ${bad}`);
});

test('admin divisions, non-places and country-less rows never appear', async () => {
  const { shards } = await build();
  const all = [...shards.values()].flatMap((s) => s.cities.map((r) => r[0]));
  for (const bad of [20, 21, 22, 30]) assert.ok(!all.includes(bad), `id ${bad}`);
  assert.deepEqual([...shards.keys()].sort(), ['FR', 'IN', 'LK']);
});

test('every kept place lands in exactly one shard', async () => {
  const all = [...(await build()).shards.values()].flatMap((s) => s.cities.map((r) => r[0]));
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, 6);
});

test('rows resolve through per-shard tables; country is implied by the shard', async () => {
  const s = (await build()).shards.get('FR');
  const [id, name, ai, lat, lon, ti, pop] = s.cities[0];
  assert.equal(id, 8);
  assert.equal(name, 'Paris');
  assert.equal(s.admin1[ai], 'Ile');
  assert.equal(s.timezones[ti], 'Europe/Paris');
  assert.equal(lat, 48.853);
  assert.equal(lon, 2.349);
  assert.equal(pop, 2000000);
  assert.equal(s.admin1[0], '');
  assert.equal(s.timezones[0], '');
  assert.deepEqual(s.meta.columns, ['geonameId', 'name', 'admin1', 'lat', 'lon', 'timezone', 'population']);
  assert.equal(s.meta.country, 'FR');
});

test('order: population desc, then name, then id', async () => {
  const names = (await build()).shards.get('IN').cities.map((r) => r[1]);
  assert.deepEqual(names, ['Mumbai', 'Another Village', 'Tiny Village']);
});

test('manifest lists every shard with counts, names and completeness flag', async () => {
  const { manifest } = await build();
  const by = Object.fromEntries(manifest.countries.map((c) => [c.code, c]));
  assert.deepEqual(by.IN, { code: 'IN', name: 'India', file: 'IN.json', count: 3, complete: true });
  assert.equal(by.FR.complete, false);
  assert.equal(by.FR.count, 2);
  assert.equal(manifest.meta.version, 1);
  assert.match(manifest.meta.attribution, /GeoNames/);
  assert.match(manifest.meta.license, /CC BY 4\.0/);
  assert.equal(manifest.meta.minPopulation, 1000);
  assert.deepEqual(manifest.meta.completeCountries, ['IN', 'LK']);
});

test('writeShards writes manifest.json and one file per country', async () => {
  const out = mkdtempSync(join(tmpdir(), 'shards-'));
  const built = await build();
  writeShards(built, out);
  assert.ok(existsSync(join(out, 'manifest.json')));
  const fr = JSON.parse(readFileSync(join(out, 'FR.json'), 'utf8'));
  assert.equal(fr.cities.length, 2);
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')).countries.map((c) => c.code).sort(),
    ['FR', 'IN', 'LK']);
});
