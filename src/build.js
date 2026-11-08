// Builds the SQLite search database from GeoNames TSV dumps.
// Usage: node src/build.js [allCountries.txt] [alternateNamesV2.txt] [out.sqlite]
import { createReadStream, existsSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { openDb, SCHEMA, INDEXES } from './db.js';
import { normalize } from './normalize.js';

// Keep populated places and administrative divisions / countries.
const keep = (cls, code) =>
  cls === 'P' || (cls === 'A' && /^(ADM[1-4]|PCL[IDFS]?)$/.test(code));

async function* lines(path) {
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) if (line) yield line.split('\t');
}

export async function build(placesFile, altFile, outFile) {
  if (altFile && !existsSync(altFile)) throw new Error(`alternate-names file not found: ${altFile}`);
  if (existsSync(outFile)) rmSync(outFile);
  const db = openDb(outFile);
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
  db.exec(SCHEMA);

  const insLoc = db.prepare(`INSERT OR REPLACE INTO locations
    (id,name,latitude,longitude,elevation,feature_code,country_code,
     admin1_code,admin2_code,admin3_code,admin4_code,population,timezone)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insName = db.prepare('INSERT INTO names (norm,lang,location_id) VALUES (?,?,?)');
  const ids = new Set();
  let count = 0;

  db.exec('BEGIN');
  for await (const c of lines(placesFile)) {
    if (c.length < 18 || !keep(c[6], c[7])) continue;
    const id = Number(c[0]);
    ids.add(id);
    insLoc.run(id, c[1], Number(c[4]), Number(c[5]), c[16] ? Number(c[16]) : null,
      c[7], c[8], c[10] || null, c[11] || null, c[12] || null, c[13] || null,
      Number(c[14]) || 0, c[17] || null);
    const seen = new Set();
    for (const n of [c[1], c[2], ...(c[3] ? c[3].split(',') : [])]) {
      const norm = normalize(n);
      if (norm && !seen.has(norm)) { seen.add(norm); insName.run(norm, 'any', id); }
    }
    count++;
  }
  db.exec('COMMIT');

  // Language-tagged alternate names (skip historic/colloquial; skip link/airport codes).
  if (altFile) {
    let altInserted = 0;
    let wellFormed = 0; // rows shaped like alternateNamesV2: numeric id, numeric geonameid, name
    db.exec('BEGIN');
    for await (const c of lines(altFile)) {
      if (c.length >= 4 && /^\d+$/.test(c[0]) && /^\d+$/.test(c[1])) wellFormed++;
      const id = Number(c[1]);
      if (!ids.has(id)) continue;
      const lang = c[2];
      if (lang === 'link' || lang === 'post' || lang === 'iata' || lang === 'icao' ||
          lang === 'faac' || lang === 'wkdt' || lang === 'unlc') continue;
      if (c[6] === '1' || c[7] === '1') continue;
      const norm = normalize(c[3]);
      if (norm) { insName.run(norm, lang || 'any', id); altInserted++; }
    }
    db.exec('COMMIT');
    console.log(`Alternate names indexed: ${altInserted}`);
    if (wellFormed === 0) throw new Error(`${altFile} has no alternate-names rows; wrong or truncated file?`);
  }

  // Resolve admin names from the ADM1..ADM4 rows themselves.
  db.exec(INDEXES);
  db.exec(`
    UPDATE locations SET admin1 = (SELECT a.name FROM locations a WHERE a.feature_code='ADM1'
      AND a.country_code=locations.country_code AND a.admin1_code=locations.admin1_code)
      WHERE admin1_code IS NOT NULL;
    UPDATE locations SET admin2 = (SELECT a.name FROM locations a WHERE a.feature_code='ADM2'
      AND a.country_code=locations.country_code AND a.admin1_code=locations.admin1_code
      AND a.admin2_code=locations.admin2_code) WHERE admin2_code IS NOT NULL;
    UPDATE locations SET admin3 = (SELECT a.name FROM locations a WHERE a.feature_code='ADM3'
      AND a.country_code=locations.country_code AND a.admin1_code=locations.admin1_code
      AND a.admin2_code=locations.admin2_code AND a.admin3_code=locations.admin3_code)
      WHERE admin3_code IS NOT NULL;
    ANALYZE;
  `);
  db.close();
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [p = 'data/allCountries.txt', a = 'data/alternateNamesV2.txt', o = 'data/geocoding.sqlite'] =
    process.argv.slice(2);
  const n = await build(p, a, o);
  console.log(`Indexed ${n} locations into ${o}`);
}
