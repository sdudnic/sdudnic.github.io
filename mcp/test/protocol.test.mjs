import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRpc } from '../protocol.mjs';

const rows = [{ id: 'x', year_label: '1643', year_start: 1643, title: 'Cazania', author: 'Varlaam', quote: 'limba moldovenească', language: 'moldovenească', status: 'published', catalog_type: 'language' }];
const store = {
  async search(input) { return { items: rows, total: 1, input }; },
  async get(id) { return id === 'x' ? rows[0] : null; },
  async statistics() { return { total: 1, published: 1 }; }
};
const context = { store, gateway: {}, authenticate: async () => { throw new Error('not expected'); } };

test('răspunde la initialize și tools/list', async () => {
  const initialized = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, context);
  assert.equal(initialized.result.serverInfo.name, 'moldoveneasca-references');
  const tools = await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, context);
  assert.ok(tools.result.tools.some((tool) => tool.name === 'search_moldoveneasca_references'));
});

test('apelează un instrument de căutare și returnează structuredContent', async () => {
  const response = await handleRpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_moldoveneasca_references', arguments: { q: 'cazania' } } }, context);
  assert.equal(response.result.isError, undefined);
  assert.equal(response.result.structuredContent.total, 1);
});

test('instrumentul de contribuție returnează eroare controlată fără autentificare', async () => {
  const response = await handleRpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'add_moldoveneasca_reference', arguments: { year_label: '1900', title: 'Titlu', quote: 'limba moldovenească' } } }, context);
  assert.equal(response.result.isError, true);
});

test('invalidează cache-ul după o modificare de moderare', async () => {
  let invalidations = 0;
  const reviewStore = { invalidate() { invalidations += 1; } };
  const reviewContext = {
    store: reviewStore,
    gateway: { reviewReference: async () => ({ action: 'published' }) },
    authenticate: async () => ({})
  };
  const response = await handleRpc({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'review_moldoveneasca_reference', arguments: { id: 'x', action: 'publish', note: 'ok' } }
  }, reviewContext);
  assert.equal(response.result.isError, undefined);
  assert.equal(invalidations, 1);
});
