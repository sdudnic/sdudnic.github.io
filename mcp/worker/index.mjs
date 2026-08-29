import { catalogStatistics, normalizeReference, searchReferences, REFERENCE_FIELDS } from '../catalog-core.mjs';
import { extractBearer, ServiceError, SupabaseGateway } from '../auth.mjs';
import { handleRpc } from '../protocol.mjs';

const VERSION = '0.1.0';

class RemoteCatalog {
  constructor(env) {
    this.url = String(env.MOLDOVENEASCA_SUPABASE_URL || '').replace(/\/$/, '');
    this.key = env.MOLDOVENEASCA_SUPABASE_ANON_KEY || '';
    this.rowsCache = null;
  }

  invalidate() {
    this.rowsCache = null;
  }

  async rows() {
    if (this.rowsCache) return this.rowsCache;
    if (!this.url || !this.key) throw new ServiceError('Catalogul public nu este configurat în Worker.', { status: 503, code: 'catalog_unavailable' });
    const rows = [];
    const select = REFERENCE_FIELDS.filter((field) => !['provider', 'external_id', 'evidence_url', 'image_url'].includes(field)).join(',');
    for (let offset = 0; offset < 100_000; offset += 1_000) {
      const url = new URL(`${this.url}/rest/v1/language_references`);
      url.searchParams.set('select', select);
      url.searchParams.set('status', 'eq.published');
      url.searchParams.set('order', 'year_start.asc,id.asc');
      url.searchParams.set('limit', '1000');
      url.searchParams.set('offset', String(offset));
      const response = await fetch(url, { headers: { apikey: this.key, authorization: `Bearer ${this.key}` } });
      if (!response.ok) throw new ServiceError(`Supabase a răspuns cu ${response.status}.`, { status: 502, code: 'supabase_error' });
      const batch = await response.json();
      for (const row of Array.isArray(batch) ? batch : []) {
        const normalized = normalizeReference(row);
        if (normalized) rows.push(normalized);
      }
      if (!Array.isArray(batch) || batch.length < 1_000) break;
    }
    this.rowsCache = rows;
    return rows;
  }

  async search(input) {
    const rows = await this.rows();
    return { ...searchReferences(rows, input), source: { kind: 'supabase', url: this.url, count: rows.length, visibility: 'published' } };
  }

  async get(id) {
    const rows = await this.rows();
    const cached = rows.find((row) => row.id === String(id)) || null;
    if (!cached || !this.url || !this.key) return cached;
    const url = new URL(`${this.url}/rest/v1/language_references`);
    url.searchParams.set('select', REFERENCE_FIELDS.filter((field) => !['provider', 'external_id', 'evidence_url'].includes(field)).join(','));
    url.searchParams.set('id', 'eq.' + encodeURIComponent(String(id)));
    url.searchParams.set('status', 'eq.published');
    url.searchParams.set('limit', '1');
    const response = await fetch(url, { headers: { apikey: this.key, authorization: `Bearer ${this.key}` } });
    if (!response.ok) throw new ServiceError(`Supabase a răspuns cu ${response.status}.`, { status: 502, code: 'supabase_error' });
    const batch = await response.json();
    return normalizeReference(Array.isArray(batch) ? batch[0] : null) || cached;
  }

  async statistics() {
    const rows = await this.rows();
    return catalogStatistics(rows, { kind: 'supabase', url: this.url, count: rows.length, visibility: 'published' });
  }
}

function cors(env) {
  return {
    'access-control-allow-origin': env.MOLDOVENEASCA_CORS_ORIGIN || '*',
    'access-control-allow-headers': 'Authorization, Content-Type, X-API-Key, MCP-Protocol-Version',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-expose-headers': 'MCP-Session-Id',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  };
}

function json(data, status, env, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors(env), 'content-type': 'application/json; charset=utf-8', ...extra } });
}

function apiKeyAllowed(request, env) {
  const configured = String(env.MOLDOVENEASCA_API_KEY || '');
  return !configured || request.headers.get('X-API-Key') === configured;
}

function mcpAuthRequired(env) {
  return String(env.MOLDOVENEASCA_REQUIRE_MCP_AUTH || '').toLowerCase() === 'true';
}

function queryObject(url) {
  const query = Object.fromEntries(url.searchParams.entries());
  for (const key of ['status', 'catalog_type', 'source_type']) {
    if (query[key]?.includes(',')) query[key] = query[key].split(',').map((value) => value.trim()).filter(Boolean);
  }
  return query;
}

function gatewayFor(env) {
  return new SupabaseGateway({ url: env.MOLDOVENEASCA_SUPABASE_URL, key: env.MOLDOVENEASCA_SUPABASE_ANON_KEY, primaryAdminEmail: env.MOLDOVENEASCA_PRIMARY_ADMIN_EMAIL || 'sdudnic@gmail.com' });
}

function openApi() {
  return {
    openapi: '3.1.0',
    info: { title: 'Moldovenească References API', version: VERSION, description: 'Catalog public și fluxuri autentificate de premoderare.' },
    paths: {
      '/health': { get: {} },
      '/api/references': { get: {}, post: {} },
      '/api/references/{id}': { get: {}, patch: {}, delete: {} },
      '/api/references/{id}/review': { post: {} },
      '/api/unverified': { get: {} },
      '/api/moderation-requests': { get: {} },
      '/api/moderation-requests/{id}/review': { post: {} },
      '/api/stats': { get: {} },
      '/mcp': { post: {} }
    }
  };
}

