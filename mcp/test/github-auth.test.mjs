import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGitHubAuthorizationUrl, createPkcePair, exchangeGitHubCode } from '../auth-github.mjs';

test('GitHub OAuth construiește URL-ul PKCE cu callback-ul local', () => {
  const { codeVerifier, codeChallenge } = createPkcePair();
  const parsed = new URL(buildGitHubAuthorizationUrl({
    url: 'https://supabase.test',
    redirectUrl: 'http://127.0.0.1:54321/callback',
    codeChallenge
  }));
  assert.equal(parsed.pathname, '/auth/v1/authorize');
  assert.equal(parsed.searchParams.get('provider'), 'github');
  assert.equal(parsed.searchParams.get('redirect_to'), 'http://127.0.0.1:54321/callback');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 's256');
  assert.equal(parsed.searchParams.get('code_challenge'), codeChallenge);
  assert.equal(parsed.searchParams.has('state'), false);
  assert.equal(createHash('sha256').update(codeVerifier).digest('base64url'), codeChallenge);
});

test('schimbul PKCE persistă contractul oficial Supabase Auth', async () => {
  let request;
  const session = await exchangeGitHubCode({
    url: 'https://supabase.test',
    key: 'anon-key',
    code: 'auth-code',
    codeVerifier: 'code-verifier',
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }));
    }
  });
  assert.equal(request.url, 'https://supabase.test/auth/v1/token?grant_type=pkce');
  assert.deepEqual(request.body, { auth_code: 'auth-code', code_verifier: 'code-verifier' });
  assert.equal(session.access_token, 'access');
});
