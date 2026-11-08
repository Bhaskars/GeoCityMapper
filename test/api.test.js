import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeGeocoder } from './helpers.js';
import { join } from 'node:path';

let search, get, health;
before(async () => {
  const { dir } = await makeGeocoder([{ id: 7, name: 'Vercelton', cc: 'US', pop: 5 }]);
  process.env.DB_PATH = join(dir, 't.sqlite');
  ({ default: search } = await import('../api/search.js'));
  ({ default: get } = await import('../api/get.js'));
  ({ default: health } = await import('../api/health.js'));
});
const req = (path, method = 'GET') => new Request('https://x.test' + path, { method });

test('api/search returns results with CORS + attribution', async () => {
  const r = await search.fetch(req('/api/search?name=vercel'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const b = await r.json();
  assert.equal(b.results[0].id, 7);
  assert.match(b.attribution, /GeoNames/);
});
test('api/search validates', async () => {
  assert.equal((await search.fetch(req('/api/search'))).status, 400);
  assert.equal((await search.fetch(req('/api/search?name=vercel', 'POST'))).status, 405);
});
test('api/get', async () => {
  assert.equal((await get.fetch(req('/api/get?id=7'))).status, 200);
  assert.equal((await get.fetch(req('/api/get?id=8'))).status, 404);
  assert.equal((await get.fetch(req('/api/get?id=abc'))).status, 404);
  assert.equal((await get.fetch(req('/api/get'))).status, 404);
});
test('api/health', async () => {
  assert.equal((await health.fetch(req('/api/health'))).status, 200);
  assert.equal((await health.fetch(req('/api/health', 'POST'))).status, 405);
});