async function body(request, { allowEmpty = false } = {}) {
  const length = Number(request.headers.get('content-length') || 0);
  // Permitem imaginea compactată de aproximativ 1,5 MB plus metadatele JSON;
  // limita imaginii propriu-zise este verificată separat în auth.mjs.
  if (length > 3_000_000) throw new ServiceError('Corpul cererii este prea mare.', { status: 413, code: 'payload_too_large' });
  if (!request.body) {
    if (allowEmpty) return {};
    throw new ServiceError('Corpul cererii trebuie să fie JSON valid.', { status: 400, code: 'invalid_json' });
  }
  try { return await request.json(); } catch { throw new ServiceError('Corpul cererii trebuie să fie JSON valid.', { status: 400, code: 'invalid_json' }); }
}

async function http(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
  if (!apiKeyAllowed(request, env)) return json({ error: { code: 'api_key_required', message: 'Este necesară cheia API.' } }, 401, env);
  const store = new RemoteCatalog(env);
  const gateway = gatewayFor(env);
  const context = { store, gateway, authenticate: (token) => gateway.authenticate(token), headers: Object.fromEntries(request.headers), accessToken: extractBearer(Object.fromEntries(request.headers)) };
  try {
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, service: 'moldoveneasca-references', version: VERSION, runtime: 'cloudflare-workers' }, 200, env);
    if (url.pathname === '/openapi.json' && request.method === 'GET') return json(openApi(), 200, env);
    if ((url.pathname === '/' || url.pathname === '/api') && request.method === 'GET') return json({ service: 'moldoveneasca-references', mcp: '/mcp', rest: ['/api/references', '/api/references/{id}', '/api/stats'] }, 200, env);
    if (url.pathname === '/api/stats' && request.method === 'GET') return json({ data: await store.statistics() }, 200, env);
    if (url.pathname === '/api/references' && request.method === 'GET') return json({ data: await store.search(queryObject(url)) }, 200, env);
    if (url.pathname === '/api/references' && request.method === 'POST') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      return json({ data: await gateway.createReference(auth, await body(request)) }, 201, env);
    }
    if (url.pathname === '/api/unverified' && request.method === 'GET') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const items = await gateway.listUnverified(auth);
      return json({ data: { items, count: items.length } }, 200, env);
    }
    if (url.pathname === '/api/moderation-requests' && request.method === 'GET') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const query = queryObject(url);
      const items = await gateway.listModerationRequests(auth, { status: query.status || 'pending', requestType: query.request_type || null });
      return json({ data: { items, count: items.length } }, 200, env);
    }
    const reviewRequest = url.pathname.match(/^\/api\/moderation-requests\/([^/]+)\/review$/);
    if (reviewRequest && request.method === 'POST') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const input = await body(request);
      return json({ data: await gateway.reviewModerationRequest(auth, decodeURIComponent(reviewRequest[1]), input.action, input.note) }, 200, env);
    }
    const reviewReference = url.pathname.match(/^\/api\/references\/([^/]+)\/review$/);
    if (reviewReference && request.method === 'POST') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const input = await body(request);
      return json({ data: await gateway.reviewReference(auth, decodeURIComponent(reviewReference[1]), input.action, input.note) }, 200, env);
    }
    const reference = url.pathname.match(/^\/api\/references\/([^/]+)$/);
    if (reference && request.method === 'GET') {
      const item = await store.get(decodeURIComponent(reference[1]));
      return item ? json({ data: item }, 200, env) : json({ error: { code: 'not_found', message: 'Referința nu a fost găsită sau nu este publicată.' } }, 404, env);
    }
    if (reference && request.method === 'PATCH') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const input = await body(request);
      const changes = input?.changes && typeof input.changes === 'object' ? input.changes : input;
      return json({ data: await gateway.updateReference(auth, decodeURIComponent(reference[1]), changes, input?.reason) }, 200, env);
    }
    if (reference && request.method === 'DELETE') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const input = await body(request, { allowEmpty: true });
      return json({ data: await gateway.deleteOrSuggest(auth, decodeURIComponent(reference[1]), input?.reason) }, 200, env);
    }
    if (url.pathname === '/mcp' && request.method === 'POST') {
      const token = extractBearer(request.headers);
      if (mcpAuthRequired(env)) {
        if (!token) return new Response(null, { status: 401, headers: { ...cors(env), 'www-authenticate': 'Bearer' } });
        await gateway.authenticate(token);
      }
      const input = await body(request);
      const inputs = Array.isArray(input) ? input : [input];
      const results = [];
      for (const rpc of inputs) {
        const result = await handleRpc(rpc, context);
        if (result) results.push(result);
      }
      if (!results.length) return new Response(null, { status: 202, headers: cors(env) });
      return json(Array.isArray(input) ? results : results[0], 200, env, { 'mcp-protocol-version': request.headers.get('MCP-Protocol-Version') || '2026-07-28' });
    }
    return json({ error: { code: 'not_found', message: 'Ruta nu există.' } }, 404, env);
  } catch (error) {
    const status = error instanceof ServiceError ? error.status : 500;
    return json({ error: { code: error.code || 'internal_error', message: error.message || 'Eroare internă.' } }, status, env);
  }
}

export default { fetch(request, env) { return http(request, env); } };
