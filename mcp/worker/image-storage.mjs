import { ServiceError } from '../auth.mjs';

export const IMAGE_MAX_BYTES = 1_500_000;
export const IMAGE_MAX_ORIGINAL_BYTES = 4_000_000;
export const IMAGE_MAX_DISPLAY_BYTES = 2_500_000;
export const IMAGE_MAX_THUMBNAIL_BYTES = 300_000;
export const IMAGE_MAX_DATA_URL_CHARS = 2_100_000;
export const IMAGE_MAX_ITEMS = 12;
export const IMAGE_MAX_TOTAL_DATA_URL_CHARS = 6_300_000;

const DATA_IMAGE_PATTERN = /^data:image\/(avif|gif|jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i;
const REFERENCE_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const IMAGE_KEY_PATTERN = /^(?:references\/[a-f0-9]{64}(?:\.(?:original|display|thumbnail))?\.(?:avif|gif|jpg|jpeg|png|webp)|references\/[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/(?:original|display|thumbnail)\.(?:avif|gif|jpg|jpeg|png|webp))$/i;
const IMAGE_VARIANTS = new Set(['original', 'display', 'thumbnail']);
const EXTENSIONS = {
  avif: 'avif',
  gif: 'gif',
  jpeg: 'jpg',
  jpg: 'jpg',
  png: 'png',
  webp: 'webp'
};

function base64ByteLength(value) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}

function requireBucket(env) {
  const bucket = env?.MOLDOVENEASCA_IMAGES;
  if (!bucket || typeof bucket.put !== 'function' || typeof bucket.get !== 'function') {
    throw new ServiceError('Stocarea imaginilor R2 nu este încă configurată în Worker.', {
      status: 503,
      code: 'image_storage_unavailable'
    });
  }
  return bucket;
}

function normalizedDataUrl(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

export function parseDataImage(value) {
  const normalized = normalizedDataUrl(value);
  const match = normalized.match(DATA_IMAGE_PATTERN);
  if (!match) return null;
  const bytes = base64ByteLength(match[2]);
  if (normalized.length > IMAGE_MAX_DATA_URL_CHARS || bytes > IMAGE_MAX_BYTES) {
    throw new ServiceError('Imaginea este prea mare. Folosește o captură compactată la maximum 1,5 MB.', {
      status: 413,
      code: 'payload_too_large'
    });
  }
  return {
    value: normalized,
    mediaType: `image/${match[1].toLowerCase()}`,
    extension: EXTENSIONS[match[1].toLowerCase()] || 'jpg',
    base64: match[2],
    bytes
  };
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function imageExtension(contentType) {
  const normalized = String(contentType || '').toLowerCase();
  return normalized === 'image/jpeg' || normalized === 'image/jpg'
    ? 'jpg'
    : normalized.slice('image/'.length);
}

export function imageKeyFromPath(pathname) {
  const prefix = '/api/images/';
  if (!String(pathname || '').startsWith(prefix)) return null;
  let key;
  try {
    key = decodeURIComponent(String(pathname).slice(prefix.length));
  } catch {
    return null;
  }
  if (!IMAGE_KEY_PATTERN.test(key) || key.includes('..') || key.includes('\\')) return null;
  return key;
}

export function imageUrlForRequest(request, key) {
  const url = new URL(request.url);
  url.pathname = `/api/images/${key.split('/').map(encodeURIComponent).join('/')}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function putDataImage(env, dataUrl, { ownerId = 'unknown' } = {}) {
  const parsed = parseDataImage(dataUrl);
  if (!parsed) return null;
  const bytes = decodeBase64(parsed.base64);
  if (bytes.byteLength !== parsed.bytes || bytes.byteLength > IMAGE_MAX_BYTES) {
    throw new ServiceError('Imaginea Base64 nu are o dimensiune validă.', { status: 413, code: 'payload_too_large' });
  }
  return putImageBytes(env, bytes, { contentType: parsed.mediaType, ownerId, extension: parsed.extension });
}

export async function putImageBytes(env, bytes, {
  contentType,
  ownerId = 'unknown',
  extension = null,
  variant = null,
  referenceId = null
} = {}) {
  const normalizedType = String(contentType || '').toLowerCase();
  if (!/^image\/(avif|gif|jpeg|jpg|png|webp)$/i.test(normalizedType)) {
    throw new ServiceError('Imaginea trebuie să fie AVIF, GIF, JPEG, PNG sau WebP.', { status: 415, code: 'unsupported_media_type' });
  }
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const normalizedVariant = IMAGE_VARIANTS.has(String(variant || '').toLowerCase())
    ? String(variant).toLowerCase()
    : null;
  const normalizedReferenceId = String(referenceId || '').trim().toLowerCase();
  if (normalizedReferenceId && !REFERENCE_ID_PATTERN.test(normalizedReferenceId)) {
    throw new ServiceError('Identificatorul referinței nu este valid.', { status: 400, code: 'invalid_input' });
  }
  const maxBytes = normalizedVariant === 'original'
    ? IMAGE_MAX_ORIGINAL_BYTES
    : normalizedVariant === 'display'
      ? IMAGE_MAX_DISPLAY_BYTES
      : normalizedVariant === 'thumbnail'
        ? IMAGE_MAX_THUMBNAIL_BYTES
        : IMAGE_MAX_BYTES;
  if (!value.byteLength || value.byteLength > maxBytes) {
    throw new ServiceError('Imaginea este prea mare sau goală.', { status: 413, code: 'payload_too_large' });
  }
  const digest = await sha256Hex(value);
  const extensionValue = extension || imageExtension(normalizedType);
  const key = normalizedReferenceId && normalizedVariant
    ? `references/${normalizedReferenceId}/${normalizedVariant}.${extensionValue}`
    : `references/${digest}${normalizedVariant ? `.${normalizedVariant}` : ''}.${extensionValue}`;
  const bucket = requireBucket(env);
  await bucket.put(key, value, {
    httpMetadata: {
      contentType: normalizedType === 'image/jpg' ? 'image/jpeg' : normalizedType,
      cacheControl: 'public, max-age=31536000, immutable'
    },
    customMetadata: {
      ownerId: String(ownerId || 'unknown'),
      source: 'moldoveneasca-reference'
    }
  });
  return {
    key,
    bytes: value.byteLength,
    contentType: normalizedType === 'image/jpg' ? 'image/jpeg' : normalizedType,
    variant: normalizedVariant
  };
}

export async function getStoredImage(env, key) {
  return requireBucket(env).get(key);
}

export async function deleteStoredImage(env, key) {
  const bucket = requireBucket(env);
  await bucket.delete(key);
}

function imageItemUrl(item) {
  return typeof item === 'string' ? item : item?.url ?? item?.image_url;
}

function imageDescription(item) {
  return typeof item === 'object' && item !== null ? item.description ?? item.caption : undefined;
}

function dataUrlsInItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(imageItemUrl).map(normalizedDataUrl).filter((url) => /^data:image\//i.test(url));
}

function validateGalleryDataUrls(input) {
  if (!Object.prototype.hasOwnProperty.call(input, 'image_items')) return;
  if (input.image_items === null) return;
  if (!Array.isArray(input.image_items)) return;
  if (input.image_items.length > IMAGE_MAX_ITEMS) {
    throw new ServiceError(`O referință poate avea cel mult ${IMAGE_MAX_ITEMS} imagini.`, { code: 'invalid_input' });
  }
  const urls = dataUrlsInItems(input.image_items);
  const total = urls.reduce((sum, url) => sum + url.length, 0);
  if (total > IMAGE_MAX_TOTAL_DATA_URL_CHARS) {
    throw new ServiceError('Galeria este prea mare. Compactează imaginile înainte de încărcare.', { status: 413, code: 'payload_too_large' });
  }
  urls.forEach((url) => parseDataImage(url));
}

// Converts data URLs before the catalog gateway sees them. HTTPS image URLs
// are preserved, including external library URLs; they are never downloaded.
export async function materializeReferenceImages(env, request, input, auth = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { payload: input, uploaded: [] };
  const hasImageUrl = Object.prototype.hasOwnProperty.call(input, 'image_url');
  const hasImageItems = Object.prototype.hasOwnProperty.call(input, 'image_items');
  if (!hasImageUrl && !hasImageItems) return { payload: input, uploaded: [] };
  validateGalleryDataUrls(input);

  const payload = { ...input };
  const uploaded = [];
  const cache = new Map();
  const ownerId = auth?.userId || auth?.user?.id || 'unknown';
  const materializeUrl = async (value) => {
    const raw = String(value || '').trim();
    const normalized = normalizedDataUrl(raw);
    const parsed = parseDataImage(normalized);
    if (!parsed) return raw;
    if (!cache.has(parsed.value)) {
      cache.set(parsed.value, putDataImage(env, parsed.value, { ownerId }));
    }
    const stored = await cache.get(parsed.value);
    if (!uploaded.some((item) => item.key === stored.key)) uploaded.push(stored);
    return imageUrlForRequest(request, stored.key);
  };

  if (hasImageUrl) payload.image_url = await materializeUrl(input.image_url);
  if (hasImageItems && Array.isArray(input.image_items)) {
    const items = [];
    for (const item of input.image_items) {
      const url = await materializeUrl(imageItemUrl(item));
      items.push(typeof item === 'object' && item !== null
        ? { ...item, url }
        : { url, description: imageDescription(item) ?? '' });
    }
    payload.image_items = items;
    payload.image_url = items[0]?.url || null;
  }
  return { payload, uploaded };
}
