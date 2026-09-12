import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const partial = (name) => readFileSync(new URL(`../../assets/moldoveneasca/${name}.js`, import.meta.url), 'utf8');
const repository = (exports, globals = {}) => vm.runInNewContext(`${partial('repository')}\n({${exports}})`, { config: {}, ...globals });

test('listarea completă depășește 1000 de referințe fără imagini și fără trunchiere', async () => {
  const rows = Array.from({ length: 1205 }, (_, id) => ({ id }));
  let calls = 0;
  const { loadAllRemoteRows, remoteSelectFields } = repository('loadAllRemoteRows, remoteSelectFields');
  const response = await loadAllRemoteRows(() => ({ range: async (from, to) => {
    calls += 1;
    assert.equal(to - from + 1, 100);
    return { data: rows.slice(from, to + 1), count: rows.length };
  } }));
  assert.equal(response.data.length, 1205);
  assert.equal(response.count, 1205);
  assert.equal(calls, 13);
  assert.ok(!remoteSelectFields.includes('image_url'));
});

test('o eroare într-un lot nu este prezentată ca listă completă', async () => {
  const { loadAllRemoteRows } = repository('loadAllRemoteRows');
  await assert.rejects(loadAllRemoteRows(() => ({ range: async (from) => from === 0
    ? { data: Array.from({ length: 100 }, (_, id) => ({ id })) }
    : { error: new Error('offline') }
  })), /offline/);
});

test('linkul direct încarcă numai referința lipsă și ignoră navigarea depășită', async () => {
  let resolve;
  let opened = null;
  const window = { location: { href: 'https://example.test/moldoveneasca/?referinta=next' } };
  const query = { select() { return this; }, eq() { return this; }, maybeSingle() { return new Promise((r) => { resolve = r; }); } };
  const context = { window, URL, normalize: (value) => value.toLowerCase(), remoteRecords: [], ethnicityRecords: [], unverifiedRecords: [], staticRows: [], ethnicityStaticEntries: [],
    supabaseClient: { from: () => query }, remoteSelectFields: 'id,title,status', normalizeCitationRecord: (row) => row,
    openDetail: (row) => { opened = row; }, isCatalogLoading: false, result: {}
  };
  const api = vm.runInNewContext(`${partial('share')}\n({restoreDetailFromUrl,referenceShareKey})`, context);
  assert.equal(api.referenceShareKey(null), '');
  assert.equal(api.referenceShareKey({ id: 'private', status: 'pending' }), '');
  const old = api.restoreDetailFromUrl();
  window.location.href = 'https://example.test/moldoveneasca/';
  resolve({ data: { id: 'next', title: 'Next', status: 'published' } });
  assert.equal(await old, false);
  assert.equal(opened, null);
  window.location.href += '?referinta=next';
  const current = api.restoreDetailFromUrl();
  resolve({ data: { id: 'next', title: 'Next', status: 'published' } });
  assert.equal(await current, true);
  assert.equal(opened.id, 'next');
});

test('un contributor autentificat poate deschide formularul de adăugare', () => {
  const canEdit = (currentUser) => vm.runInNewContext(`${partial('editor')}\ncanEditRecord(null)`, { currentUser, currentRole: 'viewer' });
  assert.equal(canEdit(null), false);
  assert.equal(canEdit({ id: 'contributor', email: 'contributor@example.test' }), true);
});

test('bundle-ul Jekyll este valid în ordinea declarată', () => {
  const loader = readFileSync(new URL('../../assets/moldoveneasca.js', import.meta.url), 'utf8');
  const source = [...loader.matchAll(/include_relative moldoveneasca\/(\S+)\.js/g)].map((match) => partial(match[1])).join('\n');
  assert.doesNotThrow(() => new vm.Script(source));
});

test('imaginile unei referințe se normalizează ca slide-uri cu descrieri proprii', () => {
  const source = partial('model');
  const { imageItems, imageDescriptionForDisplay } = vm.runInNewContext(`${source}\n({imageItems, imageDescriptionForDisplay})`, {
    URL,
    window: { location: { href: 'https://example.test/moldoveneasca/' } }
  });
  const gallery = imageItems({
    image_items: [
      {
        url: 'https://example.test/one.jpg',
        description: 'Pagina întâi',
        original_url: 'https://example.test/one-original.jpg',
        thumbnail_url: 'https://example.test/one-thumbnail.jpg'
      },
      { url: 'https://example.test/two.jpg', description: 'Pagina a doua' }
    ]
  });
  assert.equal(gallery.length, 2);
  assert.equal(gallery[0].url, 'https://example.test/one.jpg');
  assert.equal(gallery[0].description, 'Pagina întâi');
  assert.equal(gallery[0].original_url, 'https://example.test/one-original.jpg');
  assert.equal(gallery[0].thumbnail_url, 'https://example.test/one-thumbnail.jpg');
  assert.equal(gallery[1].url, 'https://example.test/two.jpg');
  assert.equal(gallery[1].description, 'Pagina a doua');
  const legacy = imageItems({ image_url: 'https://example.test/legacy.jpg' });
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].url, 'https://example.test/legacy.jpg');
  assert.equal(legacy[0].description, '');
  assert.equal(imageDescriptionForDisplay('Imagine migrată din câmpul Base64 existent.'), '');
  assert.equal(imageDescriptionForDisplay('Dovadă vizuală a sursei.'), '');
  assert.equal(imageDescriptionForDisplay('Pagina întâi — glotonimul subliniat'), 'Pagina întâi — glotonimul subliniat');
});

