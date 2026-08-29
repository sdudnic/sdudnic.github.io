import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordSignIn, SupabaseSession } from '../auth-session.mjs';

test('login-ul Supabase folosește endpointul oficial password grant', async () => {
  let request;
  const session = await passwordSignIn({
    url: 'https://supabase.test',
    key: 'anon-key',
    email: 'sdudnic@gmail.com',
    password: 'secret',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user: { email: 'sdudnic@gmail.com' } }));
    }
  });
  assert.equal(request.url, 'https://supabase.test/auth/v1/token?grant_type=password');
  assert.equal(request.body.email, 'sdudnic@gmail.com');
  assert.equal(request.body.password, 'secret');
  assert.equal(session.access_token, 'access');
  assert.equal(session.refresh_token, 'refresh');
});

test('sesiunea locală reînnoiește refresh tokenul și îl persistă', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moldoveneasca-session-'));
  try {
    const filePath = join(directory, 'session.json');
    await writeFile(filePath, JSON.stringify({ access_token: 'expired', refresh_token: 'old-refresh', expires_at: 1 }));
    const calls = [];
    const gateway = { async authenticate(token) { return { token }; } };
    const session = new SupabaseSession({
      url: 'https://supabase.test',
      key: 'anon-key',
      filePath,
      gateway,
      fetchImpl: async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'new-refresh', expires_in: 3600 }));
      }
    });
    assert.deepEqual(await session.authenticate(), { token: 'fresh' });
    assert.deepEqual(await session.authenticate(), { token: 'fresh' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.refresh_token, 'old-refresh');
    const saved = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(saved.refresh_token, 'new-refresh');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
