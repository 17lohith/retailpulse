// Thin fetch wrapper: JSON in/out, bearer token, friendly errors.
let token = localStorage.getItem('rp_token') || '';
export const setToken = (t) => { token = t || ''; t ? localStorage.setItem('rp_token', t) : localStorage.removeItem('rp_token'); };
export const getToken = () => token;

export class ApiError extends Error { constructor(status, body) { super(body?.message || 'Something went wrong.'); this.status = status; this.body = body || {}; this.fields = body?.fields; } }

async function req(method, url, body, opts = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  let payload;
  if (body instanceof FormData) payload = body; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, { method, headers, body: payload }); } catch { throw new ApiError(0, { message: 'Cannot reach the server. Check your internet connection.' }); }
  if (opts.raw) return res;
  const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) { if (res.status === 401 && token && !url.includes('/auth/login')) { setToken(''); window.dispatchEvent(new Event('rp-logout')); } throw new ApiError(res.status, data); }
  return data;
}
export const api = {
  get: (u, params) => req('GET', params ? `${u}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null))}` : u),
  post: (u, b) => req('POST', u, b ?? {}), patch: (u, b) => req('PATCH', u, b), del: (u, b) => req('DELETE', u, b), raw: (u) => req('GET', u, undefined, { raw: true }),
  upload: (u, form) => req('POST', u, form),
};
