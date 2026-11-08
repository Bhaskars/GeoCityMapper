import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.js';
import { openDb } from '../src/db.js';
import { Geocoder } from '../src/search.js';

// Builds a Geocoder from inline rows. place: {id,name,ascii,alts,lat,lon,cls,code,cc,a1,a2,a3,pop,tz}
export async function makeGeocoder(places, alts = []) {
  const dir = mkdtempSync(join(tmpdir(), 'geo-'));
  const row = (p) => [p.id, p.name, p.ascii ?? p.name, p.alts ?? '', p.lat ?? 0, p.lon ?? 0,
    p.cls ?? 'P', p.code ?? 'PPL', (p.cc === null ? '' : p.cc ?? 'XX'), '', p.a1 ?? '', p.a2 ?? '', p.a3 ?? '', '',
    p.pop ?? 0, '', p.elev ?? '', p.tz ?? '', '2024-01-01'].join('\t');
  writeFileSync(join(dir, 'p.txt'), places.map(row).join('\n') + '\n');
  writeFileSync(join(dir, 'a.txt'), alts.map((a, i) =>
    [i + 1, a.id, a.lang, a.name, a.pref ?? '', a.short ?? '', a.coll ?? '', a.hist ?? '', '', ''].join('\t')).join('\n') + '\n');
  const out = join(dir, 't.sqlite');
  const count = await build(join(dir, 'p.txt'), alts.length ? join(dir, 'a.txt') : null, out);
  return { g: new Geocoder(openDb(out, { readOnly: true })), count, dir };
}
