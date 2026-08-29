import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogStore, searchReferences } from '../catalog.mjs';

const fixture = [
  { id: 'a', year_label: '1643', year_start: 1643, title: 'Cazania', author: 'Varlaam', language: 'moldovenească', quote: 'în limba moldovenească', status: 'published', catalog_type: 'language' },
  { id: 'b', year_label: '1900', year_start: 1900, title: 'Notă neverificată', author: 'Autor', language: 'franceză', quote: 'Moldavian language', status: 'pending', catalog_type: 'language' },
  { id: 'c', year_label: '1700', year_start: 1700, title: 'Moldoveni', author: 'Instituție', language: 'latină', quote: 'Moldavi', status: 'published', catalog_type: 'ethnicity' }
];

test('caută accent-insensibil și ascunde implicit intrările neverificate', () => {
  const result = searchReferences(fixture.map((row) => ({ ...row })), { q: 'limba moldoveneasca' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, 'a');
  assert.equal(searchReferences(fixture, { status: 'all' }).total, 3);
});

test('filtrează intervalul de ani și tipul catalogului', () => {
  const result = searchReferences(fixture, { from_year: 1600, to_year: 1800, catalog_type: 'ethnicity' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, 'c');
});

test('încarcă un catalog local și un envelope cu additions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moldoveneasca-mcp-'));
  try {
    const first = join(directory, 'catalog.json');
    const second = join(directory, 'additions.json');
    await writeFile(first, JSON.stringify([fixture[0]]));
    await writeFile(second, JSON.stringify({ additions: [fixture[1]] }));
    const store = new CatalogStore({ root: directory, paths: [first, second], source: 'local' });
    const result = await store.search({ status: 'all', limit: 10 });
    assert.equal(result.total, 2);
    assert.equal((await store.get('a')).title, 'Cazania');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('nu încarcă imaginile în listarea Supabase și le cere separat la detalii', async () => {
  const image = 'data:image/jpeg;base64,AAAA';
  const row = {
    id: 'a',
    year_label: '1643',
    year_start: 1643,
    year_end: 1643,
    title: 'Cazania',
    author: 'Varlaam',
    language: 'moldovenească',
    quote: 'în limba moldovenească',
    source_url: 'https://example.test/source',
    image_url: image,
    catalog_type: 'language',
    status: 'published'
  };
  const calls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    return new Response(JSON.stringify(parsed.searchParams.get('limit') === '1' ? [row] : [{ ...row, image_url: null }]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  const store = new CatalogStore({
    source: 'supabase',
    supabaseUrl: 'https://supabase.test',
    supabaseKey: 'anon',
    fetchImpl
  });

  const stats = await store.statistics();
  assert.equal(stats.total, 1);
  assert.doesNotMatch(calls[0].searchParams.get('select'), /image_url/);
  const detail = await store.get('a');
  assert.equal(detail.image_url, image);
  assert.match(calls.at(-1).searchParams.get('select'), /image_url/);
});
