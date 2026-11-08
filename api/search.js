import { getGeocoder, search, toResponse, notAllowed } from '../src/handlers.js';

export default {
  fetch(request) {
    if (request.method !== 'GET') return toResponse(notAllowed);
    return toResponse(search(getGeocoder(), new URL(request.url).searchParams));
  },
};
