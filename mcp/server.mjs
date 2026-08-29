import { createServer } from 'node:http';
import { createCatalogStore } from './catalog.mjs';
import { createSupabaseGateway, extractBearer, ServiceError } from './auth.mjs';
import { createSupabaseSession } from './auth-session.mjs';
import { handleRpc } from './protocol.mjs';

const env = process.env;
const store = createCatalogStore(env);
const gateway = createSupabaseGateway(env);
const apiKey = String(env.MOLDOVENEASCA_API_KEY || '');
const stdioAccessToken = String(env.MOLDOVENEASCA_SUPABASE_ACCESS_TOKEN || '').trim() || null;
const localSession = process.argv.includes('--stdio') && !stdioAccessToken ? createSupabaseSession(env, gateway) : null;

const context = {
  store,
  gateway,
  authenticate: (token) => localSession ? localSession.authenticate() : gateway.authenticate(token),
  accessToken: stdioAccessToken,
  headers: {}
};

function corsHeaders() {
  return {
    'access-control-allow-origin': env.MOLDOVENEASCA_CORS_ORIGIN || '*',
    'access-control-allow-headers': 'Authorization, Content-Type, X-API-Key, MCP-Protocol-Version',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-expose-headers': 'MCP-Session-Id',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  };
}

function authorizedApiKey(request) {
  if (!apiKey) return true;
  // Bearer este rezervat tokenului Supabase al utilizatorului; cheia opțională
  // a serviciului se transmite separat, ca X-API-Key.
  const candidate = request.headers['x-api-key'];
  return candidate === apiKey;
}

function sendJson(response, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  response.writeHead(status, { ...corsHeaders(), 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), ...extraHeaders });
  response.end(body);
}

function sendEmpty(response, status = 204) {
  response.writeHead(status, corsHeaders());
  response.end();
}

// Permitem o data URL compactat de aproximativ 1,5 MB plus metadatele JSON;
// limita imaginii propriu-zise este verificată separat în auth.mjs.
async function readBody(request, maxBytes = 3_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new ServiceError('Corpul cererii este prea mare.', { status: 413, code: 'payload_too_large' });
    chunks.push(chunk);
  }
  if (!size) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ServiceError('Corpul cererii trebuie să fie JSON valid.', { status: 400, code: 'invalid_json' }); }
}

function queryObject(url) {
  const query = Object.fromEntries(url.searchParams.entries());
  for (const key of ['status', 'catalog_type', 'source_type', 'author', 'language']) {
    if (query[key]?.includes(',')) query[key] = query[key].split(',').map((part) => part.trim()).filter(Boolean);
  }
  return query;
}

function openApiDocument() {
  return {
    openapi: '3.1.0',
    info: { title: 'Moldovenească References API', version: '0.1.0', description: 'Catalog public și fluxuri autentificate de premoderare.' },
    paths: {
      '/health': { get: { responses: { '200': { description: 'Server activ.' } } } },
      '/api/references': { get: { parameters: [{ name: 'q', in: 'query' }, { name: 'status', in: 'query' }, { name: 'from_year', in: 'query' }, { name: 'to_year', in: 'query' }, { name: 'limit', in: 'query' }, { name: 'offset', in: 'query' }], responses: { '200': { description: 'Referințe filtrate.' } } }, post: { description: 'Adaugă o contribuție autentificată; non-adminii primesc pending.' } },
      '/api/references/{id}': { get: { responses: { '200': { description: 'Referință individuală.' }, '404': { description: 'Nu există.' } } }, patch: { description: 'Editează direct doar conform rolului; propunerile neautorizate intră la premoderare.' }, delete: { description: 'Șterge numai proprietarul sau înregistrează o sugestie.' } },
      '/api/references/{id}/review': { post: { description: 'Confirmă sau infirmă o referință; numai proprietarul catalogului.' } },
      '/api/unverified': { get: { description: 'Contribuții cu status pending ale utilizatorului sau lista de lucru a administratorului.' } },
      '/api/moderation-requests/{id}/review': { post: { description: 'Confirmă sau respinge o sugestie de moderare.' } },
      '/api/stats': { get: { responses: { '200': { description: 'Statistici.' } } } },
      '/mcp': { post: { description: 'JSON-RPC MCP; necesită Bearer pentru mutări.', responses: { '200': { description: 'Răspuns JSON-RPC.' } } } }
    }
  };
}

