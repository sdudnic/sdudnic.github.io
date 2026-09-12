import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageStorageClient } from '../image-storage-client.mjs';

test('clientul local încarcă data URL-ul în Worker și păstrează descrierea galeriei', async () => {
  const calls = [];
  const client = createImageStorageClient({ MOLDOVENEASCA_IMAGE_API_URL: 'https://mcp.example' }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ data: { url: 'https://mcp.example/api/images/references/hash.png' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  const result = await client.materialize({
    image_items: [{ url: 'data:image/png;base64,AAAA', description: 'Pagina verificată' }]
  }, { token: 'user-token' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://mcp.example/api/images');
  assert.equal(calls[0].options.headers.authorization, 'Bearer user-token');
  assert.equal(calls[0].options.headers['content-type'], 'image/png');
  assert.deepEqual(Array.from(calls[0].options.body), [0, 0, 0]);
  assert.deepEqual(result.payload.image_items, [{ url: 'https://mcp.example/api/images/references/hash.png', description: 'Pagina verificată' }]);
  assert.equal(result.payload.image_url, result.payload.image_items[0].url);
});
