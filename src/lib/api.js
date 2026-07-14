// Single fetch client for the JSON API. Standalone (no React state closure): the
// caller passes the bearer token explicitly, which makes it usable from React
// Query hooks, the AuthProvider, and plain event handlers alike.
//
// Options:
//   method  - HTTP verb (default GET)
//   body    - JSON-serialized unless it's FormData (multipart passes through)
//   token   - bearer token; omit for unauthenticated calls
//   raw     - resolve with the raw Response instead of parsed JSON
export const api = async (path, { method = 'GET', body, token, raw = false } = {}) => {
  const headers = {};
  const isJson = body !== undefined && !(body instanceof FormData);
  if (isJson) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body === undefined ? undefined : isJson ? JSON.stringify(body) : body,
  });

  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
};
