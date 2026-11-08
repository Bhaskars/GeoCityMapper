import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeGeocoder } from './helpers.js';
import { makeServer } from '../src/server.js';

let srv, base;
before(async () => {
  const places = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Qux${i}`, cc: i % 2 ? 'FR' : 'DE', pop: i }));
  const { g } = await makeGeocoder(places);
  srv = makeServer(g).listen(0);
  base = `http://localhost:${srv.address().port}`;
});
after(() => srv.close());
const j = async (p, init) => { const r = await fetch(base + p, init); return [r, await r.json()]; };

test('health', async () => { const [r, b] = await j('/health'); assert.equal(r.status, 200); assert.deepEqual(b, { ok: true }); });
test('search: JSON content-type and CORS', async () => {
  const [r] = await j('/v1/search?name=qux');
  assert.match(r.headers.get('content-type'), /application\/json/);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});
test('search: count and countryCode params', async () => {
  assert.equal((await j('/v1/search?name=qux&count=5'))[1].results.length, 5);
  const [, b] = await j('/v1/search?name=qux&countryCode=fr&count=100');
  assert.equal(b.results.length, 15);
  assert.ok(b.results.every((x) => x.country_code === 'FR'));
});
test('search: missing/empty name → 400, short name → empty results', async () => {
  assert.equal((await j('/v1/search'))[0].status, 400);
  assert.equal((await j('/v1/search?name='))[0].status, 400);
  const [r, b] = await j('/v1/search?name=q');
  assert.equal(r.status, 200); assert.deepEqual(b.results, []);
});
test('search: URL-encoded unicode name', async () => {
  const [r, b] = await j('/v1/search?name=' + encodeURIComponent('Qüx1'));
  assert.equal(r.status, 200); assert.ok(b.results.length > 0);
});
test('get: found, missing, non-numeric', async () => {
  assert.equal((await j('/v1/get/5'))[1].id, 5);
  assert.equal((await j('/v1/get/99999'))[0].status, 404);
  assert.equal((await j('/v1/get/abc'))[0].status, 404);
});
test('unknown path → 404; non-GET → 405', async () => {
  assert.equal((await j('/nope'))[0].status, 404);
  assert.equal((await j('/v1/search?name=qux', { method: 'POST' }))[0].status, 405);
  assert.equal((await j('/health', { method: 'DELETE' }))[0].status, 405);
});
test('every search response carries GeoNames attribution', async () => {
  assert.match((await j('/v1/search?name=qux'))[1].attribution, /GeoNames/);
});
