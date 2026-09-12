import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import { imageKeyFromPath, materializeReferenceImages, putDataImage, putImageBytes } from '../worker/image-storage.mjs';

class MemoryR2 {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.objects.set(key, {
      bytes,
      contentType: options.httpMetadata?.contentType || 'application/octet-stream',
      etag: `"${key}"`
    });
    return { key, size: bytes.byteLength };
  }

  async get(key) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      body: new Blob([stored.bytes], { type: stored.contentType }),
      httpEtag: stored.etag,
      writeHttpMetadata(headers) { headers.set('content-type', stored.contentType); }
    };
  }

  async delete(key) {
    this.objects.delete(key);
  }
}

test('imaginile data sunt transformate în URL-uri R2 fără să rămână Base64 în payload', async () => {
  const bucket = new MemoryR2();
  const result = await materializeReferenceImages(
    { MOLDOVENEASCA_IMAGES: bucket },
    new Request('https://mcp.example/api/references'),
    { image_items: [{ url: 'data:image/png;base64,AAAA', description: 'Pagina cu glotonimul' }] },
    { userId: 'user-1' }
  );

  assert.match(result.payload.image_items[0].url, /^https:\/\/mcp\.example\/api\/images\/references\//);
  assert.equal(result.payload.image_url, result.payload.image_items[0].url);
  assert.equal(result.uploaded.length, 1);
  assert.equal(bucket.objects.size, 1);
  assert.match(result.uploaded[0].key, /^references\/[a-f0-9]{64}\.png$/);
});

test('ruta publică R2 livrează imaginea cu tipul și cache-ul corecte', async () => {
  const bucket = new MemoryR2();
  const env = { MOLDOVENEASCA_IMAGES: bucket };
  const stored = await putDataImage(env, 'data:image/jpeg;base64,AAAA', { ownerId: 'user-1' });
  const response = await worker.fetch(new Request(`https://mcp.example/api/images/${stored.key}`), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await response.arrayBuffer()).byteLength, 3);
  assert.equal(imageKeyFromPath(`/api/images/${stored.key}`), stored.key);
});

test('variantele R2 au chei distincte și rămân accesibile', async () => {
  const bucket = new MemoryR2();
  const original = await putImageBytes(
    { MOLDOVENEASCA_IMAGES: bucket },
    new Uint8Array([1, 2, 3]),
    { contentType: 'image/png', ownerId: 'user-1', variant: 'original' }
  );
  const thumbnail = await putImageBytes(
    { MOLDOVENEASCA_IMAGES: bucket },
    new Uint8Array([4, 5, 6]),
    { contentType: 'image/jpeg', ownerId: 'user-1', variant: 'thumbnail' }
  );
  assert.match(original.key, /^references\/[a-f0-9]{64}\.original\.png$/);
  assert.match(thumbnail.key, /^references\/[a-f0-9]{64}\.thumbnail\.jpg$/);
  assert.notEqual(original.key, thumbnail.key);
  assert.equal(imageKeyFromPath(`/api/images/${original.key}`), original.key);
  assert.equal(imageKeyFromPath(`/api/images/${thumbnail.key}`), thumbnail.key);
});

test('scrierea unei imagini eșuează explicit când binding-ul R2 lipsește', async () => {
  await assert.rejects(
    () => putDataImage({}, 'data:image/png;base64,AAAA'),
    (error) => error?.code === 'image_storage_unavailable' && error?.status === 503
  );
});