async function handleHttp(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  context.headers = request.headers;
  if (request.method === 'OPTIONS') return sendEmpty(response);
  if (!authorizedApiKey(request)) return sendJson(response, 401, { error: { code: 'api_key_required', message: 'Este necesară cheia API.' } });

  try {
    if (url.pathname === '/health' && request.method === 'GET') {
      return sendJson(response, 200, { ok: true, service: 'moldoveneasca-references', version: '0.1.0', source: store.sourceKind });
    }
    if (url.pathname === '/openapi.json' && request.method === 'GET') return sendJson(response, 200, openApiDocument());
    if ((url.pathname === '/' || url.pathname === '/api') && request.method === 'GET') {
      return sendJson(response, 200, { service: 'moldoveneasca-references', mcp: '/mcp', rest: ['/api/references', '/api/references/{id}', '/api/stats'], auth: 'Bearer Supabase pentru contribuții și moderare' });
    }
    if (url.pathname === '/api/stats' && request.method === 'GET') return sendJson(response, 200, { data: await store.statistics() });
    if (url.pathname === '/api/references' && request.method === 'GET') {
      return sendJson(response, 200, { data: await store.search(queryObject(url)) });
    }
    if (url.pathname === '/api/references' && request.method === 'POST') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      return sendJson(response, 201, { data: await gateway.createReference(auth, await readBody(request)) });
    }
    if (url.pathname === '/api/unverified' && request.method === 'GET') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const items = await gateway.listUnverified(auth);
      return sendJson(response, 200, { data: { items, count: items.length } });
    }
    if (url.pathname === '/api/moderation-requests' && request.method === 'GET') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const query = queryObject(url);
      const items = await gateway.listModerationRequests(auth, { status: query.status || 'pending', requestType: query.request_type || null });
      return sendJson(response, 200, { data: { items, count: items.length } });
    }
    const referenceMatch = url.pathname.match(/^\/api\/references\/([^/]+)$/);
    if (referenceMatch && request.method === 'GET') {
      const reference = await store.get(decodeURIComponent(referenceMatch[1]));
      if (!reference) return sendJson(response, 404, { error: { code: 'not_found', message: 'Referința nu a fost găsită sau nu este publicată.' } });
      return sendJson(response, 200, { data: reference });
    }
    if (referenceMatch && request.method === 'PATCH') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const body = await readBody(request);
      const changes = body?.changes && typeof body.changes === 'object' ? body.changes : body;
      return sendJson(response, 200, { data: await gateway.updateReference(auth, decodeURIComponent(referenceMatch[1]), changes, body?.reason) });
    }
    if (referenceMatch && request.method === 'DELETE') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const body = await readBody(request);
      return sendJson(response, 200, { data: await gateway.deleteOrSuggest(auth, decodeURIComponent(referenceMatch[1]), body?.reason) });
    }
    const reviewReferenceMatch = url.pathname.match(/^\/api\/references\/([^/]+)\/review$/);
    if (reviewReferenceMatch && request.method === 'POST') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const body = await readBody(request) || {};
      return sendJson(response, 200, { data: await gateway.reviewReference(auth, decodeURIComponent(reviewReferenceMatch[1]), body.action, body.note) });
    }
    const reviewRequestMatch = url.pathname.match(/^\/api\/moderation-requests\/([^/]+)\/review$/);
    if (reviewRequestMatch && request.method === 'POST') {
      const auth = await gateway.authenticate(extractBearer(request.headers));
      const body = await readBody(request) || {};
      return sendJson(response, 200, { data: await gateway.reviewModerationRequest(auth, decodeURIComponent(reviewRequestMatch[1]), body.action, body.note) });
    }
    if (url.pathname === '/mcp' && request.method === 'POST') {
      const body = await readBody(request);
      const requests = Array.isArray(body) ? body : [body];
      const results = [];
      for (const rpcRequest of requests) {
        const result = await handleRpc(rpcRequest, { ...context, authenticate: (token) => gateway.authenticate(token), headers: request.headers, accessToken: extractBearer(request.headers) });
        if (result) results.push(result);
      }
      if (!results.length) return sendEmpty(response, 202);
      return sendJson(response, 200, Array.isArray(body) ? results : results[0], { 'mcp-protocol-version': request.headers['mcp-protocol-version'] || '2026-07-28' });
    }
    return sendJson(response, 404, { error: { code: 'not_found', message: 'Ruta nu există.' } });
  } catch (error) {
    const status = error instanceof ServiceError ? error.status : 500;
    return sendJson(response, status, { error: { code: error.code || 'internal_error', message: error.message || 'Eroare internă.' } });
  }
}

export function createHttpServer() {
  return createServer((request, response) => {
    handleHttp(request, response).catch((error) => sendJson(response, 500, { error: { code: 'internal_error', message: error.message } }));
  });
}

async function runStdio() {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let request;
      try { request = JSON.parse(line); } catch {
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalid.' } })}\n`);
        continue;
      }
      const result = await handleRpc(request, context);
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  }
}

if (process.argv.includes('--stdio')) {
  await runStdio();
} else if (process.argv.includes('--http') || process.env.MOLDOVENEASCA_TRANSPORT === 'http' || process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.MOLDOVENEASCA_HOST || '127.0.0.1';
  createHttpServer().listen(port, host, () => {
    console.error(`Moldovenească MCP/API ascultă la http://${host}:${port}`);
  });
}
