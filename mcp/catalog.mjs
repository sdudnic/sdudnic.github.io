import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(MODULE_DIR, '..');

export const REFERENCE_FIELDS = [
  'id',
  'year_label',
  'year_start',
  'year_end',
  'title',
  'author',
  'language',
  'description',
  'quote',
  'source_type',
  'location',
  'source_url',
  'image_url',
  'catalog_type',
  'status',
  'provider',
  'external_id',
  'evidence_url'
];

const STATUS_VALUES = new Set(['pending', 'published', 'rejected', 'archived']);
const CATALOG_TYPES = new Set(['language', 'ethnicity', 'both']);
const SEARCH_FIELDS = [
  'year_label',
  'title',
  'author',
  'language',
  'description',
  'quote',
  'source_type',
  'location',
  'provider',
  'external_id'
];

function text(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

export function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('ro-MD')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function finiteInteger(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function yearFromLabel(value) {
  const match = String(value || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return match ? Number(match[1]) : null;
}

function stableId(row, sourceLabel = '') {
  const explicit = text(row.id);
  if (explicit) return explicit;
  const key = [
    row.source_url,
    row.evidence_url,
    row.title,
    row.author,
    row.year_label,
    sourceLabel
  ].map((value) => normalizeText(value)).join('|');
  return `local-${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
}

function extractRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['rows', 'references', 'data', 'additions']) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

export function normalizeReference(row, sourceLabel = '') {
  if (!row || typeof row !== 'object') return null;
  const title = text(row.title);
  if (!title) return null;
  const yearLabel = text(row.year_label) || text(row.year) || 'necunoscut';
  const sourceUrl = text(row.source_url);
  const evidenceUrl = text(row.evidence_url);
  const result = {
    id: stableId(row, sourceLabel),
    year_label: yearLabel,
    year_start: finiteInteger(row.year_start) ?? yearFromLabel(yearLabel),
    year_end: finiteInteger(row.year_end) ?? finiteInteger(row.year_start) ?? yearFromLabel(yearLabel),
    title,
    author: text(row.author),
    language: text(row.language),
    description: text(row.description),
    quote: text(row.quote),
    source_type: text(row.source_type),
    location: text(row.location),
    source_url: sourceUrl,
    image_url: text(row.image_url),
    catalog_type: CATALOG_TYPES.has(text(row.catalog_type)) ? text(row.catalog_type) : 'language',
    status: STATUS_VALUES.has(text(row.status)) ? text(row.status) : 'pending',
    provider: text(row.provider),
    external_id: text(row.external_id),
    evidence_url: evidenceUrl
  };
  return result;
}

function sourceKey(row) {
  return row.id || [row.source_url, row.title, row.author, row.year_label]
    .map((value) => normalizeText(value)).join('|');
}

function parsePathList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '')
    .split(/[;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function statusesFrom(value, fallback = ['published']) {
  if (value === undefined || value === null || value === '') return fallback;
  const values = Array.isArray(value) ? value : String(value).split(',');
  if (values.some((entry) => String(entry).trim().toLowerCase() === 'all')) return [...STATUS_VALUES];
  const result = values.map((entry) => String(entry).trim().toLowerCase()).filter((entry) => STATUS_VALUES.has(entry));
  return result.length ? [...new Set(result)] : fallback;
}

function compareYears(a, b, direction) {
  const left = a.year_start ?? Number.MAX_SAFE_INTEGER;
  const right = b.year_start ?? Number.MAX_SAFE_INTEGER;
  if (left !== right) return direction === 'desc' ? right - left : left - right;
  return normalizeText(a.title).localeCompare(normalizeText(b.title), 'ro');
}

export function normalizeSearchOptions(input = {}) {
  const limitRaw = Number(input.limit);
  const offsetRaw = Number(input.offset);
  const fromYear = finiteInteger(input.fromYear ?? input.from_year);
  const toYear = finiteInteger(input.toYear ?? input.to_year);
  const sort = ['relevance', 'year_asc', 'year_desc', 'title'].includes(String(input.sort || '').toLowerCase())
    ? String(input.sort).toLowerCase()
    : 'relevance';
  return {
    q: text(input.q) || '',
    author: text(input.author) || '',
    language: text(input.language) || '',
    sourceType: text(input.sourceType ?? input.source_type) || '',
    catalogType: text(input.catalogType ?? input.catalog_type) || '',
    statuses: statusesFrom(input.status),
    fromYear,
    toYear,
    limit: Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 20)),
    offset: Math.max(0, Number.isFinite(offsetRaw) ? Math.trunc(offsetRaw) : 0),
    sort
  };
}

function fieldMatch(row, field, query) {
  if (!query) return true;
  return normalizeText(row[field]).includes(normalizeText(query));
}

function relevanceScore(row, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const haystack = normalizeText(SEARCH_FIELDS.map((field) => row[field]).join(' '));
  if (!tokens.every((token) => haystack.includes(token))) return -1;
  let score = haystack.includes(normalizedQuery) ? 50 : 0;
  for (const token of tokens) {
    if (normalizeText(row.title).includes(token)) score += 12;
    if (normalizeText(row.quote).includes(token)) score += 10;
    if (normalizeText(row.description).includes(token)) score += 7;
    if (normalizeText(row.author).includes(token)) score += 5;
    if (normalizeText(row.source_type).includes(token)) score += 3;
    if (normalizeText(row.language).includes(token)) score += 2;
  }
  return score;
}

export function searchReferences(rows, input = {}) {
  const options = normalizeSearchOptions(input);
  const filtered = rows
    .filter((row) => options.statuses.includes(row.status))
    .filter((row) => !options.catalogType || options.catalogType === 'all' || row.catalog_type === options.catalogType)
    .filter((row) => !options.author || fieldMatch(row, 'author', options.author))
    .filter((row) => !options.language || fieldMatch(row, 'language', options.language))
    .filter((row) => !options.sourceType || fieldMatch(row, 'source_type', options.sourceType))
    .filter((row) => options.fromYear === null || (row.year_end ?? row.year_start ?? Number.MAX_SAFE_INTEGER) >= options.fromYear)
    .filter((row) => options.toYear === null || (row.year_start ?? Number.MIN_SAFE_INTEGER) <= options.toYear)
    .map((row) => ({ row, score: relevanceScore(row, options.q) }))
    .filter(({ score }) => !options.q || score >= 0);

  if (options.sort === 'relevance' && options.q) {
    filtered.sort((a, b) => b.score - a.score || compareYears(a.row, b.row, 'asc'));
  } else if (options.sort === 'year_desc') {
    filtered.sort((a, b) => compareYears(a.row, b.row, 'desc'));
  } else if (options.sort === 'title') {
    filtered.sort((a, b) => normalizeText(a.row.title).localeCompare(normalizeText(b.row.title), 'ro'));
  } else {
    filtered.sort((a, b) => compareYears(a.row, b.row, 'asc'));
  }

  const total = filtered.length;
  const items = filtered.slice(options.offset, options.offset + options.limit).map(({ row }) => row);
  return {
    items,
    total,
    limit: options.limit,
    offset: options.offset,
    has_more: options.offset + items.length < total,
    filters: {
      q: options.q || null,
      author: options.author || null,
      language: options.language || null,
      source_type: options.sourceType || null,
      catalog_type: options.catalogType || null,
      status: options.statuses
    },
    sort: options.sort
  };
}

function countValues(rows, field) {
  const counts = {};
  for (const row of rows) {
    const value = row[field] || 'necunoscut';
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ro')));
}

export function catalogStatistics(rows, source = {}) {
  const years = rows.map((row) => row.year_start).filter((year) => Number.isInteger(year));
  const publishedRows = rows.filter((row) => row.status === 'published');
  const byCentury = {};
  for (const year of years) {
    const century = Math.floor((year - 1) / 100) + 1;
    byCentury[century] = (byCentury[century] || 0) + 1;
  }
  return {
    total: rows.length,
    published: publishedRows.length,
    unpublished: rows.length - publishedRows.length,
    by_status: countValues(rows, 'status'),
    by_catalog_type: countValues(rows, 'catalog_type'),
    by_source_type: countValues(rows, 'source_type'),
    by_language: countValues(rows, 'language'),
    by_century: Object.fromEntries(Object.entries(byCentury).sort((a, b) => Number(a[0]) - Number(b[0]))),
    year_range: {
      min: years.length ? Math.min(...years) : null,
      max: years.length ? Math.max(...years) : null
    },
    source
  };
}

export function publicReference(row) {
  if (!row) return null;
  return Object.fromEntries(REFERENCE_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(row, field))
    .map((field) => [field, row[field]]));
}

export function citationFor(row, format = 'markdown') {
  const author = row.author || 'Autor necunoscut';
  const year = row.year_label || 'f.a.';
  const title = row.title || 'Titlu necunoscut';
  const location = row.location ? ` ${row.location}.` : '';
  const type = row.source_type ? ` ${row.source_type}.` : '';
  if (format === 'plain') {
    return `${author} (${year}). ${title}.${location}${type}${row.source_url ? ` ${row.source_url}` : ''}`.replace(/\s+/g, ' ').trim();
  }
  const link = row.source_url ? ` [Sursa](${row.source_url})` : '';
  return `- **${author}** (${year}). *${title}*.${location}${type}${link}`.replace(/\s+/g, ' ').trim();
}

export class CatalogStore {
  constructor({
    root = PROJECT_ROOT,
    paths = [resolve(root, 'research-catalog.json')],
    source = 'auto',
    supabaseUrl = '',
    supabaseKey = '',
    fetchImpl = globalThis.fetch,
    cacheTtlMs = 60_000
  } = {}) {
    this.root = root;
    this.paths = paths.map((path) => isAbsolute(path) ? path : resolve(root, path));
    this.source = source;
    this.supabaseUrl = String(supabaseUrl || '').replace(/\/$/, '');
    this.supabaseKey = supabaseKey;
    this.fetchImpl = fetchImpl;
    this.cacheTtlMs = cacheTtlMs;
    this.cache = null;
    this.cacheKey = '';
    this.remoteExpiresAt = 0;
  }

  get sourceKind() {
    if (this.source === 'supabase') return 'supabase';
    if (this.source === 'local') return 'local';
    return this.supabaseUrl && this.supabaseKey ? 'supabase' : 'local';
  }

  invalidate() {
    this.cache = null;
    this.cacheKey = '';
    this.remoteExpiresAt = 0;
  }

  async _localSignature() {
    const signatures = [];
    for (const path of this.paths) {
      try {
        const info = await stat(path);
        signatures.push(`${path}:${info.size}:${info.mtimeMs}`);
      } catch {
        signatures.push(`${path}:missing`);
      }
    }
    return signatures.join('|');
  }

  async _loadLocal() {
    const rowsByKey = new Map();
    const loadedPaths = [];
    for (const path of this.paths) {
      try {
        const value = JSON.parse(await readFile(path, 'utf8'));
        const rows = extractRows(value);
        loadedPaths.push(path);
        for (const rawRow of rows) {
          const row = normalizeReference(rawRow, path);
          if (!row) continue;
          const key = sourceKey(row);
          if (!rowsByKey.has(key) || (rowsByKey.get(key).status !== 'published' && row.status === 'published')) {
            rowsByKey.set(key, row);
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw new Error(`Catalogul ${path} nu poate fi citit: ${error.message}`);
      }
    }
    return {
      rows: [...rowsByKey.values()],
      loaded_at: new Date().toISOString(),
      source: { kind: 'local', paths: loadedPaths, count: rowsByKey.size }
    };
  }

  async _loadSupabase() {
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Sursa Supabase necesită MOLDOVENEASCA_SUPABASE_URL și MOLDOVENEASCA_SUPABASE_ANON_KEY.');
    }
    if (typeof this.fetchImpl !== 'function') throw new Error('Runtime-ul nu oferă fetch.');
    const rows = [];
    // Imaginea de dovadă poate fi un data URL mare; nu o încărca pentru
    // listări/statistici. Este cerută separat numai la deschiderea unei
    // referințe.
    const select = REFERENCE_FIELDS.filter((field) => !['provider', 'external_id', 'evidence_url', 'image_url'].includes(field)).join(',');
    for (let offset = 0; offset < 100_000; offset += 1_000) {
      const url = new URL(`${this.supabaseUrl}/rest/v1/language_references`);
      url.searchParams.set('select', select);
      url.searchParams.set('status', 'eq.published');
      url.searchParams.set('order', 'year_start.asc,id.asc');
      url.searchParams.set('limit', '1000');
      url.searchParams.set('offset', String(offset));
      const response = await this.fetchImpl(url, {
        headers: { apikey: this.supabaseKey, authorization: `Bearer ${this.supabaseKey}` }
      });
      if (!response.ok) throw new Error(`Supabase a răspuns cu ${response.status}.`);
      const batch = await response.json();
      for (const rawRow of Array.isArray(batch) ? batch : []) {
        const row = normalizeReference(rawRow, 'supabase');
        if (row) rows.push(row);
      }
      if (!Array.isArray(batch) || batch.length < 1_000) break;
    }
    return {
      rows,
      loaded_at: new Date().toISOString(),
      source: { kind: 'supabase', url: this.supabaseUrl, count: rows.length, visibility: 'published' }
    };
  }

  async _loadSupabaseReference(id) {
    const select = REFERENCE_FIELDS.filter((field) => !['provider', 'external_id', 'evidence_url'].includes(field)).join(',');
    const url = new URL(`${this.supabaseUrl}/rest/v1/language_references`);
    url.searchParams.set('select', select);
    url.searchParams.set('id', `eq.${String(id)}`);
    url.searchParams.set('status', 'eq.published');
    url.searchParams.set('limit', '1');
    const response = await this.fetchImpl(url, {
      headers: { apikey: this.supabaseKey, authorization: `Bearer ${this.supabaseKey}` }
    });
    if (!response.ok) throw new Error(`Supabase a răspuns cu ${response.status}.`);
    const batch = await response.json();
    return normalizeReference(Array.isArray(batch) ? batch[0] : null, 'supabase');
  }

  async snapshot({ force = false } = {}) {
    if (this.sourceKind === 'supabase') {
      if (!force && this.cache && Date.now() < this.remoteExpiresAt) return this.cache;
      this.cache = await this._loadSupabase();
      this.remoteExpiresAt = Date.now() + this.cacheTtlMs;
      return this.cache;
    }
    const key = await this._localSignature();
    if (!force && this.cache && this.cacheKey === key) return this.cache;
    this.cache = await this._loadLocal();
    this.cacheKey = key;
    return this.cache;
  }

  async search(input = {}) {
    const snapshot = await this.snapshot();
    return { ...searchReferences(snapshot.rows, input), source: snapshot.source, loaded_at: snapshot.loaded_at };
  }

  async get(id, { status = 'published' } = {}) {
    const snapshot = await this.snapshot();
    const allowed = statusesFrom(status);
    const row = snapshot.rows.find((entry) => entry.id === String(id) && allowed.includes(entry.status));
    if (!row) return null;
    if (this.sourceKind === 'supabase' && allowed.includes('published')) {
      return (await this._loadSupabaseReference(row.id)) || row;
    }
    return row;
  }

  async statistics() {
    const snapshot = await this.snapshot();
    return catalogStatistics(snapshot.rows, snapshot.source);
  }
}

export function createCatalogStore(env = process.env) {
  const root = PROJECT_ROOT;
  const configuredPaths = parsePathList(env.MOLDOVENEASCA_CATALOG_PATHS || env.MOLDOVENEASCA_CATALOG_PATH);
  return new CatalogStore({
    root,
    paths: configuredPaths.length ? configuredPaths : [resolve(root, 'research-catalog.json')],
    source: env.MOLDOVENEASCA_SOURCE || 'auto',
    supabaseUrl: env.MOLDOVENEASCA_SUPABASE_URL || env.SUPABASE_URL || '',
    supabaseKey: env.MOLDOVENEASCA_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
    cacheTtlMs: Math.max(5_000, Number(env.MOLDOVENEASCA_CACHE_TTL_MS) || 60_000)
  });
}
