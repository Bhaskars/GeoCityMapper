import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGeocoder } from './helpers.js';

test('exact match on ANY name beats a bigger prefix-only match', async () => {
  const { g } = await makeGeocoder([
    { id: 1, name: 'Springfield', alts: 'Springfield Town,Spring Field City', pop: 100 },
    { id: 2, name: 'Springfield Heights', pop: 900000 },
  ]);
  assert.deepEqual(g.search({ name: 'springfield' }).map((r) => r.id), [1, 2]);
});

test('requested language prefers locations with a name in that language', async () => {
  const { g } = await makeGeocoder(
    [{ id: 1, name: 'Alpha', pop: 10 }, { id: 2, name: 'Beta', pop: 5000 }],
    [{ id: 1, lang: 'de', name: 'Gemeinsam' }, { id: 2, lang: 'fr', name: 'Gemeinsam' }]);
  assert.deepEqual(g.search({ name: 'gemeinsam', language: 'de' }).map((r) => r.id), [1, 2]);
  assert.deepEqual(g.search({ name: 'gemeinsam', language: 'fr' }).map((r) => r.id), [2, 1]);
  assert.deepEqual(g.search({ name: 'gemeinsam' }).map((r) => r.id), [2, 1]);
});

test('ties on exact and population are ordered by id (deterministic)', async () => {
  const { g } = await makeGeocoder([{ id: 9, name: 'Dup', pop: 5 }, { id: 3, name: 'Dup', pop: 5 }]);
  assert.deepEqual(g.search({ name: 'dup' }).map((r) => r.id), [3, 9]);
});

test('a location with many matching names appears once', async () => {
  const { g } = await makeGeocoder([{ id: 1, name: 'Roma', alts: 'Rome,Rom,Roma' }],
    [{ id: 1, lang: 'en', name: 'Rome' }, { id: 1, lang: 'de', name: 'Rom' }]);
  assert.equal(g.search({ name: 'ro' }).length, 1);
});

test('a city outranks a sub-state district of the same name even if the district is bigger', async () => {
  const { g } = await makeGeocoder([
    { id: 1, name: 'Koeln District', alts: 'Koeln', cls: 'A', code: 'ADM2', pop: 4000000 },
    { id: 2, name: 'Koeln', cls: 'P', code: 'PPLA2', pop: 1000000 },
  ]);
  assert.deepEqual(g.search({ name: 'koeln' }).map((r) => r.id), [2, 1]);
});

test('ADM3/ADM4 are also demoted below places', async () => {
  const { g } = await makeGeocoder([
    { id: 1, name: 'Dup3', cls: 'A', code: 'ADM3', pop: 900 },
    { id: 2, name: 'Dup4', alts: 'Dup3', cls: 'A', code: 'ADM4', pop: 800 },
    { id: 3, name: 'Dup3', cls: 'P', code: 'PPL', pop: 1 },
  ]);
  assert.equal(g.search({ name: 'dup3' })[0].id, 3);
});

test('a state (ADM1) and a country (PCLI) still rank by population against places', async () => {
  const { g } = await makeGeocoder([
    { id: 1, name: 'Texas', cls: 'A', code: 'ADM1', pop: 29000000 },
    { id: 2, name: 'Texas', cls: 'P', code: 'PPL', pop: 50 },
    { id: 3, name: 'India', cls: 'A', code: 'PCLI', pop: 1400000000 },
    { id: 4, name: 'India', cls: 'P', code: 'PPL', pop: 100 },
  ]);
  assert.equal(g.search({ name: 'texas' })[0].id, 1);
  assert.equal(g.search({ name: 'india' })[0].id, 3);
});

test('demotion never beats an exact-match difference', async () => {
  const { g } = await makeGeocoder([
    { id: 1, name: 'Zork', cls: 'A', code: 'ADM2', pop: 10 },
    { id: 2, name: 'Zork Town', cls: 'P', code: 'PPL', pop: 99999 },
  ]);
  assert.equal(g.search({ name: 'zork' })[0].id, 1);
});
