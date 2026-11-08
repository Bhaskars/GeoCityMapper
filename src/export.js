// Exports per-country offline city files plus a manifest, for on-demand loading in the browser.
// Usage: node src/export.js [minPopulation=1000] [db=data/geocoding.sqlite] [outDir=dist/cities] [completeCountries=IN,LK,ID,...]
import { mkdirSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { openDb } from './db.js';

export const COLUMNS = ['geonameId', 'name', 'admin1', 'lat', 'lon', 'timezone', 'population'];
// India, Sri Lanka and South-East Asia ship every populated place, villages included.
export const DEFAULT_COMPLETE = ['IN', 'LK', 'ID', 'MY', 'SG', 'TH', 'VN', 'PH', 'MM', 'KH', 'LA', 'BN', 'TL'];
const round3 = (n) => Math.round(n * 1000) / 1000;

export function buildShards(db, { minPopulation = 1000, fullCountries = DEFAULT_COMPLETE } = {}) {
  const complete = new Set(fullCountries);
  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const countryName = (code) => {
    try { return regionNames.of(code) || code; } catch { return code; }
  };

  // Populated places only; historic (PPLH), abandoned (PPLQ) and destroyed (PPLW) no longer exist.
  const rows = db.prepare(`
    SELECT id, name, country_code, admin1, latitude, longitude, timezone, population
    FROM locations
    WHERE feature_code LIKE 'PPL%' AND feature_code NOT IN ('PPLH','PPLQ','PPLW')
      AND country_code IS NOT NULL AND country_code != ''
    ORDER BY country_code, population DESC, name, id`).all();

  const shards = new Map();
  for (const r of rows) {
    if (!complete.has(r.country_code) && r.population < minPopulation) continue;
    let s = shards.get(r.country_code);
    if (!s) {
      s = { meta: { country: r.country_code, columns: COLUMNS }, admin1: [''], timezones: [''], cities: [],
        _ad: new Map([['', 0]]), _tz: new Map([['', 0]]) };
      shards.set(r.country_code, s);
    }
    const intern = (map, list, key) => {
      let i = map.get(key);
      if (i === undefined) { i = list.length; list.push(key); map.set(key, i); }
      return i;
    };
    s.cities.push([r.id, r.name, intern(s._ad, s.admin1, r.admin1 ?? ''), round3(r.latitude),
      round3(r.longitude), intern(s._tz, s.timezones, r.timezone ?? ''), r.population]);
  }
  for (const s of shards.values()) { delete s._ad; delete s._tz; s.meta.count = s.cities.length; }

  const manifest = {
    meta: {
      version: 1, minPopulation, completeCountries: [...complete].sort(), columns: COLUMNS,
      attribution: 'Data: GeoNames (https://www.geonames.org/)',
      license: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
    },
    countries: [...shards.values()].map((s) => ({
      code: s.meta.country, name: countryName(s.meta.country), file: `${s.meta.country}.json`,
      count: s.cities.length, complete: complete.has(s.meta.country),
    })).sort((a, b) => a.name.localeCompare(b.name)),
  };
  return { manifest, shards };
}

export function writeShards({ manifest, shards }, outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f.endsWith('.json')) rmSync(`${outDir}/${f}`); // drop stale shards
  for (const [code, shard] of shards) writeFileSync(`${outDir}/${code}.json`, JSON.stringify(shard));
  writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [min = '1000', dbPath = 'data/geocoding.sqlite', out = 'dist/cities', full] = process.argv.slice(2);
  const built = buildShards(openDb(dbPath, { readOnly: true }),
    { minPopulation: Number(min), ...(full ? { fullCountries: full.split(',') } : {}) });
  writeShards(built, out);
  const total = [...built.shards.values()].reduce((n, s) => n + s.cities.length, 0);
  const size = (c) => statSync(`${out}/${c}.json`).size;
  console.log(`${built.shards.size} country files in ${out}/, ${total} places in total`);
  for (const c of ['IN', 'LK', 'ID', 'FR', 'US']) if (built.shards.has(c))
    console.log(`  ${c}: ${built.shards.get(c).cities.length} places, ${(size(c) / 1e6).toFixed(2)} MB`);
}
