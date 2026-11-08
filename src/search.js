import { normalize } from './normalize.js';

export class Geocoder {
  constructor(db) {
    this.db = db;
    this.stmt = db.prepare(`
      SELECT l.*, MAX(n.norm = :q) AS exact,
             MAX(n.lang = :lang AND :lang != '') AS lang_hit
      FROM names n JOIN locations l ON l.id = n.location_id
      WHERE n.norm >= :q AND n.norm < :hi
        AND (:cc = '' OR l.country_code = :cc)
      GROUP BY l.id
      ORDER BY exact DESC, lang_hit DESC,
               (l.feature_code IN ('ADM2','ADM3','ADM4')) ASC, l.population DESC, l.id
      LIMIT :limit`);
    this.byId = db.prepare('SELECT * FROM locations WHERE id = ?');
  }

  search({ name, count = 10, language = '', countryCode = '' }) {
    const q = normalize(name);
    if (q.length < 2) return [];
    count = Math.min(Math.max(1, Number(count) || 10), 100);
    const rows = this.stmt.all({
      q, hi: q + '￿', lang: language.toLowerCase(), cc: countryCode.toUpperCase(), limit: count,
    });
    return rows.map(toResult);
  }

  get(id) {
    const r = this.byId.get(id);
    return r ? toResult(r) : null;
  }
}

function toResult(r) {
  const out = {
    id: r.id, name: r.name, latitude: r.latitude, longitude: r.longitude,
    elevation: r.elevation, feature_code: r.feature_code, country_code: r.country_code,
    timezone: r.timezone, population: r.population,
    admin1: r.admin1, admin2: r.admin2, admin3: r.admin3,
  };
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return out;
}
