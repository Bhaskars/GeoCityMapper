import { DatabaseSync } from 'node:sqlite';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  elevation INTEGER,
  feature_code TEXT,
  country_code TEXT,
  admin1_code TEXT, admin2_code TEXT, admin3_code TEXT, admin4_code TEXT,
  admin1 TEXT, admin2 TEXT, admin3 TEXT, admin4 TEXT,
  population INTEGER NOT NULL DEFAULT 0,
  timezone TEXT
);
-- Clustered on (norm, location_id, lang): prefix scans read the table directly, with no
-- separate index copy of every name, and duplicate rows cannot exist.
CREATE TABLE IF NOT EXISTS names (
  norm TEXT NOT NULL,
  lang TEXT NOT NULL,
  location_id INTEGER NOT NULL,
  PRIMARY KEY (norm, location_id, lang)
) WITHOUT ROWID;
`;

export const INDEXES = `
CREATE INDEX IF NOT EXISTS loc_admin ON locations(country_code, feature_code, admin1_code);
`;

export function openDb(path, { readOnly = false } = {}) {
  return new DatabaseSync(path, { readOnly });
}
