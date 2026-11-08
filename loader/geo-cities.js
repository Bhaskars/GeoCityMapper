// Browser-side on-demand loader: fetches one small file per selected country, caches it,
// and offers prefix search. No dependencies; works as an ES module in browsers and Node 18+.
//   const geo = createLoader({ base: '/data/cities' });
//   const countries = await geo.countries();          // for the country dropdown
//   const hits = await geo.find('IN', 'tiruv', { limit: 10 });
const norm = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function createLoader({ base = '/data/cities', fetch: fetchFn = globalThis.fetch } = {}) {
  let manifestP;
  const shardP = new Map();
  const index = new WeakMap();

  const getJson = async (url) => {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
    return res.json();
  };
  const countries = () => {
    manifestP ??= getJson(`${base}/manifest.json`).then((m) => m.countries, (e) => { manifestP = undefined; throw e; });
    return manifestP;
  };

  const load = async (code) => {
    code = String(code).toUpperCase();
    if (!shardP.has(code)) {
      const p = (async () => {
        const entry = (await countries()).find((c) => c.code === code);
        if (!entry) throw new Error(`No city data for country ${code}`);
        return getJson(`${base}/${entry.file}`);
      })();
      shardP.set(code, p);
      p.catch(() => shardP.delete(code)); // failed downloads can be retried
    }
    return shardP.get(code);
  };

  const find = async (code, text, { limit = 10 } = {}) => {
    const q = norm(text);
    if (!q) return [];
    const shard = await load(code);
    let names = index.get(shard);
    if (!names) { names = shard.cities.map((r) => norm(r[1])); index.set(shard, names); }
    const out = [];
    for (let i = 0; i < names.length && out.length < limit; i++) {
      if (!names[i].startsWith(q)) continue;
      const [id, name, ai, lat, lon, ti, population] = shard.cities[i];
      out.push({ id, name, country: shard.meta.country, admin1: shard.admin1[ai], lat, lon,
        timezone: shard.timezones[ti], population });
    }
    return out;
  };

  return { countries, load, find };
}
