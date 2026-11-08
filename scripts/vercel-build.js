// Runs on Vercel at build time: fetch GeoNames, build the SQLite database, drop raw dumps.
// (The database is 1.5 GB, over Vercel's 100 MB per-file upload limit, so it is built remotely.)
import { execFileSync } from 'node:child_process';
import { rmSync, statSync } from 'node:fs';

const run = (...args) => execFileSync('node', args, { stdio: 'inherit' });
run('src/download.js', 'all');
run('src/build.js', 'data/allCountries.txt', 'data/alternateNamesV2.txt', 'data/geocoding.sqlite');
rmSync('data/allCountries.txt');
rmSync('data/alternateNamesV2.txt');
console.log(`Database ready: ${(statSync('data/geocoding.sqlite').size / 1e9).toFixed(2)} GB`);
