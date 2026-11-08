import { getGeocoder, getById, toResponse, notAllowed } from '../src/handlers.js';

export default {
  fetch(request) {
    if (request.method !== 'GET') return toResponse(notAllowed);
    return toResponse(getById(getGeocoder(), new URL(request.url).searchParams.get('id')));
  },
};
