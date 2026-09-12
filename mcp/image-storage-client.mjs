import { ServiceError } from './auth.mjs';
import {
  IMAGE_MAX_BYTES,
  IMAGE_MAX_DATA_URL_CHARS,
  IMAGE_MAX_ITEMS,
  IMAGE_MAX_TOTAL_DATA_URL_CHARS,
  parseDataImage
} from './worker/image-storage.mjs';

const DEFAULT_IMAGE_API_URL = 'https://moldoveneasca-mcp.dudnic-moldoveneasca-mcp.workers.dev';

function imageItemUrl(item) {
  return typeof item === 'string' ? item : item?.url ?? item?.image_url;
}

function normalized(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function decodeBase64(value) {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function dataUrlsIn(input) {
  const values = [];
  if (Object.prototype.hasOwnProperty.call(input, 'image_url')) values.push(input.image_url);
  if (Array.isArray(input.image_items)) values.push(...input.image_items.map(imageItemUrl));
  return values.map(normalized).filter((value) => /^data:image\//i.test(value));
}

async function responseData(response) {
  const raw = await response.text();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { raw }; }
}

export function createImageStorageClient(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
  const hasConfiguredUrl = Object.prototype.hasOwnProperty.call(env, 'MOLDOVENEASCA_IMAGE_API_URL');
  const apiUrl = String(hasConfiguredUrl ? env.MOLDOVENEASCA_IMAGE_API_URL : DEFAULT_IMAGE_API_URL || '')
    .trim()
    .replace(/\/$/, '');
  const request = fetchImpl === globalThis.fetch && typeof fetchImpl === 'function'
    ? fetchImpl.bind(globalThis)
    : fetchImpl;

  async function upload(dataUrl, auth) {
    if (!apiUrl) {
      throw new ServiceError('Stocarea imaginilor nu este configurată. Setează MOLDOVENEASCA_IMAGE_API_URL.', {
        status: 503,
        code: 'image_storage_unavailable'
      });
    }
    if (!auth?.token) {
      throw new ServiceError('Autentificarea este necesară pentru încărcarea imaginilor.', {
        status: 401,
        code: 'auth_required'
      });
    }
    const parsed = parseDataImage(dataUrl);
    if (!parsed) return dataUrl;
    const bytes = decodeBase64(parsed.base64);
    if (bytes.byteLength !== parsed.bytes || bytes.byteLength > IMAGE_MAX_BYTES) {
      throw new ServiceError('Imaginea Base64 nu are o dimensiune validă.', { status: 413, code: 'payload_too_large' });
    }
    const response = await request(`${apiUrl}/api/images`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${auth.token}`,
        'content-type': parsed.mediaType,
        'content-length': String(bytes.byteLength)
      },
      body: bytes
    });
    const data = await responseData(response);
    if (!response.ok) {
      throw new ServiceError(data?.error?.message || data?.message || `Worker-ul de imagini a răspuns cu ${response.status}.`, {
        status: response.status === 401 ? 401 : response.status === 413 ? 413 : 502,
        code: data?.error?.code || 'image_storage_error',
        details: data
      });
    }
    const stored = data?.data || data;
    if (!stored?.url) throw new ServiceError('Worker-ul nu a returnat URL-ul imaginii.', { status: 502, code: 'image_storage_error' });
    return stored.url;
  }

  async function materialize(input, auth = null) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { payload: input, uploaded: [] };
    const urls = dataUrlsIn(input);
    if (!urls.length) return { payload: input, uploaded: [] };
    if (Array.isArray(input.image_items) && input.image_items.length > IMAGE_MAX_ITEMS) {
      throw new ServiceError(`O referință poate avea cel mult ${IMAGE_MAX_ITEMS} imagini.`, { code: 'invalid_input' });
    }
    if (urls.reduce((sum, url) => sum + url.length, 0) > IMAGE_MAX_TOTAL_DATA_URL_CHARS) {
      throw new ServiceError('Galeria este prea mare. Compactează imaginile înainte de încărcare.', { status: 413, code: 'payload_too_large' });
    }
    urls.forEach((url) => {
      const parsed = parseDataImage(url);
      if (!parsed || parsed.value.length > IMAGE_MAX_DATA_URL_CHARS || parsed.bytes > IMAGE_MAX_BYTES) {
        throw new ServiceError('Imaginea este prea mare sau invalidă.', { status: 413, code: 'payload_too_large' });
      }
    });

    const payload = { ...input };
    const uploaded = [];
    const cache = new Map();
    const materializeUrl = async (value) => {
      const raw = String(value || '').trim();
      const dataUrl = normalized(raw);
      const parsed = parseDataImage(dataUrl);
      if (!parsed) return raw;
      if (!cache.has(parsed.value)) cache.set(parsed.value, upload(parsed.value, auth));
      const url = await cache.get(parsed.value);
      if (!uploaded.some((item) => item.url === url)) uploaded.push({ url });
      return url;
    };

    if (Object.prototype.hasOwnProperty.call(input, 'image_url')) {
      payload.image_url = await materializeUrl(input.image_url);
    }
    if (Object.prototype.hasOwnProperty.call(input, 'image_items') && Array.isArray(input.image_items)) {
      const items = [];
      for (const item of input.image_items) {
        const url = await materializeUrl(imageItemUrl(item));
        items.push(typeof item === 'object' && item !== null ? { ...item, url } : { url, description: '' });
      }
      payload.image_items = items;
      payload.image_url = items[0]?.url || null;
    }
    return { payload, uploaded };
  }

  return { materialize };
}

export { DEFAULT_IMAGE_API_URL };
