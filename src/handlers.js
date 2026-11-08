// Transport-independent request handlers shared by the local server and Vercel functions.
import { openDb } from './db.js';
import { Geocoder } from './search.js';

const ATTRIBUTION = 'Data: GeoNames (CC BY 4.0), geonames.org';
let cached;

// Lazily opens the database once per process (reused across warm invocations).
export function getGeocoder() {
  if (!cached) {
    const path = process.env.DB_PATH ?? new URL('../data/geocoding.sqlite', import.meta.url).pathname;
    cached = new Geocoder(openDb(path, { readOnly: true }));
  }
  return cached;
}

export function search(g, params) {
  const name = params.get('name');
  if (!name) return { status: 400, body: { error: true, reason: 'Missing parameter: name' } };
  const results = g.search({
    name, count: params.get('count') ?? 10,
    language: params.get('language') ?? '',
    countryCode: params.get('countryCode') ?? '',
  });
  return { status: 200, body: { results, attribution: ATTRIBUTION } };
}

export function getById(g, idText) {
  if (!/^\d+$/.test(idText ?? '')) return { status: 404, body: { error: true, reason: 'Not found' } };
  const r = g.get(Number(idText));
  return r ? { status: 200, body: r } : { status: 404, body: { error: true, reason: 'Not found' } };
}

export const notFound = { status: 404, body: { error: true, reason: 'Not found' } };
export const notAllowed = { status: 405, body: { error: true, reason: 'Method not allowed' } };

// Web-standard Response (used by Vercel functions).
export function toResponse({ status, body }) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}
