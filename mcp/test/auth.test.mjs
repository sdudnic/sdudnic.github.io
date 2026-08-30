import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseGateway } from '../auth.mjs';

const reference = {
  id: 'reference-1',
  year_label: '1643',
  year_start: 1643,
  year_end: 1643,
  title: 'Cazania',
  author: 'Varlaam',
  language: 'moldovenească',
  description: null,
  quote: 'limba moldovenească',
  source_type: 'carte',
  location: 'Iași',
  source_url: 'https://example.test/source',
  image_url: null,
  catalog_type: 'language',
  status: 'published',
  owner_id: 'owner-1'
};

function jsonResponse(data, status = 200) {
  return new Response(data === null ? '' : JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function gatewayFor({ email, role }) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, search: parsed.search, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (parsed.pathname === '/auth/v1/user') return jsonResponse({ id: email === 'sdudnic@gmail.com' ? 'owner-1' : 'contributor-1', email });
    if (parsed.pathname === '/rest/v1/profiles') return jsonResponse([{ id: email === 'sdudnic@gmail.com' ? 'owner-1' : 'contributor-1', email, role }]);
    if (parsed.pathname === '/rest/v1/language_references' && (options.method || 'GET') === 'GET') return jsonResponse([reference]);
    if (parsed.pathname === '/rest/v1/reference_moderation_requests' && options.method === 'POST') {
      return jsonResponse([{
        id: 'request-1',
        reference_id: reference.id,
        requested_by: 'contributor-1',
        request_type: calls.at(-1).body.request_type,
        proposed_changes: calls.at(-1).body.proposed_changes,
        target_snapshot: reference,
        reason: calls.at(-1).body.reason,
        status: 'pending'
      }]);
    }
    if (parsed.pathname === '/rest/v1/language_references' && options.method === 'DELETE') return jsonResponse(null);
    if (parsed.pathname === '/rest/v1/language_references' && options.method === 'PATCH') {
      return jsonResponse([{ ...reference, ...(JSON.parse(options.body || '{}')) }]);
    }
    return jsonResponse({ error: 'unexpected test request' }, 500);
  };
  return { gateway: new SupabaseGateway({ url: 'https://supabase.test', key: 'anon', fetchImpl }), calls };
}

test('non-admin edit becomes a moderation request', async () => {
  const { gateway, calls } = gatewayFor({ email: 'contributor@example.com', role: 'viewer' });
  const auth = await gateway.authenticate('contributor-token');
  const result = await gateway.updateReference(auth, reference.id, { title: 'Cazania — ediție verificată' }, 'Corectură propusă');
  assert.equal(result.moderated, true);
  assert.equal(result.request.request_type, 'edit');
  assert.match(result.message, /Editarea voastră este trimisă premoderare/);
  assert.equal(calls.at(-1).path, '/rest/v1/reference_moderation_requests');
});

test('non-admin delete becomes a deletion suggestion', async () => {
  const { gateway } = gatewayFor({ email: 'contributor@example.com', role: 'viewer' });
  const auth = await gateway.authenticate('contributor-token');
  const result = await gateway.deleteOrSuggest(auth, reference.id, 'Sursa trebuie reverificată.');
  assert.equal(result.moderated, true);
  assert.equal(result.request.request_type, 'delete');
  assert.match(result.message, /Sugestia de ștergere/);
});

test('only the primary owner performs an actual delete', async () => {
  const { gateway, calls } = gatewayFor({ email: 'sdudnic@gmail.com', role: 'admin' });
  const auth = await gateway.authenticate('owner-token');
  const result = await gateway.deleteOrSuggest(auth, reference.id);
  assert.equal(result.deleted, true);
  assert.equal(calls.at(-1).method, 'DELETE');
});

test('listUnverified returns only pending references', async () => {
  const { gateway, calls } = gatewayFor({ email: 'sdudnic@gmail.com', role: 'admin' });
  const auth = await gateway.authenticate('owner-token');
  const result = await gateway.listUnverified(auth);
  assert.equal(result.length, 1);
  assert.match(calls.at(-1).search, /status=eq\.pending/);
});

test('proprietarul poate muta o referință publicată în lista de neverificate', async () => {
  const { gateway, calls } = gatewayFor({ email: 'sdudnic@gmail.com', role: 'admin' });
  const auth = await gateway.authenticate('owner-token');
  const result = await gateway.updateReference(auth, reference.id, {
    status: 'pending'
  }, 'Citatul trebuie verificat în sursa primară.');
  assert.equal(result.reference.status, 'pending');
  assert.equal(calls.at(-1).body.status, 'pending');
});

test('un contributor nu poate propune schimbarea statutului unei referințe publicate', async () => {
  const { gateway, calls } = gatewayFor({ email: 'contributor@example.com', role: 'viewer' });
  const auth = await gateway.authenticate('contributor-token');
  const result = await gateway.updateReference(auth, reference.id, {
    status: 'pending',
    title: 'Titlu corectat'
  }, 'Necesită reverificare.');
  assert.equal(result.request.request_type, 'edit');
  assert.equal('status' in result.request.proposed_changes, false);
  assert.equal(calls.at(-1).path, '/rest/v1/reference_moderation_requests');
});

test('respinge o referință etnică fără sursă verificabilă', async () => {
  const { gateway } = gatewayFor({ email: 'sdudnic@gmail.com', role: 'admin' });
  const auth = await gateway.authenticate('owner-token');
  await assert.rejects(
    () => gateway.createReference(auth, {
      year_label: '1900',
      title: 'Moldoveni',
      quote: 'moldoveni',
      catalog_type: 'ethnicity'
    }),
    /source_url/
  );
});

test('respinge o imagine data URL peste limita de 1,5 MB', async () => {
  const { gateway } = gatewayFor({ email: 'sdudnic@gmail.com', role: 'admin' });
  const auth = await gateway.authenticate('owner-token');
  const oversizedImage = `data:image/jpeg;base64,${'A'.repeat(2_000_008)}`;
  await assert.rejects(
    () => gateway.createReference(auth, {
      year_label: '1900',
      title: 'Referință cu imagine prea mare',
      quote: 'limba moldovenească',
      image_url: oversizedImage
    }),
    (error) => error?.code === 'payload_too_large' && /1,5 MB/.test(error.message)
  );
});
