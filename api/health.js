import { toResponse, notAllowed } from '../src/handlers.js';

export default {
  fetch(request) {
    return toResponse(request.method === 'GET' ? { status: 200, body: { ok: true } } : notAllowed);
  },
};
