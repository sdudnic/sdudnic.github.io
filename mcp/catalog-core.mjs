// Funcții fără dependențe Node, reutilizabile în Node.js și Cloudflare Workers.

export const REFERENCE_FIELDS = [
  'id', 'year_label', 'year_start', 'year_end', 'title', 'author', 'language',
  'description', 'quote', 'source_type', 'location', 'source_url', 'image_url',
  'catalog_type', 'status', 'provider', 'external_id', 'evidence_url'
];

// Capturile stocate ca data URL trebuie să rămână suficient de clare pentru
// citirea unui scan, dar să nu transforme fiecare rând într-un obiect foarte
// mare pentru Supabase și API.
export const REFERENCE_IMAGE_MAX_BYTES = 1_500_000;
export const REFERENCE_IMAGE_MAX_DATA_URL_CHARS = 2_100_000;

const STATUS_VALUES = new Set(['pending', 'published', 'rejected', 'archived']);
const CATALOG_TYPES = new Set(['language', 'ethnicity', 'both']);
const SEARCH_FIELDS = ['year_label', 'title', 'author', 'language', 'description', 'quote', 'source_type', 'location', 'provider', 'external_id'];

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

function integer(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function yearFromLabel(value) {
  const match = String(value || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return match ? Number(match[1]) : null;
}

function stableId(row) {
  if (text(row.id)) return text(row.id);
  const value = [row.source_url, row.title, row.author, row.year_label].map(normalizeText).join('|');
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizeReference(row) {
  if (!row || typeof row !== 'object' || !text(row.title)) return null;
  const yearLabel = text(row.year_label) || text(row.year) || 'necunoscut';
  return {
    id: stableId(row),
    year_label: yearLabel,
    year_start: integer(row.year_start) ?? yearFromLabel(yearLabel),
    year_end: integer(row.year_end) ?? integer(row.year_start) ?? yearFromLabel(yearLabel),
    title: text(row.title),
    author: text(row.author),
    language: text(row.language),
    description: text(row.description),
    quote: text(row.quote),
    source_type: text(row.source_type),
    location: text(row.location),
    source_url: text(row.source_url),
    image_url: text(row.image_url),
    catalog_type: CATALOG_TYPES.has(text(row.catalog_type)) ? text(row.catalog_type) : 'language',
    status: STATUS_VALUES.has(text(row.status)) ? text(row.status) : 'pending',
    provider: text(row.provider),
    external_id: text(row.external_id),
    evidence_url: text(row.evidence_url)
  };
}

function statuses(value) {
  if (value === undefined || value === null || value === '') return ['published'];
  const values = Array.isArray(value) ? value : String(value).split(',');
  if (values.some((entry) => String(entry).trim().toLowerCase() === 'all')) return [...STATUS_VALUES];
  const result = values.map((entry) => String(entry).trim().toLowerCase()).filter((entry) => STATUS_VALUES.has(entry));
  return result.length ? [...new Set(result)] : ['published'];
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
  const fromYear = integer(input.fromYear ?? input.from_year);
  const toYear = integer(input.toYear ?? input.to_year);
  const sort = ['relevance', 'year_asc', 'year_desc', 'title'].includes(String(input.sort || '').toLowerCase()) ? String(input.sort).toLowerCase() : 'relevance';
  return {
    q: text(input.q) || '',
    author: text(input.author) || '',
    language: text(input.language) || '',
    sourceType: text(input.sourceType ?? input.source_type) || '',
    catalogType: text(input.catalogType ?? input.catalog_type) || '',
    statuses: statuses(input.status),
    fromYear,
    toYear,
    limit: Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 20)),
    offset: Math.max(0, Number.isFinite(offsetRaw) ? Math.trunc(offsetRaw) : 0),
    sort
  };
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

function matchesField(row, field, value) {
  return !value || normalizeText(row[field]).includes(normalizeText(value));
}

export function searchReferences(rows, input = {}) {
  const options = normalizeSearchOptions(input);
  const filtered = rows
    .filter((row) => options.statuses.includes(row.status))
    .filter((row) => !options.catalogType || options.catalogType === 'all' || row.catalog_type === options.catalogType)
    .filter((row) => matchesField(row, 'author', options.author))
    .filter((row) => matchesField(row, 'language', options.language))
    .filter((row) => matchesField(row, 'source_type', options.sourceType))
    .filter((row) => options.fromYear === null || (row.year_end ?? row.year_start ?? Number.MAX_SAFE_INTEGER) >= options.fromYear)
    .filter((row) => options.toYear === null || (row.year_start ?? Number.MIN_SAFE_INTEGER) <= options.toYear)
    .map((row) => ({ row, score: relevanceScore(row, options.q) }))
    .filter(({ score }) => !options.q || score >= 0);
  if (options.sort === 'relevance' && options.q) filtered.sort((a, b) => b.score - a.score || compareYears(a.row, b.row, 'asc'));
  else if (options.sort === 'year_desc') filtered.sort((a, b) => compareYears(a.row, b.row, 'desc'));
  else if (options.sort === 'title') filtered.sort((a, b) => normalizeText(a.row.title).localeCompare(normalizeText(b.row.title), 'ro'));
  else filtered.sort((a, b) => compareYears(a.row, b.row, 'asc'));
  const total = filtered.length;
  const items = filtered.slice(options.offset, options.offset + options.limit).map(({ row }) => row);
  return { items, total, limit: options.limit, offset: options.offset, has_more: options.offset + items.length < total, filters: { q: options.q || null, author: options.author || null, language: options.language || null, source_type: options.sourceType || null, catalog_type: options.catalogType || null, status: options.statuses }, sort: options.sort };
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
  const byCentury = {};
  for (const year of years) {
    const century = Math.floor((year - 1) / 100) + 1;
    byCentury[century] = (byCentury[century] || 0) + 1;
  }
  const published = rows.filter((row) => row.status === 'published').length;
  return { total: rows.length, published, unpublished: rows.length - published, by_status: countValues(rows, 'status'), by_catalog_type: countValues(rows, 'catalog_type'), by_source_type: countValues(rows, 'source_type'), by_language: countValues(rows, 'language'), by_century: Object.fromEntries(Object.entries(byCentury).sort((a, b) => Number(a[0]) - Number(b[0]))), year_range: { min: years.length ? Math.min(...years) : null, max: years.length ? Math.max(...years) : null }, source };
}

export function publicReference(row) {
  if (!row) return null;
  return Object.fromEntries(REFERENCE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(row, field)).map((field) => [field, row[field]]));
}

export function citationFor(row, format = 'markdown') {
  const author = row.author || 'Autor necunoscut';
  const year = row.year_label || 'f.a.';
  const title = row.title || 'Titlu necunoscut';
  const location = row.location ? ` ${row.location}.` : '';
  const type = row.source_type ? ` ${row.source_type}.` : '';
  if (format === 'plain') return `${author} (${year}). ${title}.${location}${type}${row.source_url ? ` ${row.source_url}` : ''}`.replace(/\s+/g, ' ').trim();
  return `- **${author}** (${year}). *${title}*.${location}${type}${row.source_url ? ` [Sursa](${row.source_url})` : ''}`.replace(/\s+/g, ' ').trim();
}
