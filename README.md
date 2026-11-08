# citymapper-geocoding

Location search API over GeoNames data. Node 22.13+, zero dependencies (uses built-in `node:sqlite`).

```bash
npm run download            # dev subset (cities15000, ~2 MB); `node src/download.js all` for full data
node src/build.js data/cities15000.txt "" data/geocoding.sqlite
npm start                   # http://localhost:8080
npm test
```

API: `GET /v1/search?name=paris&count=10&language=fr&countryCode=FR`, `GET /v1/get/{geonameId}`, `GET /health`.

Ranking: exact normalized match first, then population. Matching is prefix-based, case- and diacritic-insensitive.

Data attribution (required): see NOTICE.md. Responses include an `attribution` field; keep a visible GeoNames credit in any UI.