test('imaginile simultane împart cererea și nu umplu metadatele listei', async () => {
  let resolve;
  let calls = 0;
  const cache = new Map();
  const query = { select() { return this; }, eq() { return this; }, maybeSingle() {
    calls += 1;
    return new Promise((r) => { resolve = r; });
  } };
  const source = partial('images').split('  // 2400 px')[0];
  const api = vm.runInNewContext(`${source}\n({loadRecordImage,cacheRecordImage})`, {
    recordImageCache: cache, currentUser: null, supabaseClient: { from: () => query }
  });
  const record = { id: 'one' };
  const first = api.loadRecordImage(record);
  const second = api.loadRecordImage(record);
  assert.equal(calls, 1);
  resolve({ data: { image_url: 'data:image/png;base64,AAAA' } });
  assert.equal((await first).image_url, (await second).image_url);
  assert.equal(Object.hasOwn(record, 'image_url'), false);
  await api.loadRecordImage(record);
  assert.equal(calls, 1);
  for (let id = 0; id < 20; id += 1) api.cacheRecordImage(String(id), 'image');
  assert.equal(cache.size, 8);
  assert.equal(cache.has('one'), false);
});

test('imaginile noi sunt redimensionate la jumătate din lățime și înălțime', () => {
  const source = partial('images');
  const { imageTargetDimensions } = vm.runInNewContext(`${source}\n({imageTargetDimensions})`, {});
  const first = imageTargetDimensions(1314, 1072);
  const second = imageTargetDimensions(1539, 822);
  const capped = imageTargetDimensions(4000, 2000);
  assert.equal(first.width, 657);
  assert.equal(first.height, 536);
  assert.equal(second.width, 770);
  assert.equal(second.height, 411);
  assert.equal(capped.width, 1200);
  assert.equal(capped.height, 600);
});

test('o imagine care nu se încarcă nu devine imagine absentă în cache', async () => {
  const cache = new Map();
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { error: new Error('offline') }; } };
  const source = partial('images').split('  // 2400 px')[0];
  const { loadRecordImage } = vm.runInNewContext(`${source}\n({loadRecordImage})`, {
    recordImageCache: cache, currentUser: null, supabaseClient: { from: () => query }
  });
  await assert.rejects(loadRecordImage({ id: 'one' }), /offline/);
  assert.equal(cache.size, 0);
});

test('salvarea blochează dublul submit și permite reîncercarea după eroare', async () => {
  const button = { disabled: false };
  let finish;
  let requests = 0;
  let message = '';
  const values = new Map(Object.entries({ year_label: 'necunoscut', title: 'Sursă', quote: 'limba moldovenească', catalog_type: 'language' }));
  const api = repository('saveRecord, formPayload', {
    config: { mcpApiUrl: 'https://example.test' },
    editorForm: { querySelector: () => button }, editorPanel: { hidden: false },
    currentUser: { id: 'user', email: 'user@example.test' }, editingId: null,
    FormData: class { get(name) { return values.get(name); } },
    normalize: (value) => value.toLowerCase(), yearBoundsFromLabel: () => [null, null],
    catalogTypeValues: new Set(['language', 'ethnicity', 'both']), parseCenturyRange: () => null,
    imageValueWithinLimit: () => true, hasGlotonym: () => true,
    hasLanguageAndGlotonym: () => true, hasEthnicityEvidence: () => false,
    setStatus: (text) => { message = text; },
    supabaseClient: { auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) } },
    fetch: async (_url, options) => {
      requests += 1;
      const payload = JSON.parse(options.body);
      assert.equal(payload.year_start, null);
      assert.equal(payload.year_end, null);
      return new Promise((_resolve, reject) => { finish = () => reject(new Error('offline')); });
    }
  });
  const event = { preventDefault() {} };
  const first = api.saveRecord(event);
  await new Promise(setImmediate);
  await api.saveRecord(event);
  assert.equal(requests, 1);
  assert.equal(button.disabled, true);
  finish();
  await first;
  assert.equal(button.disabled, false);
  assert.match(message, /offline/);
  const retry = api.saveRecord(event);
  await new Promise(setImmediate);
  assert.equal(requests, 2);
  finish();
  await retry;
});
