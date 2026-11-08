// Downloads GeoNames dumps into data/. Usage: node src/download.js [cities15000|all]
// "cities15000" is a ~2 MB subset for development; "all" is several hundred MB.
import { mkdirSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { rmSync, statSync } from 'node:fs';
import { extractEntry } from './unzip.js';

const mode = process.argv[2] ?? 'cities15000';
const base = 'https://download.geonames.org/export/dump/';
const files = mode === 'all' ? ['allCountries.zip', 'alternateNamesV2.zip'] : ['cities15000.zip'];
mkdirSync('data', { recursive: true });

// Retries dropped connections and verifies the byte count against Content-Length.
async function downloadWithRetry(url, dest, attempts = 5) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const expected = Number(res.headers.get('content-length'));
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
      const got = statSync(dest).size;
      if (expected && got !== expected) throw new Error(`incomplete: ${got} of ${expected} bytes`);
      return;
    } catch (err) {
      console.error(`${url} attempt ${i}/${attempts} failed: ${err.message}`);
      if (i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}
for (const f of files) {
  console.log('Downloading', f);
  await downloadWithRetry(base + f, `data/${f}`);
  const txt = f.replace(/\.zip$/, '.txt');
  const bytes = await extractEntry(`data/${f}`, txt, `data/${txt}`);
  if (bytes < 1e6 && mode === 'all') throw new Error(`${txt} suspiciously small (${bytes} bytes)`);
  rmSync(`data/${f}`);
}
console.log(mode === 'all' ? 'Done.' : 'Done. Build with: node src/build.js data/cities15000.txt "" data/geocoding.sqlite');
