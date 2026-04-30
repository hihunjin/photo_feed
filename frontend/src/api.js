const API_BASE = '';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const isFormData = options.body instanceof FormData;
  const isString = typeof options.body === 'string';

  if (options.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
    if (!isString) {
      options.body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }

  return data;
}

// ── Auth ──
export function login(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

// ── Bands ──
export function getBands() {
  return request('/api/bands');
}

export function createBand(payload) {
  return request('/api/bands', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// ── Feeds ──
export function getFeeds(bandId, params = {}) {
  const search = new URLSearchParams();
  if (params.sort) search.set('sort', params.sort);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.search) search.set('search', params.search);
  if (params.date) search.set('date', params.date);
  return request(`/api/bands/${bandId}/feeds${search.toString() ? `?${search}` : ''}`);
}

export function getFeedDates(bandId) {
  return request(`/api/bands/${bandId}/feeds/dates`);
}

export function getFeed(feedId) {
  return request(`/api/feeds/${feedId}`);
}

export function createFeed(bandId, formData) {
  return request(`/api/bands/${bandId}/feeds`, {
    method: 'POST',
    body: formData
  });
}

// ── Albums ──
export function getAlbums(bandId, params = {}) {
  const search = new URLSearchParams();
  if (params.limit) search.set('limit', String(params.limit));
  if (params.cursor) search.set('cursor', params.cursor);
  return request(`/api/bands/${bandId}/albums${search.toString() ? `?${search}` : ''}`);
}

export function getAlbum(albumId) {
  return request(`/api/albums/${albumId}`);
}

export function createAlbum(bandId, formData) {
  return request(`/api/bands/${bandId}/albums`, {
    method: 'POST',
    body: formData
  });
}

// ── Comments ──
export function getComments(targetType, targetId, params = {}) {
  const search = new URLSearchParams();
  search.set('targetType', targetType);
  search.set('targetId', String(targetId));
  if (params.limit) search.set('limit', String(params.limit));
  if (params.cursor) search.set('cursor', params.cursor);
  return request(`/api/comments?${search}`);
}

export function createComment({ targetType, targetId, content }) {
  return request('/api/comments', {
    method: 'POST',
    body: JSON.stringify({ targetType, targetId, content })
  });
}

// ── Updates ──
export function updateBand(bandId, payload) {
  return request(`/api/bands/${bandId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function updateFeed(feedId, payload) {
  return request(`/api/feeds/${feedId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function updateAlbum(albumId, payload) {
  return request(`/api/albums/${albumId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

// ── Feed Photo Management ──
export function addFeedPhoto(feedId, file) {
  const formData = new FormData();
  formData.append('photo', file);
  return request(`/api/feeds/${feedId}/photos`, {
    method: 'POST',
    body: formData
  });
}

export function deleteFeedPhoto(feedId, photoId) {
  return request(`/api/feeds/${feedId}/photos/${photoId}`, {
    method: 'DELETE'
  });
}

export function addAlbumPhoto(albumId, file) {
  const formData = new FormData();
  formData.append('photo', file);
  return request(`/api/albums/${albumId}/photos`, {
    method: 'POST',
    body: formData
  });
}

export function deleteAlbumPhoto(albumId, photoId) {
  return request(`/api/albums/${albumId}/photos/${photoId}`, {
    method: 'DELETE'
  });
}

export async function uploadFile(file) {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/photos/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export function getThumbnailStatus(uniquePhotoId) {
  return request(`/api/photos/${uniquePhotoId}/thumb-status`);
}
