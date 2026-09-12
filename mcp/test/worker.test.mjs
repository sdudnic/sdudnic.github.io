import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';

test('Worker încarcă direct detaliul și întoarce 404 pentru o referință absentă', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls += 1;
    const query = new URL(url).searchParams;
    assert.equal(query.get('id'), 'eq.id with space');
    assert.equal(query.get('limit'), '1');
    assert.equal(query.get('status'), 'eq.published');
    return Response.json(calls === 1 ? [{ id: 'id with space', title: 'Sursă', status: 'published' }] : []);
  });
  const configured = { MOLDOVENEASCA_SUPABASE_URL: 'https://example.test', MOLDOVENEASCA_SUPABASE_ANON_KEY: 'anon' };
  const request = () => new Request('https://mcp.example/api/references/id%20with%20space');
  assert.equal((await worker.fetch(request(), configured)).status, 200);
  assert.equal(calls, 1);
  assert.equal((await worker.fetch(request(), configured)).status, 404);
  assert.equal(calls, 2);
});

const env = {
  MOLDOVENEASCA_PRIMARY_ADMIN_EMAIL: 'sdudnic@gmail.com',
  MOLDOVENEASCA_REQUIRE_MCP_AUTH: 'true'
};

test('Worker health check is public', async () => {
  const response = await worker.fetch(new Request('https://mcp.example/health'), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test('Worker requires a bearer token for the remote MCP endpoint', async () => {
  const response = await worker.fetch(new Request('https://mcp.example/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  }), env);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('www-authenticate'), 'Bearer');
});
