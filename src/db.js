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
CREATE TABLE IF NOT EXISTS names (
  norm TEXT NOT NULL,
  lang TEXT NOT NULL,
  location_id INTEGER NOT NULL
);
`;

export const INDEXES = `
CREATE INDEX IF NOT EXISTS names_norm ON names(norm);
CREATE INDEX IF NOT EXISTS names_loc ON names(location_id);
CREATE INDEX IF NOT EXISTS loc_admin ON locations(country_code, feature_code, admin1_code);
`;

export function openDb(path, { readOnly = false } = {}) {
  return new DatabaseSync(path, { readOnly });
}
