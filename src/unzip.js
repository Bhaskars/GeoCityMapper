// Minimal single-entry zip extractor (stored or deflate) so builds don't depend on `unzip`.
import { open } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw } from 'node:zlib';
import { Transform } from 'node:stream';

// Extracts the first entry of `zipPath` to `outPath`; returns bytes written.
export async function extractFirstEntry(zipPath, outPath) {
  const fh = await open(zipPath, 'r');
  const head = Buffer.alloc(30);
  try { await fh.read(head, 0, 30, 0); } finally { await fh.close(); }
  if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(`${zipPath} is not a zip file`);
  const method = head.readUInt16LE(8);
  const compressedSize = head.readUInt32LE(18);
  const start = 30 + head.readUInt16LE(26) + head.readUInt16LE(28);

  let transform;
  if (method === 8) transform = createInflateRaw();
  else if (method === 0) {
    if (!compressedSize) throw new Error('zip: stored entry with unknown size is unsupported');
    let left = compressedSize;
    transform = new Transform({ transform(chunk, _e, cb) {
      const take = chunk.subarray(0, left); left -= take.length; cb(null, take);
    } });
  } else throw new Error(`zip: unsupported compression method ${method}`);

  let written = 0;
  const counter = new Transform({ transform(chunk, _e, cb) { written += chunk.length; cb(null, chunk); } });
  await pipeline(createReadStream(zipPath, { start }), transform, counter, createWriteStream(outPath));
  return written;
}

// Extracts the entry called `entryName` (via the central directory) to `outPath`.
// GeoNames zips can hold several files (e.g. iso-languagecodes.txt before the data file).
export async function extractEntry(zipPath, entryName, outPath) {
  const fh = await open(zipPath, 'r');
  let entries;
  try {
    const { size } = await fh.stat();
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (e < 0) throw new Error(`${zipPath} is not a zip file`);
    const count = tail.readUInt16LE(e + 10);
    const cdSize = tail.readUInt32LE(e + 12);
    const cdOffset = tail.readUInt32LE(e + 16);
    if (cdOffset === 0xffffffff || cdSize === 0xffffffff) throw new Error('zip64 archives are unsupported');
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    entries = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: corrupt central directory');
      const nameLen = cd.readUInt16LE(p + 28);
      entries.push({
        method: cd.readUInt16LE(p + 10), compressedSize: cd.readUInt32LE(p + 20),
        localOffset: cd.readUInt32LE(p + 42), name: cd.toString('utf8', p + 46, p + 46 + nameLen),
      });
      p += 46 + nameLen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
    }
    const hit = entries.find((x) => x.name === entryName);
    if (!hit) throw new Error(`zip: entry ${entryName} not found; available: ${entries.map((x) => x.name).join(', ')}`);
    const lh = Buffer.alloc(30);
    await fh.read(lh, 0, 30, hit.localOffset);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('zip: corrupt local header');
    const start = hit.localOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const input = createReadStream(zipPath, { start, end: start + hit.compressedSize - 1 });
    let written = 0;
    const counter = new Transform({ transform(chunk, _e, cb) { written += chunk.length; cb(null, chunk); } });
    if (hit.method !== 8 && hit.method !== 0) throw new Error(`zip: unsupported compression method ${hit.method}`);
    const stages = hit.method === 8 ? [input, createInflateRaw(), counter] : [input, counter];
    await pipeline(...stages, createWriteStream(outPath));
    return written;
  } finally {
    await fh.close();
  }
}
