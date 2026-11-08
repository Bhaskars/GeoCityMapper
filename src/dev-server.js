import { createServer } from 'node:http';
import { getGeocoder, search, getById, notFound, notAllowed } from './handlers.js';

export function makeServer(geocoder) {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = ({ status, body }) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return send(notAllowed);
    if (url.pathname === '/health') return send({ status: 200, body: { ok: true } });
    if (url.pathname === '/v1/search') return send(search(geocoder, url.searchParams));
    const m = url.pathname.match(/^\/v1\/get\/([^/]+)$/);
    if (m) return send(getById(geocoder, m[1]));
    send(notFound);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8080);
  makeServer(getGeocoder()).listen(port, () => console.log(`Listening on :${port}`));
}
