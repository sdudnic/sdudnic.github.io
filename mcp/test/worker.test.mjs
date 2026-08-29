import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';

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
